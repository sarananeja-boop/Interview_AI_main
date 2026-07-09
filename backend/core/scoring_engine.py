"""
Evaluation & Scoring Engine.

Generates comprehensive 12-dimension scoring after interview completion.
Uses the full conversation log + memory state to produce:
- Per-dimension scores (0-10)
- Overall weighted score
- Weak answer rewrites
- Actionable improvement plan
- Panel perception narrative
"""

import json
import logging
import re

from core.llm_provider import llm
from models.evaluation import EvaluationResult, SCORING_DIMENSIONS

logger = logging.getLogger(__name__)

# Max retries for incomplete/malformed evaluation output
MAX_EVAL_RETRIES = 2


def _detect_broken_webcam(behavioral_metrics: dict | None) -> bool:
    """
    Detect if webcam face tracking failed (bug, not reality).
    
    Pattern: face-based metrics are all 0.0 but shoulder_alignment
    (from PoseLandmarker, which is independent) has valid data.
    This means the webcam IS working but FaceLandmarker isn't detecting faces.
    """
    if not behavioral_metrics:
        return False
    
    face_metrics_zero = (
        behavioral_metrics.get("eye_contact_score", 0) == 0 and
        behavioral_metrics.get("posture_score", 0) == 0 and
        behavioral_metrics.get("movement_stability", 0) == 0 and
        behavioral_metrics.get("face_visible_pct", 0) == 0
    )
    shoulder_works = behavioral_metrics.get("shoulder_alignment", 0) > 0.3
    has_telemetry = behavioral_metrics.get("total_telemetry_windows", 0) > 5
    
    return face_metrics_zero and (shoulder_works or has_telemetry)


def _normalize_dimension_name(name: str) -> str:
    """
    Normalize dimension names to snake_case to match SCORING_DIMENSIONS.
    Handles title case ("Leadership Presence") and other variations.
    """
    # Already snake_case
    if "_" in name and name == name.lower():
        return name
    # Convert spaces/hyphens to underscores, lowercase
    normalized = re.sub(r'[\s\-]+', '_', name.strip()).lower()
    return normalized


def _validate_and_repair_evaluation(eval_data: dict) -> tuple[dict, list[str]]:
    """
    Validate evaluation output and attempt to repair common issues.
    
    Returns:
        (repaired_data, list_of_issues) - issues is empty if output was valid
    """
    issues = []
    
    # --- Validate dimension_scores ---
    dimensions = eval_data.get("dimension_scores", [])
    
    # Normalize dimension names
    for d in dimensions:
        original_name = d.get("dimension", "")
        normalized = _normalize_dimension_name(original_name)
        if normalized != original_name:
            d["dimension"] = normalized
            issues.append(f"Normalized dimension '{original_name}' → '{normalized}'")
    
    # Check for missing dimensions
    # First, remove any dimensions NOT in SCORING_DIMENSIONS (LLM hallucinations)
    valid_dimensions = [d for d in dimensions if d.get("dimension") in SCORING_DIMENSIONS]
    removed = len(dimensions) - len(valid_dimensions)
    if removed > 0:
        removed_names = [d.get("dimension") for d in dimensions if d.get("dimension") not in SCORING_DIMENSIONS]
        issues.append(f"Removed {removed} unknown dimensions: {removed_names}")
        dimensions = valid_dimensions
    
    present_dims = {d.get("dimension") for d in dimensions}
    missing_dims = [d for d in SCORING_DIMENSIONS if d not in present_dims]
    
    if missing_dims:
        issues.append(f"Missing {len(missing_dims)} dimensions: {missing_dims}")
        
        # Calculate fallback score from existing dimensions
        existing_scores = [d.get("score", 5.0) for d in dimensions if isinstance(d.get("score"), (int, float))]
        fallback_score = sum(existing_scores) / len(existing_scores) if existing_scores else 5.0
        
        # Add missing dimensions with fallback
        for dim in missing_dims:
            dimensions.append({
                "dimension": dim,
                "score": round(fallback_score, 1),
                "reasoning": f"Score interpolated from other dimensions ({fallback_score:.1f}/10). The evaluator did not provide a specific assessment for this dimension."
            })
    
    # Remove duplicate dimensions (keep first occurrence)
    seen = set()
    deduped = []
    for d in dimensions:
        dim_name = d.get("dimension", "")
        if dim_name not in seen:
            seen.add(dim_name)
            deduped.append(d)
    if len(deduped) < len(dimensions):
        issues.append(f"Removed {len(dimensions) - len(deduped)} duplicate dimensions")
    dimensions = deduped
    
    eval_data["dimension_scores"] = dimensions
    
    # --- Validate overall_score ---
    overall = eval_data.get("overall_score")
    if not isinstance(overall, (int, float)) or overall < 0 or overall > 10:
        scores = [d.get("score", 5.0) for d in dimensions if isinstance(d.get("score"), (int, float))]
        eval_data["overall_score"] = round(sum(scores) / len(scores), 1) if scores else 5.0
        issues.append(f"Recalculated overall_score from dimensions: {eval_data['overall_score']}")
    
    # --- Validate required string fields ---
    if not eval_data.get("overall_assessment") or len(str(eval_data.get("overall_assessment", ""))) < 20:
        issues.append("overall_assessment is missing or too short")
    
    if not eval_data.get("panel_perception") or len(str(eval_data.get("panel_perception", ""))) < 20:
        issues.append("panel_perception is missing or too short")
    
    if not eval_data.get("candidate_potential") or len(str(eval_data.get("candidate_potential", ""))) < 20:
        issues.append("candidate_potential is missing or too short")
    
    # --- Validate weak_answers ---
    weak_answers = eval_data.get("weak_answers", [])
    if not isinstance(weak_answers, list):
        eval_data["weak_answers"] = []
        issues.append("weak_answers was not a list")
    
    # --- Validate strengths ---
    strengths = eval_data.get("strengths", [])
    if not isinstance(strengths, list):
        eval_data["strengths"] = []
        issues.append("strengths was not a list")
    
    # --- Validate improvement_plan ---
    improvement_plan = eval_data.get("improvement_plan", [])
    if not isinstance(improvement_plan, list):
        eval_data["improvement_plan"] = []
        issues.append("improvement_plan was not a list")
    elif len(improvement_plan) < 5:
        issues.append(f"improvement_plan has only {len(improvement_plan)} items (need 5-7)")
    
    # --- Ensure high_risk_areas exists ---
    if "high_risk_areas" not in eval_data:
        eval_data["high_risk_areas"] = []
    
    return eval_data, issues


def _is_evaluation_critically_incomplete(eval_data: dict) -> bool:
    """Check if the evaluation is so incomplete it needs a full retry."""
    dimensions = eval_data.get("dimension_scores", [])
    strengths = eval_data.get("strengths", [])
    weak_answers = eval_data.get("weak_answers", [])
    improvement_plan = eval_data.get("improvement_plan", [])
    
    # Missing more than half the dimensions = critically incomplete
    if len(dimensions) < 6:
        return True
    
    # Zero strengths AND zero weak answers = LLM basically didn't analyze the transcript
    if len(strengths) == 0 and len(weak_answers) == 0:
        return True
    
    # No improvement plan at all
    if len(improvement_plan) == 0:
        return True
    
    return False


async def evaluate_interview(
    conversation_log: list[dict],
    profile: dict,
    memory_state: dict,
    behavioral_metrics: dict | None = None
) -> dict:
    """
    Generate comprehensive evaluation of a completed interview.

    Args:
        conversation_log: Full list of conversation turns
        profile: Parsed candidate profile
        memory_state: Final memory state (claims, contradictions, weak answers)

    Returns:
        EvaluationResult as dict
    """

    # Format conversation for the evaluator
    conversation_text = _format_conversation(conversation_log)
    memory_summary = _format_memory_summary(memory_state)
    
    # Count candidate turns for context
    candidate_turns = [t for t in conversation_log if t.get("role") == "candidate"]
    num_candidate_responses = len(candidate_turns)

    system_prompt = f"""You are a neutral, fair, and balanced senior IIM interview evaluation system. You have just observed a complete mock interview and must produce an accurate, objective evaluation. You should provide constructive criticism without being overly harsh or lenient.

SCORING DIMENSIONS — you MUST score ALL 12 dimensions below. If you skip any, your output will be rejected:
{chr(10).join(f"- {d} (use this EXACT snake_case name)" for d in SCORING_DIMENSIONS)}

SCORING CALIBRATION — READ CAREFULLY:
- 0-1: Disastrous. Candidate was insulting, gave nonsensical answers, refused to engage, or showed open hostility.
- 2-3: Very poor. Candidate gave one-word or irrelevant answers, showed no preparation, dodged questions repeatedly.
- 4-5: Below average. Candidate attempted answers but lacked depth, substance, or structure. Would not pass an IIM panel.
- 6: Average. Acceptable but unremarkable. Basic answers with some substance.
- 7: Good. Clear, structured answers with genuine insight. Would make a positive impression.
- 8: Very good. Impressive depth, strong articulation, demonstrates leadership and self-awareness.
- 9-10: Exceptional. Top 5% of all candidates. Reserve this for truly outstanding performances.

CURRENT AFFAIRS EVALUATION NOTE:
- The dimension "business_awareness" also covers CURRENT AFFAIRS awareness.
- If the candidate was asked about current events, geopolitics, hometown knowledge, or their declared interests, factor their depth and accuracy into the business_awareness score.
- If they couldn't answer basic questions about their own city/state (like who the CM is), that's a significant gap.
- If they declared an interest (e.g., geopolitics) but couldn't demonstrate depth, penalize authenticity and business_awareness.

EVALUATION GUIDELINES (MERIT-BASED & STRICT SCORING):
1. Use the FULL 1.0 to 10.0 scale. Be highly critical. Do NOT default to average scores. If an answer is vague or short, it should receive a 4.0 or lower.
2. SUBSTANCE OVER FORM: If the answer has genuine insight but lacks structure, penalize `logical_structure`, but reward substance. Do NOT downgrade the entire score to 1-3.
3. EXHAUSTIVE WEAK ANSWERS: You MUST include ALL weak, short, or wrong answers in the `weak_answers` list. Provide exact transcript quotes in the `original` field. Do not summarize or skip any.
4. EXHAUSTIVE STRENGTHS: You MUST include at least 2 strengths if the candidate said anything reasonable. Even a mediocre interview has some positives. Quote the candidate's exact words.
5. QUOTE THE TRANSCRIPT: For every dimension reasoning and assessment, explicitly quote the candidate's exact words from the transcript to justify your score.
6. NO HALLUCINATION: NEVER quote the CANDIDATE PROFILE as an answer. The CANDIDATE PROFILE is just background information. You must ONLY quote from the INTERVIEW TRANSCRIPT. If the transcript is very short or empty, do not invent answers from the profile.
7. The `overall_score` should be a weighted average where substance dimensions carry 1.5x weight vs. style dimensions.
8. The `improvement_plan` MUST contain exactly 5-7 specific, actionable items. Not 3, not 2 — at least 5.

You MUST output your evaluation in the EXACT following JSON format:
{{
  "dimension_scores": [
    {{"dimension": "communication_clarity", "score": 4.2, "reasoning": "Candidate said '...' which shows..."}},
    {{"dimension": "confidence", "score": 3.5, "reasoning": "..."}},
    {{"dimension": "logical_structure", "score": 5.0, "reasoning": "..."}},
    {{"dimension": "authenticity", "score": 6.0, "reasoning": "..."}},
    {{"dimension": "leadership_presence", "score": 3.0, "reasoning": "..."}},
    {{"dimension": "pressure_handling", "score": 4.0, "reasoning": "..."}},
    {{"dimension": "technical_depth", "score": 5.5, "reasoning": "..."}},
    {{"dimension": "business_awareness", "score": 4.0, "reasoning": "..."}},
    {{"dimension": "answer_precision", "score": 3.5, "reasoning": "..."}},
    {{"dimension": "composure", "score": 5.0, "reasoning": "..."}},
    {{"dimension": "listening_ability", "score": 6.0, "reasoning": "..."}},
    {{"dimension": "speaking_fluency", "score": 4.5, "reasoning": "..."}}
  ],
  "overall_score": 4.5,
  "overall_assessment": "A detailed 3-5 sentence overall assessment of the candidate's performance...",
  "weak_answers": [
    {{"turn_number": 2, "original": "[EXACT QUOTE from transcript]", "issue": "What was weak about this answer", "suggested_rewrite": "A better way to phrase this answer"}}
  ],
  "strengths": [
    {{"turn_number": 3, "original": "[EXACT QUOTE from transcript]", "strength": "What was strong", "impact": "Why this matters"}}
  ],
  "improvement_plan": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"],
  "panel_perception": "How the panel likely perceived this candidate (3-4 sentences)...",
  "candidate_potential": "Assessment of the candidate's upside and underlying merit (2-3 sentences)...",
  "high_risk_areas": ["Topic 1", "Topic 2"]
}}

CRITICAL RULES:
- Use EXACTLY the snake_case dimension names shown above (e.g., "communication_clarity", NOT "Communication Clarity")
- Include ALL 12 dimensions — no exceptions
- All scores shown above are PLACEHOLDERS. Calculate real scores based on the transcript.
- The "improvement_plan" MUST have 5-7 items
- The "strengths" MUST have at least 2 entries if the candidate answered more than 2 questions
"""

    # Build behavioral context — detect and skip broken webcam data
    behavioral_context = ""
    webcam_broken = _detect_broken_webcam(behavioral_metrics)
    
    if behavioral_metrics and not webcam_broken:
        # Valid webcam data — include it
        avg_eye = behavioral_metrics.get("eye_contact_score", 0) * 100
        avg_posture = behavioral_metrics.get("shoulder_alignment", behavioral_metrics.get("posture_score", 0)) * 100
        avg_stability = behavioral_metrics.get("movement_stability", 0) * 100
        face_left = behavioral_metrics.get("total_telemetry_windows", 1) * (1 - behavioral_metrics.get("face_visible_pct", 1))
        looking_down_count = behavioral_metrics.get("looking_down_count", 0)
        multiple_people_detected = behavioral_metrics.get("multiple_people_detected", False)
        
        behavioral_context = f"""
BEHAVIORAL OBSERVATIONS (from webcam analysis — use to COMPLEMENT your scoring, not as standalone):
- Average Eye Contact: {avg_eye:.1f}% (poor eye contact suggests low confidence or evasion)
- Real Posture Score (Shoulder Alignment): {avg_posture:.1f}% (low means slouching or uneven shoulders)
- Face Stability: {avg_stability:.1f}% (low means high fidgeting or nervousness)
- Face Left Frame: ~{int(face_left)} times (could indicate checking notes)
- Looking Down While Speaking: {looking_down_count} times
{f'- CRITICAL VIOLATION: A cell phone was detected in the webcam frame.' if behavioral_metrics.get("phone_violation") else ''}

INTEGRATION RULES:
- Poor eye contact + weak verbal answers -> lower "confidence" and "composure" scores
- High fidgeting alone does NOT lower scores unless paired with verbal hesitation.
{f'- CRITICAL VIOLATION: A cell phone was detected in the webcam frame. You MUST reduce marks in the behavioral analysis section (e.g., composure, confidence, professionalism). Include a short note telling them they were found using their phone and that this could result in disqualification in a real interview.' if behavioral_metrics.get("phone_violation") else ''}
{f'- CRITICAL VIOLATION: An inappropriate gesture (middle finger) was detected in the webcam frame. You MUST heavily penalize professionalism, composure, and confidence, scoring them below 3. Mention this inappropriate behavior explicitly in the evaluation.' if behavioral_metrics.get("inappropriate_gesture") else ''}
{f'- CRITICAL VIOLATION: Multiple people were detected in the webcam frame. This suggests the candidate may have had assistance during the interview. You MUST penalize composure, authenticity, and professionalism.' if multiple_people_detected else ''}
"""
    elif webcam_broken:
        # Webcam face tracking was broken — don't let 0% metrics poison the evaluation
        logger.warning("Detected broken webcam face tracking (all face metrics 0% but shoulder/telemetry works). Skipping face-based behavioral metrics.")
        shoulder = behavioral_metrics.get("shoulder_alignment", 0) * 100 if behavioral_metrics else 0
        behavioral_context = f"""
BEHAVIORAL OBSERVATIONS: Webcam face tracking was unavailable for this session due to a technical issue. 
Only shoulder/posture data is available: Shoulder Alignment: {shoulder:.1f}%.
Evaluate the candidate based ENTIRELY on the quality of their verbal responses in the transcript. Do NOT penalize for missing webcam data.
"""

    user_message = f"""CANDIDATE PROFILE:
{json.dumps(profile, indent=2, default=str)}

INTERVIEW TRANSCRIPT ({num_candidate_responses} candidate responses):
{conversation_text}

INTERVIEW ANALYTICS:
{memory_summary}
{behavioral_context}
TASK: Evaluate this interview fairly and objectively. Do not artificially inflate or deflate scores. Base your evaluation entirely on the strength of the candidate's responses. You MUST include ALL 12 dimension scores, at least 2 strengths, and 5-7 improvement items. Output ONLY valid JSON, no markdown formatting.
"""

    # Retry loop for incomplete evaluations
    last_result = None
    for attempt in range(MAX_EVAL_RETRIES + 1):
        try:
            result = await llm.generate(
                system_prompt=system_prompt,
                user_message=user_message,
                schema=EvaluationResult,
                temperature=0.2,  # Low temp for consistent, rigorous scoring
            )
            
            eval_data = result if isinstance(result, dict) else result.model_dump() if hasattr(result, 'model_dump') else result
            
            # Validate and repair
            eval_data, issues = _validate_and_repair_evaluation(eval_data)
            
            if issues:
                logger.warning(f"Evaluation validation issues (attempt {attempt+1}): {issues}")
            
            # Check if critically incomplete and should retry
            if _is_evaluation_critically_incomplete(eval_data) and attempt < MAX_EVAL_RETRIES:
                logger.warning(f"Evaluation critically incomplete (attempt {attempt+1}/{MAX_EVAL_RETRIES+1}), retrying...")
                last_result = eval_data  # Save in case all retries fail
                continue
            
            return eval_data
            
        except Exception as e:
            logger.error(f"Evaluation generation attempt {attempt+1} failed: {e}")
            if attempt >= MAX_EVAL_RETRIES:
                if last_result:
                    logger.warning("Returning best incomplete evaluation after all retries failed")
                    return last_result
                raise
    
    # Should not reach here, but safety net
    if last_result:
        return last_result
    raise Exception("Evaluation generation failed after all retries")


def _format_conversation(log: list[dict]) -> str:
    """Format conversation log into readable transcript."""
    lines = []
    for turn in log:
        role = "INTERVIEWER" if turn.get("role") == "interviewer" else "CANDIDATE"
        content = turn.get("content", "")
        turn_num = turn.get("turn_number", "?")
        stage = turn.get("stage", "")
        flags = ""
        meta = turn.get("metadata", {})
        if meta:
            flag_list = [f"[{k.upper()}]" for k, v in meta.items() if v]
            flags = " ".join(flag_list)
        lines.append(f"[Turn {turn_num} | {stage}] {role}: {content} {flags}".strip())
    return "\n\n".join(lines)


def _format_memory_summary(memory: dict) -> str:
    """Format memory state into evaluation context."""
    lines = [
        f"Total turns: {memory.get('turn_count', 0)}",
        f"Final pressure level: {memory.get('pressure_level', 0):.2f}",
        f"Weak answers: {len(memory.get('weak_answers', []))} (at turns: {memory.get('weak_answers', [])})",
        f"Strong answers: {len(memory.get('strong_answers', []))}",
        f"Contradictions detected: {len(memory.get('contradictions', []))}",
        f"Total claims tracked: {len(memory.get('claims', []))}",
    ]

    if memory.get("contradictions"):
        lines.append("\nContradictions:")
        for c in memory["contradictions"]:
            lines.append(f"  - {c.get('description', 'unknown')} (turns {c.get('turns', [])})")

    return "\n".join(lines)

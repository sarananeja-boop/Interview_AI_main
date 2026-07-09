"""
Question Engine — Profile-Aware Question Selection & Personalization.

This is NOT a generic chatbot. The engine:
1. Loads question templates from the seed bank
2. Classifies the candidate's profile type (engineer, fresher, career_switcher, etc.)
3. Filters and ranks questions based on profile fit
4. Personalizes template variables ({role}, {company}, {field}) with real profile data
5. Returns questions tailored to this specific candidate

The LLM then uses these as *inspiration*, not scripts — adapting in real-time.
"""

import json
import logging
import random
from pathlib import Path
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)

# Resolve questions directory
QUESTIONS_DIR = Path(settings.UPLOAD_DIR).parent / "questions"

# Categories in order of interview flow
CATEGORY_ORDER = [
    "warmup",
    "academic",
    "work_experience",
    "hometown_regional",
    "why_mba",
    "iim_specific",
    "behavioral",
    "situational",
    "googly",
    "technical",
    "current_affairs",
    "interest_probe",
    "hobbies_personality",
    "pressure",
]


def _load_all_questions() -> dict[str, list[dict]]:
    """Load all question JSON files from the seed bank."""
    bank: dict[str, list[dict]] = {}

    for category in CATEGORY_ORDER:
        path = QUESTIONS_DIR / f"{category}.json"
        if path.exists():
            with open(path, "r") as f:
                bank[category] = json.load(f)
            logger.info(f"Loaded {len(bank[category])} questions from {category}.json")
        else:
            bank[category] = []
            logger.warning(f"Question file not found: {path}")

    total = sum(len(qs) for qs in bank.values())
    logger.info(f"Question bank loaded: {total} total questions across {len(bank)} categories")
    return bank


# Load once at import time
_question_bank = _load_all_questions()


def classify_profile(profile: dict) -> list[str]:
    """
    Classify a candidate's profile into one or more profile types.
    This determines which questions are relevant.

    Returns list of profile_type tags like ["engineer", "experienced", "career_switcher"]
    """
    types = ["all"]  # Every profile gets "all" questions
    parsed = profile.get("parsed_profile", profile)

    # --- Education-based classification ---
    education = parsed.get("education", [])
    if education:
        fields = [e.get("field", "").lower() for e in education if isinstance(e, dict)]
        degrees = [e.get("degree", "").lower() for e in education if isinstance(e, dict)]

        engineering_keywords = ["engineering", "computer", "mechanical", "electrical", "civil",
                                "electronics", "btech", "b.tech", "be", "b.e"]
        science_keywords = ["science", "physics", "chemistry", "biology", "mathematics", "bsc", "b.sc"]
        commerce_keywords = ["commerce", "accounting", "finance", "bcom", "b.com", "ca", "economics"]
        arts_keywords = ["arts", "humanities", "literature", "sociology", "psychology", "ba", "b.a"]

        all_fields = " ".join(fields + degrees)
        if any(kw in all_fields for kw in engineering_keywords):
            types.append("engineer")
            types.append("tech")
        if any(kw in all_fields for kw in science_keywords):
            types.append("science")
        if any(kw in all_fields for kw in commerce_keywords):
            types.append("commerce")
        if any(kw in all_fields for kw in arts_keywords):
            types.append("arts")

        # Check academic performance
        for edu in education:
            if isinstance(edu, dict):
                score_str = str(edu.get("score", "")).replace("%", "").strip()
                try:
                    score = float(score_str)
                    if score < 7.0 and score > 0:  # CGPA below 7
                        types.append("low_academic")
                    elif score < 60 and score > 10:  # Percentage below 60
                        types.append("low_academic")
                except (ValueError, TypeError):
                    pass

                # Check institution tier
                tier1 = ["iit", "nit", "bits", "iiit", "srcc", "stephens", "lsr", "presidency"]
                institution = str(edu.get("institution", "")).lower()
                if any(t in institution for t in tier1):
                    types.append("tier1_college")

    # --- Work experience classification ---
    work = parsed.get("work_experience", [])
    if work and len(work) > 0:
        types.append("experienced")

        # Count total years roughly
        total_companies = len(work)
        if total_companies >= 3:
            types.append("job_hopper")

        # Check for leadership roles
        leadership_keywords = ["lead", "manager", "head", "director", "vp", "founder", "co-founder",
                                "team lead", "senior", "principal"]
        for w in work:
            if isinstance(w, dict):
                role = str(w.get("role", "")).lower()
                if any(kw in role for kw in leadership_keywords):
                    types.append("leadership")
                    break

        # Check for tech roles
        tech_roles = ["developer", "engineer", "programmer", "data scientist", "analyst",
                      "devops", "architect", "sde", "swe"]
        for w in work:
            if isinstance(w, dict):
                role = str(w.get("role", "")).lower()
                if any(kw in role for kw in tech_roles):
                    types.append("tech")
                    break
    else:
        types.append("fresher")

    # --- Skills-based classification ---
    skills = parsed.get("skills", [])
    skills_str = " ".join(s.lower() for s in skills if isinstance(s, str))
    if any(kw in skills_str for kw in ["machine learning", "deep learning", "nlp", "tensorflow", "pytorch"]):
        types.append("ai_ml")
        types.append("data_science")

    # --- Career goals classification ---
    career_goals = str(parsed.get("career_goals", "")).lower()
    current_field = ""
    if work:
        current_field = str(work[-1].get("role", "")).lower() if isinstance(work[-1], dict) else ""

    if career_goals:
        # Check for career switch
        switch_keywords = ["switch", "transition", "pivot", "change", "move into", "shift"]
        if any(kw in career_goals for kw in switch_keywords):
            types.append("career_switcher")

        # Check for entrepreneurship
        if any(kw in career_goals for kw in ["startup", "entrepreneur", "found", "venture"]):
            types.append("entrepreneur")

    # Deduplicate
    return list(set(types))


def personalize_question(question_template: dict, profile: dict) -> str:
    """
    Fill in template variables with actual profile data.

    Handles: {role}, {company}, {field}, {institution}, {score_value}, {skill},
    {hobby}, {duration}, {career_goal}, {cat_score}, {achievement}, etc.
    """
    text = question_template["text"]
    parsed = profile.get("parsed_profile", profile)

    # Education data
    education = parsed.get("education", [])
    if education and isinstance(education[0], dict):
        edu = education[0]
        text = text.replace("{field}", str(edu.get("field", "your field")))
        text = text.replace("{institution}", str(edu.get("institution", "your college")))
        text = text.replace("{score_value}", str(edu.get("score", "your score")))
        text = text.replace("{score_type}", "CGPA" if "." in str(edu.get("score", "")) else "score")
        text = text.replace("{degree}", str(edu.get("degree", "your degree")))

    # Work experience data
    work = parsed.get("work_experience", [])
    if work and isinstance(work[0], dict):
        w = work[0]  # Most recent
        text = text.replace("{role}", str(w.get("role", "your role")))
        text = text.replace("{company}", str(w.get("company", "your company")))
        text = text.replace("{duration}", str(w.get("duration", "your tenure")))
        text = text.replace("{industry}", str(w.get("industry", "your industry")))

        # Achievements
        achievements = w.get("achievements", w.get("responsibilities", []))
        if achievements and isinstance(achievements, list):
            text = text.replace("{achievement}", str(achievements[0]))
        else:
            text = text.replace("{achievement}", "your key achievement")

        # Project type
        text = text.replace("{project_type}", str(w.get("project", "project")))

    # Count work entries for job hopper detection
    text = text.replace("{n}", str(len(work)))
    if work:
        years = len(work)  # Rough estimate
        text = text.replace("{years}", str(years))

    # Skills
    skills = parsed.get("skills", [])
    if skills:
        text = text.replace("{skill}", str(skills[0]))
        text = text.replace("{technology}", str(skills[0]))
    else:
        text = text.replace("{skill}", "your primary skill")
        text = text.replace("{technology}", "your technology stack")

    # Hobbies
    hobbies = parsed.get("hobbies", parsed.get("extracurriculars", []))
    if hobbies:
        text = text.replace("{hobby}", str(hobbies[0]))
        text = text.replace("{sport}", str(hobbies[0]))
        text = text.replace("{extracurricular}", str(hobbies[0]))
        text = text.replace("{leadership_activity}", str(hobbies[0]))
    else:
        text = text.replace("{hobby}", "your interests")

    # Career goals
    career_goals = parsed.get("career_goals", "")
    text = text.replace("{career_goal}", str(career_goals) if career_goals else "your career aspiration")
    text = text.replace("{desired_field}", str(career_goals) if career_goals else "your target field")
    text = text.replace("{current_field}", str(work[0].get("role", "your current field")) if work else "your current domain")

    # CAT score
    cat_score = parsed.get("cat_score", "")
    text = text.replace("{cat_score}", str(cat_score) if cat_score else "your CAT score")

    # Hometown
    text = text.replace("{hometown}", str(parsed.get("hometown", "your hometown")))

    # State
    text = text.replace("{state}", str(parsed.get("state", "your state")))
    
    # Interests
    interests = parsed.get("interests", [])
    text = text.replace("{interest}", str(interests[0]) if interests else "your area of interest")
    
    # Dynamic current affairs placeholders
    text = text.replace("{headline}", "a recent major news event")
    text = text.replace("{hot_topic}", "a significant current development")
    text = text.replace("{cm}", "the Chief Minister of your state")
    text = text.replace("{governor}", "the Governor of your state")
    text = text.replace("{mp}", "your local Member of Parliament")
    text = text.replace("{geopolitical_event}", "current geopolitical tensions")

    # IIM-specific
    text = text.replace("{target_iim}", str(parsed.get("target_iim", "this IIM")))
    text = text.replace("{competitor_iim}", "IIM Bangalore" if "ahmedabad" in str(parsed.get("target_iim", "")).lower() else "IIM Ahmedabad")

    # Generic fallbacks for any remaining placeholders
    text = text.replace("{organization}", "your organization")
    text = text.replace("{salary}", "a good package")
    text = text.replace("{short_or_long}", "notable")
    text = text.replace("{gap_duration}", "a gap")
    text = text.replace("{event_1}", "your previous role")
    text = text.replace("{event_2}", "your current position")
    text = text.replace("{policy_event}", "the Union Budget proposals")
    text = text.replace("{attempt_number}", "most recent")

    return text


def get_questions_for_profile(
    profile: dict,
    stage: str = "core_questioning",
    count: int = 3,
    exclude_ids: Optional[list[str]] = None,
    covered_categories: Optional[list[str]] = None,
) -> list[str]:
    """
    Get personalized questions for a specific candidate profile and interview stage.

    CRITICAL: Enforces category rotation so the interview doesn't get stuck on one topic.
    Each call tries to pull questions from DIFFERENT categories than what's been covered recently.

    Args:
        profile: The candidate's parsed profile + intelligence data
        stage: Current interview stage (warmup, core_questioning, pressure_round, etc.)
        count: Number of questions to return
        exclude_ids: Question IDs already asked (to avoid repetition)
        covered_categories: Categories already covered recently (for diversity enforcement)

    Returns:
        List of personalized question strings
    """
    if exclude_ids is None:
        exclude_ids = []
    if covered_categories is None:
        covered_categories = []

    # 1. Classify the profile
    profile_types = classify_profile(profile)
    logger.info(f"Profile classified as: {profile_types}")

    # 2. Map stage to relevant categories
    stage_categories = _get_stage_categories(stage)

    # 3. Sort categories to prioritize ones NOT yet covered (round-robin)
    # Categories that appear less in covered_categories come first
    category_counts = {}
    for cat in covered_categories:
        category_counts[cat] = category_counts.get(cat, 0) + 1
    
    sorted_categories = sorted(
        stage_categories,
        key=lambda c: category_counts.get(c, 0)  # least-covered first
    )

    # 4. Collect questions, taking ONE from each category in rotation
    selected: list[tuple[float, dict]] = []
    for category in sorted_categories:
        if len(selected) >= count:
            break
            
        # Get eligible questions from this category
        candidates_in_cat = []
        for q in _question_bank.get(category, []):
            if q["id"] in exclude_ids:
                continue
            q_types = q.get("profile_types", ["all"])
            if "all" in q_types or any(pt in profile_types for pt in q_types):
                required = q.get("requires_profile_field", "")
                if required:
                    parsed = profile.get("parsed_profile", profile)
                    if not parsed.get(required):
                        continue
                candidates_in_cat.append(q)

        if candidates_in_cat:
            # Score and pick the best from this category
            scored = [((_score_question(q, profile_types, stage), q)) for q in candidates_in_cat]
            scored.sort(key=lambda x: x[0], reverse=True)
            # Pick from top 10 with some randomness
            top = scored[:10]
            random.shuffle(top)
            pick = top[0]
            selected.append(pick)
            # Track the category as covered
            covered_categories.append(category)

    # 5. If we still need more, do a second pass on all categories
    if len(selected) < count:
        for category in sorted_categories:
            if len(selected) >= count:
                break
            for q in _question_bank.get(category, []):
                if len(selected) >= count:
                    break
                if q["id"] in exclude_ids:
                    continue
                # Check if we already selected this question
                selected_ids = {s[1]["id"] for s in selected}
                if q["id"] in selected_ids:
                    continue
                q_types = q.get("profile_types", ["all"])
                if "all" in q_types or any(pt in profile_types for pt in q_types):
                    selected.append((_score_question(q, profile_types, stage), q))

    # 6. Personalize templates
    personalized = []
    for _, q in selected:
        personalized.append(personalize_question(q, profile))
        # Track IDs so they aren't re-used
        exclude_ids.append(q["id"])

    logger.info(f"Selected {len(personalized)} questions from categories: {[s[1].get('category') for s in selected]}")
    return personalized


def _get_stage_categories(stage: str) -> list[str]:
    """Map interview stage to relevant question categories."""
    stage_map = {
        "warmup": ["warmup"],
        "core_questioning": ["academic", "work_experience", "hometown_regional", "why_mba", "iim_specific", "behavioral", "current_affairs", "interest_probe", "situational", "technical", "googly", "hobbies_personality"],
        "pressure_round": ["pressure", "googly", "why_mba", "work_experience", "current_affairs", "interest_probe", "behavioral"],
        "revisit": ["pressure", "behavioral", "work_experience"],
        "closing": ["situational", "iim_specific", "current_affairs", "hobbies_personality"],
    }
    return stage_map.get(stage, stage_map["core_questioning"])


def _score_question(question: dict, profile_types: list[str], stage: str) -> float:
    """
    Score a question's relevance for this profile + stage combination.
    Higher score = more likely to be selected.
    """
    score = 1.0

    # Profile type match bonus
    q_types = question.get("profile_types", ["all"])
    specific_matches = len(set(q_types) & set(profile_types)) - (1 if "all" in q_types else 0)
    score += specific_matches * 2.0  # Strong bonus for specific matches

    # Difficulty alignment with stage
    difficulty = question.get("difficulty", 2)
    stage_difficulty = {"warmup": 1, "core_questioning": 2.5, "pressure_round": 4, "revisit": 3, "closing": 2}
    target = stage_difficulty.get(stage, 2.5)
    score -= abs(difficulty - target) * 0.5  # Penalty for difficulty mismatch

    # Bonus for questions that require profile fields (more personalized)
    if question.get("requires_profile_field"):
        score += 1.5

    return score


def get_bank_stats() -> dict:
    """Return statistics about the loaded question bank."""
    stats = {
        "total_questions": sum(len(qs) for qs in _question_bank.values()),
        "categories": {},
    }
    for category, questions in _question_bank.items():
        stats["categories"][category] = {
            "count": len(questions),
            "profile_types": list(set(
                pt for q in questions for pt in q.get("profile_types", [])
            )),
        }
    return stats

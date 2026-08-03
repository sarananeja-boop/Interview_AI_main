import logging
from typing import List, Optional
from pydantic import BaseModel, Field
from core.llm_provider import llm

logger = logging.getLogger(__name__)

class PracticeQuestion(BaseModel):
    type: str = Field(..., description="Type of question: 'factual', 'analytical', 'opinion', 'cross-question'")
    question: str = Field(..., description="The interview question")

class StoryAnalysis(BaseModel):
    factualSummary: List[str] = Field(..., description="2 to 4 concise factual bullets explaining what happened")
    whyItMatters: str = Field(..., description="Concise analytical explanation of broader significance")
    interviewAngle: str = Field(..., description="One likely interview question")
    modelAnswer30Sec: str = Field(..., description="A concise 30-second interview-ready response directly answering the interviewAngle")
    practiceQuestions: List[PracticeQuestion] = Field(..., description="3 to 5 lightweight practice questions for self-testing")
    themeTags: List[str] = Field(..., description="2 to 4 compact theme chips (e.g. 'Market Recovery', 'AI Investment')")

async def generate_story_analysis(headline: str, summary: str, category: str) -> dict:
    """
    Generate the comprehensive AI analysis bundle for a high-priority story.
    Returns a dictionary matching the StoryAnalysis schema.
    """
    system_prompt = (
        "You are an expert IIM (Indian Institutes of Management) interview coach and current affairs analyst. "
        "Your job is to analyze the given news story and produce an interview-focused intelligence brief. "
        "Do not fabricate facts. Distinguish facts from interpretation. Be concise and professional. "
        "IMPORTANT: You MUST return strictly valid JSON. Do NOT include trailing commas in lists or objects."
    )
    
    user_message = f"Headline: {headline}\nSummary: {summary}\nCategory: {category}\n\nPlease analyze this story for an IIM interview candidate."
    
    try:
        result = await llm.generate(
            system_prompt=system_prompt,
            user_message=user_message,
            schema=StoryAnalysis,
            temperature=0.4
        )
        return result
    except Exception as e:
        logger.error(f"Failed to generate story analysis for '{headline}': {e}")
        return None

async def generate_daily_big_picture(headlines: List[dict]) -> dict:
    """
    Generate a 2-3 sentence synthesis of the most important themes across today's top news.
    """
    class BigPicture(BaseModel):
        synthesis: str = Field(..., description="2 to 3 sentence synthesis of cross-story themes")
        themes: List[str] = Field(..., description="2 to 4 small theme chips (e.g. 'Market Recovery', 'IT Earnings')")

    system_prompt = (
        "You are an expert current affairs analyst for IIM interview preparation. "
        "Review the top headlines of the day and synthesize the 'Big Picture' in 2-3 sentences. "
        "Do not simply list the headlines. Synthesize cross-story themes (e.g. 'Markets recovered while tech policy dominated discussions'). "
        "IMPORTANT: You MUST return strictly valid JSON. Do NOT include trailing commas in lists or objects."
    )
    
    headline_texts = [f"- {h['title']} ({h['category']})" for h in headlines[:15]]
    user_message = "Today's top headlines:\n" + "\n".join(headline_texts)
    
    try:
        result = await llm.generate(
            system_prompt=system_prompt,
            user_message=user_message,
            schema=BigPicture,
            temperature=0.5
        )
        return result
    except Exception as e:
        logger.error(f"Failed to generate daily big picture: {e}")
        return {"synthesis": "Current affairs are evolving rapidly across major sectors today.", "themes": ["Current Affairs"]}

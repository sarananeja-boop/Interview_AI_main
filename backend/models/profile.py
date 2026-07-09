"""
Pydantic schemas for candidate profiles.
These define the structured output the LLM must produce when parsing resumes.
"""

from pydantic import BaseModel, Field


class Education(BaseModel):
    degree: str = Field(description="e.g. B.Tech, B.Com, BA")
    field: str = Field(description="e.g. Computer Science, Economics")
    institution: str = ""
    year: str = ""
    score: str = Field(default="", description="CGPA or percentage")


class WorkExperience(BaseModel):
    company: str = ""
    role: str = ""
    duration: str = ""
    responsibilities: list[str] = []
    achievements: list[str] = []


class ParsedProfile(BaseModel):
    """Structured profile extracted from resume by LLM."""
    name: str = ""
    education: list[Education] = []
    work_experience: list[WorkExperience] = []
    internships: list[WorkExperience] = []
    skills: list[str] = []
    certifications: list[str] = []
    hobbies: list[str] = []
    extracurriculars: list[str] = []
    achievements: list[str] = []
    cat_score: str = ""
    target_iims: list[str] = []
    career_goals: str = ""


class ProfileIntelligence(BaseModel):
    """AI-generated analysis of candidate vulnerabilities and likely questions."""
    strengths: list[str] = Field(description="Strong points the panel might acknowledge")
    weaknesses: list[str] = Field(description="Gaps or inconsistencies to probe")
    pressure_points: list[str] = Field(description="Specific likely questions the panel will ask to probe real weaknesses — each point should be a direct question or area of questioning, not abstract commentary")
    likely_questions: list[str] = Field(description="10-15 questions the panel would likely ask")
    career_transition_risks: list[str] = Field(default=[], description="Risks if changing career path")
    technical_deep_dives: list[str] = Field(default=[], description="Technical areas to probe deeply")


class ProfileResponse(BaseModel):
    id: str
    user_id: str
    resume_filename: str | None
    parsed_profile: ParsedProfile | None
    strengths: list[str] | None
    weaknesses: list[str] | None
    pressure_points: list[str] | None
    likely_questions: list[str] | None
    created_at: str

# Directive: Evaluate Candidate Resume

## Goal
Extract structured information and identifying strengths, weaknesses, and potential interview questions from a candidate's uploaded resume (PDF/DOCX/TXT).

## Inputs
- `profile_id`: The ID of the profile in the database.
- `file_path`: Absolute path to the candidate's resume file.

## Tools / Scripts to Use
- `backend/core/profile_engine.py`: Use `extract_text_from_file(file_path)` to get raw text.
- `backend/core/profile_engine.py`: Use `parse_resume_with_llm(raw_text)` to get structured JSON.
- `backend/core/profile_engine.py`: Use `analyze_profile_vulnerabilities(parsed)` to get strengths, weaknesses, and pressure points.

## Outputs
- Updated `Profile` record in the database with:
  - `raw_text`
  - `parsed_profile`
  - `strengths`, `weaknesses`, `pressure_points`, `likely_questions`

## Edge Cases
- **Unsupported Formats:** If a `.doc` file is provided, reject it immediately as `python-docx` only supports `.docx`.
- **Parsing Failures:** If the LLM returns invalid JSON during parsing, log the error and retry up to 2 times before failing.
- **Empty Resumes:** If the extracted text is under 100 characters, flag the resume as "insufficient_data".

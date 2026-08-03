# Directive: Generate and Ingest Questions

## Goal
Validate and ingest new JSON-based interview questions into the database and vector store for dynamic retrieval.

## Inputs
- `json_file_path`: Path to a JSON file containing an array of new questions.
- Format must match the `Question` schema.

## Tools / Scripts to Use
- `execution/question_ingestion.py`: Run this script with the path to the JSON file to validate the schema and ingest into ChromaDB.

## Outputs
- Validated questions added to `data/questions/`.
- Embedded question chunks added to the ChromaDB vector store.

## Edge Cases
- **Duplicate IDs:** If a question ID already exists, the ingestion script should update the existing question rather than throwing a duplicate key error.
- **Missing Fields:** If required fields (e.g., `text`, `category`, `difficulty`) are missing, the script must report a validation error and skip the invalid question.

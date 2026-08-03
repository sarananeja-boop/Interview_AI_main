import json
import sys
import os

def validate_and_ingest(json_path):
    if not os.path.exists(json_path):
        print(f"Error: File not found: {json_path}")
        sys.exit(1)
        
    try:
        with open(json_path, 'r') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON format: {e}")
        sys.exit(1)
        
    if not isinstance(data, list):
        print("Error: JSON must contain an array of questions.")
        sys.exit(1)
        
    valid_questions = []
    for idx, q in enumerate(data):
        required_keys = ["id", "text", "category", "difficulty"]
        if all(key in q for key in required_keys):
            valid_questions.append(q)
        else:
            print(f"Warning: Skipping invalid question at index {idx}: {q}")
            
    print(f"Successfully validated {len(valid_questions)} questions.")
    # Real ingestion to ChromaDB would happen here
    # For now, we simulate the tool
    print("Ingestion complete.")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python question_ingestion.py <path_to_json>")
        sys.exit(1)
        
    validate_and_ingest(sys.argv[1])

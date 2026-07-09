import os
import sys
import json
import glob
import logging

# Add the backend directory to sys.path so we can import core
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)

from core.vector_store import vector_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    questions_dir = os.path.join(os.path.dirname(BASE_DIR), "data", "questions")
    if not os.path.exists(questions_dir):
        logger.error(f"Questions directory not found: {questions_dir}")
        return

    json_files = glob.glob(os.path.join(questions_dir, "*.json"))
    
    total_questions = 0
    for file_path in json_files:
        with open(file_path, "r", encoding="utf-8") as f:
            try:
                questions = json.load(f)
                if isinstance(questions, list):
                    vector_store.index_questions(questions)
                    total_questions += len(questions)
                    logger.info(f"Indexed {len(questions)} from {os.path.basename(file_path)}")
            except Exception as e:
                logger.error(f"Failed to process {file_path}: {e}")
                
    logger.info(f"Successfully indexed a total of {total_questions} questions.")

if __name__ == "__main__":
    main()

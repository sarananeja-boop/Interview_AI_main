import os
import glob
import time

def cleanup_stale_dbs(directory):
    print(f"Checking for stale .db files in {directory}...")
    pattern = os.path.join(directory, "*.db")
    for filepath in glob.glob(pattern):
        # We only want to delete interview_sim.db and interviews.db, NOT the main data/interview.db
        filename = os.path.basename(filepath)
        if filename in ["interview_sim.db", "interviews.db"]:
            print(f"Removing stale database file: {filepath}")
            os.remove(filepath)
            
if __name__ == "__main__":
    backend_db_dir = os.path.join(os.path.dirname(__file__), "..", "backend", "db")
    cleanup_stale_dbs(backend_db_dir)
    print("Database cleanup complete.")

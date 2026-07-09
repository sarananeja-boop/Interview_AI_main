import os
import json
import logging
from typing import List, Dict, Any, Optional

import chromadb
from chromadb.utils import embedding_functions

from config import settings

logger = logging.getLogger(__name__)

# Use centralized config path for ChromaDB
DB_PATH = settings.CHROMA_PATH
os.makedirs(DB_PATH, exist_ok=True)

class VectorStore:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=DB_PATH)
        
        # We use the default sentence-transformers model (all-MiniLM-L6-v2)
        # as it is lightweight and sufficient for resume/question semantic search locally
        self.embedding_fn = embedding_functions.DefaultEmbeddingFunction()
        
        # Create or get collections
        self.resume_col = self.client.get_or_create_collection(
            name="resumes",
            embedding_function=self.embedding_fn
        )
        self.question_col = self.client.get_or_create_collection(
            name="questions",
            embedding_function=self.embedding_fn
        )
        self.domain_col = self.client.get_or_create_collection(
            name="domain_knowledge",
            embedding_function=self.embedding_fn
        )
        
        logger.info("ChromaDB VectorStore initialized.")

    def index_resume(self, profile_id: str, text_chunks: List[str]):
        """
        Index chunks of a candidate's resume for later semantic search by the interviewer.
        """
        if not text_chunks:
            return
            
        ids = [f"{profile_id}_chunk_{i}" for i in range(len(text_chunks))]
        metadatas = [{"profile_id": profile_id} for _ in text_chunks]
        
        self.resume_col.add(
            documents=text_chunks,
            ids=ids,
            metadatas=metadatas
        )
        logger.info(f"Indexed {len(text_chunks)} chunks for profile {profile_id}")

    def query_resume(self, profile_id: str, query: str, n_results: int = 3) -> List[str]:
        """
        Query the resume for semantic context.
        """
        results = self.resume_col.query(
            query_texts=[query],
            n_results=n_results,
            where={"profile_id": profile_id}
        )
        if results and results["documents"] and results["documents"][0]:
            return results["documents"][0]
        return []

    def index_questions(self, questions: List[Dict[str, Any]]):
        """
        Index the question bank for dynamic retrieval.
        Each question dict should have 'id', 'text', 'category', 'difficulty', 'tags'
        """
        if not questions:
            return
            
        ids = [q["id"] for q in questions]
        documents = [q["text"] for q in questions]
        
        # Convert list types in metadata to strings since Chroma expects primitive types
        metadatas = []
        for q in questions:
            meta = {
                "category": q.get("category", ""),
                "difficulty": q.get("difficulty", 1)
            }
            if "tags" in q:
                meta["tags"] = ",".join(q["tags"])
            if "profile_types" in q:
                meta["profile_types"] = ",".join(q["profile_types"])
            metadatas.append(meta)
            
        # We upsert to allow re-indexing without errors
        self.question_col.upsert(
            documents=documents,
            ids=ids,
            metadatas=metadatas
        )
        logger.info(f"Indexed {len(questions)} questions")

    def query_questions(self, query: str, n_results: int = 5, where_clause: Optional[Dict[str, Any]] = None, exclude_categories: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Query the question bank for similar questions.
        """
        if exclude_categories:
            if not where_clause:
                where_clause = {"category": {"$nin": exclude_categories}}
            else:
                where_clause = {"$and": [where_clause, {"category": {"$nin": exclude_categories}}]}

        results = self.question_col.query(
            query_texts=[query],
            n_results=n_results,
            where=where_clause
        )
        
        matched_questions = []
        if results and results["documents"] and results["documents"][0]:
            for i, doc in enumerate(results["documents"][0]):
                matched_questions.append({
                    "id": results["ids"][0][i],
                    "text": doc,
                    "metadata": results["metadatas"][0][i]
                })
        return matched_questions

# Global instance
vector_store = VectorStore()

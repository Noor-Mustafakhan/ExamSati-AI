"""
ExamSathi AI - Stage 2: Hybrid RAG Retrieval Engine (Python Service & CLI)
==========================================================================
Implements Sparse Full-Text Search (PostgreSQL BM25) and Dense Semantic Search
(Supabase pgvector via gemini-embedding-001) with Reciprocal Rank Fusion (RRF).

Security & Traceability:
- Reads GEMINI_API_KEY securely from .env.local / .env
- Returns exact document names, start/end page numbers, and passage chunks
- Never fabricates page references or similarity rankings
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from tools.pdf_mcq_generator import load_env_vars, get_gemini_api_key
from tools.rag_document_indexer import GeminiEmbeddingClient

try:
    import requests
except ImportError:
    requests = None


class RAGRetrievalEngine:
    def __init__(
        self,
        custom_env: Optional[Dict[str, str]] = None,
        embedding_model: str = "gemini-embedding-001",
        embedding_dim: int = 768
    ):
        self.env_vars = custom_env or load_env_vars()
        self.api_key, self.key_status = get_gemini_api_key(self.env_vars)
        self.embedding_client = GeminiEmbeddingClient(api_key=self.api_key)
        self.embedding_client.MODEL_NAME = embedding_model
        self.embedding_client.EMBEDDING_DIMENSIONS = embedding_dim

        self.supabase_url = (
            self.env_vars.get("VITE_SUPABASE_URL") or
            self.env_vars.get("SUPABASE_URL") or ""
        ).rstrip("/")
        self.supabase_key = (
            self.env_vars.get("SUPABASE_SERVICE_ROLE_KEY") or
            self.env_vars.get("VITE_SUPABASE_PUBLISHABLE_KEY") or
            self.env_vars.get("SUPABASE_KEY") or ""
        )
        self.headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    def generate_query_embedding(self, query: str) -> List[float]:
        """Generates a 768-dimensional float embedding for the search query."""
        return self.embedding_client.embed_text(query)

    def search_sparse(
        self,
        query: str,
        exam_id: Optional[str] = None,
        subject_id: Optional[str] = None,
        topic_id: Optional[str] = None,
        match_count: int = 10
    ) -> List[Dict[str, Any]]:
        """Executes full-text search via PostgreSQL RPC search_pdf_passages_sparse."""
        if not self.supabase_url or not self.supabase_key or requests is None:
            return []

        url = f"{self.supabase_url}/rest/v1/rpc/search_pdf_passages_sparse"
        payload = {
            "query_text": query,
            "filter_exam_id": exam_id,
            "filter_subject_id": subject_id,
            "filter_topic_id": topic_id,
            "match_count": match_count
        }

        resp = requests.post(url, headers=self.headers, json=payload, timeout=20)
        if resp.status_code == 200:
            return resp.json()
        else:
            print(f"[Warning] Sparse search error ({resp.status_code}): {resp.text[:200]}", file=sys.stderr)
            return []

    def search_dense(
        self,
        query_embedding: List[float],
        exam_id: Optional[str] = None,
        subject_id: Optional[str] = None,
        topic_id: Optional[str] = None,
        match_count: int = 10
    ) -> List[Dict[str, Any]]:
        """Executes dense cosine vector search via pgvector RPC search_pdf_passages_dense."""
        if not self.supabase_url or not self.supabase_key or requests is None:
            return []

        url = f"{self.supabase_url}/rest/v1/rpc/search_pdf_passages_dense"
        payload = {
            "query_embedding": query_embedding,
            "filter_exam_id": exam_id,
            "filter_subject_id": subject_id,
            "filter_topic_id": topic_id,
            "match_count": match_count
        }

        resp = requests.post(url, headers=self.headers, json=payload, timeout=25)
        if resp.status_code == 200:
            return resp.json()
        else:
            print(f"[Warning] Dense search error ({resp.status_code}): {resp.text[:200]}", file=sys.stderr)
            return []

    def fuse_rrf(
        self,
        sparse_candidates: List[Dict[str, Any]],
        dense_candidates: List[Dict[str, Any]],
        sparse_weight: float = 1.0,
        dense_weight: float = 1.0,
        rrf_k: int = 60,
        match_count: int = 5
    ) -> List[Dict[str, Any]]:
        """Fuses sparse and dense ranked candidate lists using Reciprocal Rank Fusion."""
        candidates: Dict[str, Dict[str, Any]] = {}

        for item in sparse_candidates:
            pid = item["passage_id"]
            if pid not in candidates:
                candidates[pid] = dict(item)
                candidates[pid]["dense_rank"] = None
                candidates[pid]["dense_score"] = None
            else:
                candidates[pid]["sparse_rank"] = item["sparse_rank"]
                candidates[pid]["sparse_score"] = item["sparse_score"]

        for item in dense_candidates:
            pid = item["passage_id"]
            if pid not in candidates:
                candidates[pid] = dict(item)
                candidates[pid]["sparse_rank"] = None
                candidates[pid]["sparse_score"] = None
            else:
                candidates[pid]["dense_rank"] = item["dense_rank"]
                candidates[pid]["dense_score"] = item["dense_score"]

        results = []
        for pid, doc in candidates.items():
            s_rank = doc.get("sparse_rank")
            d_rank = doc.get("dense_rank")

            s_contrib = (sparse_weight / (rrf_k + s_rank)) if s_rank else 0.0
            d_contrib = (dense_weight / (rrf_k + d_rank)) if d_rank else 0.0
            rrf_score = round(s_contrib + d_contrib, 6)

            if s_rank and d_rank:
                method = "both"
                explanation = f"Matched keyword search (Rank #{s_rank}) and semantic vector similarity (Rank #{d_rank})."
            elif s_rank:
                method = "sparse_only"
                explanation = f"Found via keyword / full-text search match (Rank #{s_rank})."
            else:
                method = "dense_only"
                explanation = f"Found via conceptual semantic similarity (Rank #{d_rank}, score {round(doc.get('dense_score') or 0, 3)})."

            doc["rrf_score"] = rrf_score
            doc["retrieval_method"] = method
            doc["relevance_explanation"] = explanation
            results.append(doc)

        results.sort(key=lambda x: x["rrf_score"], reverse=True)

        top_results = results[:match_count]
        for idx, doc in enumerate(top_results, start=1):
            doc["combined_rank"] = idx

        return top_results

    def retrieve(
        self,
        query: str,
        exam_id: Optional[str] = None,
        subject_id: Optional[str] = None,
        topic_id: Optional[str] = None,
        candidate_count: int = 10,
        match_count: int = 5,
        sparse_weight: float = 1.0,
        dense_weight: float = 1.0,
        rrf_k: int = 60
    ) -> Dict[str, Any]:
        """
        Coordinates full hybrid retrieval:
        1. Embeds query via Gemini
        2. Retrieves sparse candidates (FTS)
        3. Retrieves dense candidates (pgvector)
        4. Fuses via RRF
        """
        t0 = time.time()

        # 1. Generate query embedding
        t_emb_0 = time.time()
        query_embedding = None
        try:
            query_embedding = self.generate_query_embedding(query)
        except Exception as e:
            print(f"[Notice] Could not generate query embedding: {e}", file=sys.stderr)
        t_emb = round((time.time() - t_emb_0) * 1000, 1)

        # 2. Sparse Search
        t_sp_0 = time.time()
        sparse_candidates = self.search_sparse(
            query=query,
            exam_id=exam_id,
            subject_id=subject_id,
            topic_id=topic_id,
            match_count=candidate_count
        )
        t_sparse = round((time.time() - t_sp_0) * 1000, 1)

        # 3. Dense Search
        t_dn_0 = time.time()
        dense_candidates = []
        if query_embedding:
            dense_candidates = self.search_dense(
                query_embedding=query_embedding,
                exam_id=exam_id,
                subject_id=subject_id,
                topic_id=topic_id,
                match_count=candidate_count
            )
        t_dense = round((time.time() - t_dn_0) * 1000, 1)

        # 4. Hybrid RRF Fusion
        hybrid_results = self.fuse_rrf(
            sparse_candidates=sparse_candidates,
            dense_candidates=dense_candidates,
            sparse_weight=sparse_weight,
            dense_weight=dense_weight,
            rrf_k=rrf_k,
            match_count=match_count
        )

        total_ms = round((time.time() - t0) * 1000, 1)

        return {
            "query": query,
            "timings_ms": {
                "embedding": t_emb,
                "sparse_search": t_sparse,
                "dense_search": t_dense,
                "total": total_ms
            },
            "candidate_counts": {
                "sparse": len(sparse_candidates),
                "dense": len(dense_candidates),
                "hybrid": len(hybrid_results)
            },
            "sparse_candidates": sparse_candidates,
            "dense_candidates": dense_candidates,
            "hybrid_results": hybrid_results
        }


def main():
    parser = argparse.ArgumentParser(description="ExamSathi AI Hybrid RAG Retrieval Engine")
    parser.add_argument("--query", "-q", required=True, help="Search query text")
    parser.add_argument("--candidates", "-c", type=int, default=10, help="Candidate count per retrieval method")
    parser.add_argument("--top", "-k", type=int, default=5, help="Top hybrid results to return")
    parser.add_argument("--sparse-weight", type=float, default=1.0, help="Weight for sparse rank in RRF")
    parser.add_argument("--dense-weight", type=float, default=1.0, help="Weight for dense rank in RRF")
    parser.add_argument("--rrf-k", type=int, default=60, help="RRF smoothing constant k")
    parser.add_argument("--exam", help="Filter by Exam UUID")
    parser.add_argument("--subject", help="Filter by Subject UUID")
    parser.add_argument("--topic", help="Filter by Syllabus Topic UUID")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")

    args = parser.parse_args()

    engine = RAGRetrievalEngine()

    result = engine.retrieve(
        query=args.query,
        exam_id=args.exam,
        subject_id=args.subject,
        topic_id=args.topic,
        candidate_count=args.candidates,
        match_count=args.top,
        sparse_weight=args.sparse_weight,
        dense_weight=args.dense_weight,
        rrf_k=args.rrf_k
    )

    if args.json:
        print(json.dumps(result, indent=2))
        return

    print("\n" + "=" * 70)
    print(f"HYBRID RETRIEVAL RESULTS: \"{args.query}\"")
    print("=" * 70)
    print(f"Timings: Total {result['timings_ms']['total']}ms "
          f"(Embedding: {result['timings_ms']['embedding']}ms | "
          f"Sparse: {result['timings_ms']['sparse_search']}ms | "
          f"Dense: {result['timings_ms']['dense_search']}ms)")
    print(f"Candidates: Sparse {result['candidate_counts']['sparse']} | "
          f"Dense {result['candidate_counts']['dense']} | "
          f"Hybrid Selected: {result['candidate_counts']['hybrid']}")
    print("-" * 70)

    if not result["hybrid_results"]:
        print("No matching passages found.")
        return

    for doc in result["hybrid_results"]:
        method_badge = f"[{doc['retrieval_method'].upper()}]"
        print(f"\n#{doc['combined_rank']} {method_badge} RRF Score: {doc['rrf_score']} "
              f"(Sparse Rank: {doc['sparse_rank'] or '-'}, Dense Rank: {doc['dense_rank'] or '-'})")
        print(f"  Source:   {doc['document_title']} ({doc['page_reference']})")
        print(f"  Subject:  {doc['subject_name'] or 'N/A'} | Topic: {doc['topic_title'] or 'N/A'}")
        print(f"  Excerpt:  {doc['passage_text'][:200].replace(chr(10), ' ')}...")
        print(f"  Reason:   {doc['relevance_explanation']}")


if __name__ == "__main__":
    main()

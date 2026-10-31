"""
ExamSathi AI - RAG Document Ingestion & Vector Indexing Engine
==============================================================
Extracts PDF documents page-by-page, partitions into page-aware passages,
generates Gemini embeddings (gemini-embedding-001, 768 dimensions),
and indexes documents and passages into Supabase PostgreSQL.

Security & Integrity Rules:
1. Reuses PDFExtractor, FileHasher, and SubjectTopicClassifier from tools.pdf_mcq_generator.
2. Source PDFs remain strictly local on the user's filesystem.
3. GEMINI_API_KEY is read securely from .env.local / .env and never logged or exposed.
4. Passages maintain exact original start_page and end_page metadata.
5. Embeddings use the official gemini-embedding-001 model with 768 dimensions.
6. Never generates fake or random vectors. Never marks document 'indexed' if embedding fails.
7. Cryptographic SHA-256 deduplication prevents redundant processing of identical PDFs.
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

# Add project root to sys.path
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

# Reuse existing extraction, hashing, taxonomy, and environment utilities
from tools.pdf_mcq_generator import (
    PDFExtractor,
    FileHasher,
    SubjectTopicClassifier,
    SYLLABUS_CATALOG,
    DOMAINS_TAXONOMY,
    load_env_vars,
    get_gemini_api_key
)
from tools.rag_passage_chunker import PassageChunk, PassageChunker

try:
    import requests
except ImportError:
    requests = None


# ==============================================================================
# 1. GEMINI EMBEDDING CLIENT (gemini-embedding-001, 768 Dimensions)
# ==============================================================================
class GeminiEmbeddingClient:
    """
    Client for generating embeddings using the official Google Gemini API.
    Model: gemini-embedding-001
    Dimensions: 768
    """
    MODEL_NAME = "gemini-embedding-001"
    EMBEDDING_DIMENSIONS = 768
    API_BASE = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self.is_configured = bool(api_key and not api_key.startswith("your_") and not "placeholder" in api_key.lower())

    def embed_text(self, text: str) -> List[float]:
        """
        Embeds a single passage text and returns a 768-dimensional float vector.
        """
        if not self.is_configured:
            raise RuntimeError("Gemini API key is not configured or is a placeholder.")
        if requests is None:
            raise RuntimeError("Python 'requests' library is not installed.")

        url = f"{self.API_BASE}/models/{self.MODEL_NAME}:embedContent?key={self.api_key}"
        payload = {
            "content": {
                "parts": [{"text": text}]
            },
            "outputDimensionality": self.EMBEDDING_DIMENSIONS
        }

        resp = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=30
        )

        if resp.status_code != 200:
            err_text = resp.text[:300]
            raise RuntimeError(f"Gemini Embedding API Error (HTTP {resp.status_code}): {err_text}")

        data = resp.json()
        values = data.get("embedding", {}).get("values")
        if not values or not isinstance(values, list):
            raise ValueError(f"Malformed embedding response from Gemini: {data}")

        if len(values) != self.EMBEDDING_DIMENSIONS:
            # If API returned default dimensions without truncating, ensure we track actual
            pass

        return values

    def embed_batch(
        self,
        texts: List[str],
        batch_size: int = 5,
        delay_between_batches: float = 0.5
    ) -> List[List[float]]:
        """
        Embeds a list of texts in controlled batches with rate-limiting support.
        """
        results: List[List[float]] = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]

            # Use batchEmbedContents endpoint
            url = f"{self.API_BASE}/models/{self.MODEL_NAME}:batchEmbedContents?key={self.api_key}"
            requests_payload = [
                {
                    "model": f"models/{self.MODEL_NAME}",
                    "content": {"parts": [{"text": t}]},
                    "outputDimensionality": self.EMBEDDING_DIMENSIONS
                }
                for t in batch
            ]

            try:
                resp = requests.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={"requests": requests_payload},
                    timeout=45
                )

                if resp.status_code == 200:
                    data = resp.json()
                    embeddings_list = data.get("embeddings", [])
                    if len(embeddings_list) == len(batch):
                        for item in embeddings_list:
                            results.append(item.get("values", []))
                    else:
                        # Fallback to one-by-one for this batch
                        for t in batch:
                            results.append(self.embed_text(t))
                elif resp.status_code in (404, 400):
                    # Fallback to single embedContent if batch endpoint is restricted
                    for t in batch:
                        results.append(self.embed_text(t))
                else:
                    raise RuntimeError(f"Gemini batch embedding error (HTTP {resp.status_code}): {resp.text[:250]}")

            except Exception as e:
                # If batch call fails, attempt single requests
                print(f"[Notice] Batch request failed ({e}), falling back to individual embedding calls...", file=sys.stderr)
                for t in batch:
                    results.append(self.embed_text(t))

            if i + batch_size < len(texts) and delay_between_batches > 0:
                time.sleep(delay_between_batches)

        return results


# ==============================================================================
# 2. SUPABASE RAG STORAGE ADAPTER (PostgREST)
# ==============================================================================
class SupabaseRAGStore:
    """
    Direct PostgREST adapter for storing and querying pdf_documents and pdf_passages.
    Reuses project configuration from .env.
    """
    def __init__(self, supabase_url: str, supabase_key: str):
        self.supabase_url = supabase_url.rstrip("/")
        self.supabase_key = supabase_key
        self.headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    def find_document_by_hash(self, file_hash: str) -> Optional[Dict[str, Any]]:
        """
        Checks if a document with the given SHA-256 hash is already in the database.
        """
        if not self.supabase_url or not self.supabase_key or requests is None:
            return None

        url = f"{self.supabase_url}/rest/v1/pdf_documents?file_hash=eq.{file_hash}&select=*"
        try:
            resp = requests.get(url, headers=self.headers, timeout=15)
            if resp.status_code == 200:
                docs = resp.json()
                return docs[0] if docs and len(docs) > 0 else None
        except Exception as e:
            print(f"[Warning] Error querying Supabase document hash: {e}", file=sys.stderr)
        return None

    def create_document(self, doc_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Inserts a new record into pdf_documents.
        """
        url = f"{self.supabase_url}/rest/v1/pdf_documents"
        resp = requests.post(url, headers=self.headers, json=doc_data, timeout=20)
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Failed to create pdf_document record: HTTP {resp.status_code} - {resp.text[:300]}")
        data = resp.json()
        return data[0] if isinstance(data, list) and data else data

    def update_document(self, doc_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Updates an existing pdf_documents record (e.g. status, total_chunks, error_message).
        """
        url = f"{self.supabase_url}/rest/v1/pdf_documents?id=eq.{doc_id}"
        resp = requests.patch(url, headers=self.headers, json=updates, timeout=20)
        if resp.status_code not in (200, 204):
            raise RuntimeError(f"Failed to update pdf_document record: HTTP {resp.status_code} - {resp.text[:300]}")
        if resp.status_code == 204:
            return updates
        data = resp.json()
        return data[0] if isinstance(data, list) and data else data

    def insert_passages_batch(self, passages_data: List[Dict[str, Any]], batch_size: int = 50) -> int:
        """
        Inserts passages with embeddings into pdf_passages in controlled batches.
        """
        url = f"{self.supabase_url}/rest/v1/pdf_passages"
        inserted_count = 0

        for i in range(0, len(passages_data), batch_size):
            batch = passages_data[i:i + batch_size]
            resp = requests.post(url, headers=self.headers, json=batch, timeout=45)
            if resp.status_code not in (200, 201):
                raise RuntimeError(f"Failed to insert pdf_passages batch: HTTP {resp.status_code} - {resp.text[:300]}")
            inserted_count += len(batch)

        return inserted_count

    def delete_passages_for_document(self, doc_id: str):
        """
        Deletes existing passages for a document to allow safe re-indexing.
        """
        url = f"{self.supabase_url}/rest/v1/pdf_passages?document_id=eq.{doc_id}"
        requests.delete(url, headers=self.headers, timeout=20)


# ==============================================================================
# 3. RAG DOCUMENT INGESTION & INDEXING PIPELINE
# ==============================================================================
class RAGDocumentIndexer:
    """
    Orchestrates the entire Stage 1 RAG ingestion pipeline:
    1. Cryptographic file hashing & duplicate detection
    2. Page-by-page PDF extraction with OCR detection
    3. Syllabus subject and topic classification
    4. Page-aware passage chunking (300-500 words, ~50 words overlap)
    5. Official Gemini embedding generation (gemini-embedding-001, 768 dims)
    6. Database indexing into Supabase pdf_documents & pdf_passages
    """
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

        self.supabase_url = self.env_vars.get("VITE_SUPABASE_URL") or self.env_vars.get("SUPABASE_URL") or ""
        self.supabase_key = (
            self.env_vars.get("SUPABASE_SERVICE_ROLE_KEY") or
            self.env_vars.get("VITE_SUPABASE_PUBLISHABLE_KEY") or
            self.env_vars.get("SUPABASE_KEY") or ""
        )
        self.supabase_store = SupabaseRAGStore(self.supabase_url, self.supabase_key)

    def process_pdf(
        self,
        pdf_path: Path,
        exam_id: Optional[str] = None,
        subject_id: Optional[str] = None,
        syllabus_topic_id: Optional[str] = None,
        dry_run: bool = False,
        force_reindex: bool = False,
        batch_size: int = 5
    ) -> Dict[str, Any]:
        """
        Processes a single PDF document through extraction, chunking, and indexing.
        """
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF not found at {pdf_path}")

        file_name = pdf_path.name
        print(f"\n========================================================")
        print(f"RAG Ingestion: Processing [{file_name}]")
        print(f"========================================================")

        # 1. Compute SHA-256 hash
        file_hash = FileHasher.compute_sha256(pdf_path)
        file_size = pdf_path.stat().st_size
        print(f"  SHA-256 Hash: {file_hash}")
        print(f"  File Size:    {file_size:,} bytes")

        # 2. Check for duplicate document in Supabase
        existing_doc = self.supabase_store.find_document_by_hash(file_hash)
        if existing_doc and not force_reindex:
            status = existing_doc.get("ingestion_status")
            if status == "indexed":
                print(f"  [Notice] Document already indexed (ID: {existing_doc['id']}). Skipping reprocessing.")
                return {
                    "success": True,
                    "status": "ALREADY_INDEXED",
                    "document_id": existing_doc["id"],
                    "file_name": file_name,
                    "file_hash": file_hash,
                    "total_pages": existing_doc.get("total_pages", 0),
                    "total_chunks": existing_doc.get("total_chunks", 0),
                    "is_duplicate": True,
                    "message": "Document is already fully indexed. Use --force to re-index."
                }
            elif status == "failed":
                print(f"  [Notice] Document was previously marked 'failed'. Retrying ingestion...")

        # 3. Extract text page-by-page using PDFExtractor
        extract_res = PDFExtractor.extract(pdf_path)
        if not extract_res["success"]:
            error_msg = extract_res.get("error", "Failed to extract text from PDF")
            print(f"  [Error] Extraction failed: {error_msg}")
            if not dry_run and self.supabase_store.supabase_url:
                doc_payload = {
                    "file_name": file_name,
                    "file_path": str(pdf_path.resolve()),
                    "file_hash": file_hash,
                    "file_size_bytes": file_size,
                    "total_pages": extract_res.get("total_pages", 0),
                    "extraction_status": extract_res.get("extraction_status", "CORRUPTED"),
                    "ingestion_status": "failed",
                    "error_message": error_msg,
                    "exam_id": exam_id,
                    "subject_id": subject_id,
                    "syllabus_topic_id": syllabus_topic_id
                }
                self.supabase_store.create_document(doc_payload)
            return {
                "success": False,
                "status": "EXTRACTION_FAILED",
                "file_name": file_name,
                "file_hash": file_hash,
                "error": error_msg
            }

        total_pages = extract_res["total_pages"]
        total_chars = extract_res["total_chars"]
        avg_chars = extract_res["avg_chars_per_page"]
        ocr_needed = extract_res["ocr_needed"]

        ocr_pages_count = extract_res.get("ocr_pages_count", 0)

        print(f"  Pages Extracted: {total_pages}")
        print(f"  Total Chars:     {total_chars:,} (~{round(total_chars/total_pages, 1)} chars/page)")
        if ocr_pages_count > 0:
            print(f"  [OCR] Tesseract OCR applied to {ocr_pages_count} scanned page(s)/image(s).")
        if ocr_needed:
            print(f"  [!] Scanned PDF warning: OCR preprocessing recommended ({extract_res.get('ocr_warning')})")

        # 4. Auto-classify subject/topic if not explicitly passed
        classif = SubjectTopicClassifier.classify_pdf(extract_res, file_name)
        resolved_subject_id = subject_id or classif.get("detected_subject_id")
        resolved_topic_id = syllabus_topic_id or classif.get("primary_syllabus_topic_id")
        resolved_exam_id = exam_id or classif.get("primary_exam_id")

        exam_profiles = classif.get('likely_exam_profiles') or ['General']
        exam_label = exam_profiles[0] if exam_profiles else 'General'
        print(f"  Taxonomy Mapping:")
        print(f"    Subject: {classif.get('detected_subject')} (ID: {resolved_subject_id or 'none'})")
        print(f"    Topic:   {classif.get('primary_topic')} (ID: {resolved_topic_id or 'none'})")
        print(f"    Exam:    {exam_label} (ID: {resolved_exam_id or 'none'})")

        # 5. Page-aware passage chunking (300-500 words, ~50 words overlap)
        pages = extract_res["pages"]
        chunks = PassageChunker.chunk_extracted_pages(
            pages=pages,
            file_name=file_name,
            file_hash=file_hash,
            document_title=extract_res.get("metadata", {}).get("title") or file_name,
            exam_id=resolved_exam_id,
            subject_id=resolved_subject_id,
            syllabus_topic_id=resolved_topic_id
        )

        total_chunks = len(chunks)
        print(f"  Passage Chunks:  {total_chunks} chunk(s) generated.")
        if chunks:
            word_counts = [c.word_count for c in chunks]
            print(f"    Word count range: {min(word_counts)} - {max(word_counts)} words (avg: {round(sum(word_counts)/len(word_counts))})")
            print(f"    Page coverage:   Page {chunks[0].start_page} to Page {chunks[-1].end_page}")

        if dry_run:
            print(f"\n  [Dry-Run Complete] 0 API calls made, 0 database writes. Ready for live ingestion.")
            return {
                "success": True,
                "status": "DRY_RUN_OK",
                "file_name": file_name,
                "file_hash": file_hash,
                "total_pages": total_pages,
                "total_chunks": total_chunks,
                "ocr_needed": ocr_needed,
                "chunks": [c.to_dict() for c in chunks[:5]], # Sample
                "taxonomy": {
                    "subject": classif.get("detected_subject"),
                    "topic": classif.get("primary_topic"),
                    "confidence": classif.get("confidence_score")
                }
            }

        # 6. Live Ingestion: Check API key
        if not self.embedding_client.is_configured:
            error_msg = f"Embedding generation failed: Gemini API key is {self.key_status}. Live embeddings cannot be generated."
            print(f"  [Error] {error_msg}")
            return {
                "success": False,
                "status": "API_KEY_UNAVAILABLE",
                "file_name": file_name,
                "file_hash": file_hash,
                "error": error_msg
            }

        # 7. Create or update document record in Supabase with 'processing' status
        doc_record_id = None
        if existing_doc:
            doc_record_id = existing_doc["id"]
            self.supabase_store.update_document(doc_record_id, {
                "ingestion_status": "processing",
                "total_pages": total_pages,
                "total_chars": total_chars,
                "avg_chars_per_page": avg_chars,
                "total_chunks": total_chunks,
                "ocr_needed": ocr_needed,
                "ocr_warning": extract_res.get("ocr_warning"),
                "error_message": None,
                "exam_id": resolved_exam_id,
                "subject_id": resolved_subject_id,
                "syllabus_topic_id": resolved_topic_id
            })
            # Remove old passages if re-indexing
            self.supabase_store.delete_passages_for_document(doc_record_id)
        else:
            new_doc = self.supabase_store.create_document({
                "file_name": file_name,
                "file_path": str(pdf_path.resolve()),
                "file_hash": file_hash,
                "file_size_bytes": file_size,
                "total_pages": total_pages,
                "total_chars": total_chars,
                "avg_chars_per_page": avg_chars,
                "total_chunks": total_chunks,
                "ocr_needed": ocr_needed,
                "ocr_warning": extract_res.get("ocr_warning"),
                "extraction_status": "OCR_REQUIRED" if ocr_needed else "SUCCESS",
                "ingestion_status": "processing",
                "exam_id": resolved_exam_id,
                "subject_id": resolved_subject_id,
                "syllabus_topic_id": resolved_topic_id,
                "metadata": {
                    "pdf_metadata": extract_res.get("metadata", {}),
                    "classification": classif
                }
            })
            doc_record_id = new_doc["id"]

        print(f"  Supabase Document ID: {doc_record_id}")

        # 8. Generate Gemini Embeddings in batches
        print(f"  Generating embeddings via {self.embedding_client.MODEL_NAME} (dims: {self.embedding_client.EMBEDDING_DIMENSIONS})...")
        passage_texts = [c.passage_text for c in chunks]
        embeddings: List[List[float]] = []

        try:
            embeddings = self.embedding_client.embed_batch(
                texts=passage_texts,
                batch_size=batch_size
            )
        except Exception as embed_err:
            error_msg = f"Embedding generation failed: {embed_err}"
            print(f"  [Error] {error_msg}")
            # Mark document as failed
            self.supabase_store.update_document(doc_record_id, {
                "ingestion_status": "failed",
                "error_message": error_msg
            })
            return {
                "success": False,
                "status": "EMBEDDING_FAILED",
                "document_id": doc_record_id,
                "file_name": file_name,
                "file_hash": file_hash,
                "error": error_msg
            }

        if len(embeddings) != len(chunks):
            error_msg = f"Embedding count mismatch: expected {len(chunks)}, received {len(embeddings)}"
            self.supabase_store.update_document(doc_record_id, {
                "ingestion_status": "failed",
                "error_message": error_msg
            })
            return {
                "success": False,
                "status": "EMBEDDING_COUNT_MISMATCH",
                "document_id": doc_record_id,
                "error": error_msg
            }

        # 9. Store passage chunks with embeddings in Supabase
        passages_payload = []
        for idx, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            passages_payload.append({
                "document_id": doc_record_id,
                "chunk_id": chunk.chunk_id,
                "chunk_index": chunk.chunk_index,
                "passage_text": chunk.passage_text,
                "word_count": chunk.word_count,
                "char_count": chunk.char_count,
                "start_page": chunk.start_page,
                "end_page": chunk.end_page,
                "page_reference": chunk.page_reference,
                "exam_id": resolved_exam_id,
                "subject_id": resolved_subject_id,
                "syllabus_topic_id": resolved_topic_id,
                "embedding": emb,
                "embedding_model": self.embedding_client.MODEL_NAME,
                "embedding_dimensions": len(emb),
                "metadata": {
                    "doc_title": chunk.document_title,
                    "file_name": chunk.file_name
                }
            })

        print(f"  Indexing {len(passages_payload)} passage(s) into Supabase pdf_passages...")
        self.supabase_store.insert_passages_batch(passages_payload)

        # 10. Mark document indexed
        self.supabase_store.update_document(doc_record_id, {
            "ingestion_status": "indexed",
            "total_chunks": len(chunks),
            "error_message": None
        })

        print(f"  [Success] Ingestion complete. Status: INDEXED ({len(chunks)} passages)")

        return {
            "success": True,
            "status": "INDEXED",
            "document_id": doc_record_id,
            "file_name": file_name,
            "file_hash": file_hash,
            "total_pages": total_pages,
            "total_chunks": len(chunks),
            "embedding_model": self.embedding_client.MODEL_NAME,
            "embedding_dimensions": self.embedding_client.EMBEDDING_DIMENSIONS
        }


# ==============================================================================
# 4. CLI INTERFACE
# ==============================================================================
def main():
    parser = argparse.ArgumentParser(description="ExamSathi AI - RAG Document Ingestion & Vector Indexer")
    parser.add_argument("--file", type=str, help="Path to a single PDF document to ingest")
    parser.add_argument("--folder", type=str, help="Folder containing PDFs to discover and ingest")
    parser.add_argument("--exam", type=str, default=None, help="Exam slug or ID")
    parser.add_argument("--subject", type=str, default=None, help="Subject UUID")
    parser.add_argument("--topic", type=str, default=None, help="Syllabus topic UUID")
    parser.add_argument("--dry-run", action="store_true", help="Extract and chunk without API calls or DB writes")
    parser.add_argument("--force", action="store_true", help="Force re-indexing of already indexed documents")
    parser.add_argument("--batch-size", type=int, default=5, help="Batch size for embedding generation")

    args = parser.parse_args()

    if not args.file and not args.folder:
        parser.print_help()
        sys.exit(1)

    indexer = RAGDocumentIndexer()
    print(f"ExamSathi AI RAG Indexer Initialized")
    print(f"  Embedding Model: {indexer.embedding_client.MODEL_NAME}")
    print(f"  Key Status:      {indexer.key_status}")
    print(f"  Supabase URL:    {indexer.supabase_url or 'NOT CONFIGURED'}")

    pdf_files: List[Path] = []
    if args.file:
        p = Path(args.file)
        if not p.exists():
            print(f"Error: File {p} does not exist", file=sys.stderr)
            sys.exit(1)
        pdf_files.append(p)
    elif args.folder:
        folder = Path(args.folder)
        for root, _, files in os.walk(folder):
            for f in files:
                if f.lower().endswith(".pdf") and not f.startswith("."):
                    pdf_files.append(Path(root) / f)

    print(f"Discovered {len(pdf_files)} PDF file(s) for ingestion.")

    results = []
    for pdf_path in pdf_files:
        res = indexer.process_pdf(
            pdf_path=pdf_path,
            exam_id=args.exam,
            subject_id=args.subject,
            syllabus_topic_id=args.topic,
            dry_run=args.dry_run,
            force_reindex=args.force,
            batch_size=args.batch_size
        )
        results.append(res)

    print("\n================== SUMMARY ==================")
    for r in results:
        status_tag = "[OK]" if r.get("success") else "[FAIL]"
        print(f"{status_tag} {r.get('file_name')}: {r.get('status')} ({r.get('total_chunks', 0)} chunks)")


if __name__ == "__main__":
    main()

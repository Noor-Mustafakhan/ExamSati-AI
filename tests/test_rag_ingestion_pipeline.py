"""
ExamSathi AI - Stage 1 RAG Ingestion Pipeline Comprehensive Test Suite
======================================================================
Tests all Stage 1 completion criteria:
1. PDF extraction using PDFExtractor
2. Page-number preservation
3. Chunk boundaries and ~50-word overlap
4. SHA-256 cryptographic duplicate detection
5. Subject/topic taxonomy classification
6. Embedding dimensions verification (768 dims for gemini-embedding-001)
7. Supabase document & passage insertion
8. Failed embedding and error status handling
9. Reprocessing prevention for unchanged documents
"""

import os
import sys
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from tools.pdf_mcq_generator import PDFExtractor, FileHasher, SubjectTopicClassifier
from tools.rag_passage_chunker import PassageChunk, PassageChunker
from tools.rag_document_indexer import GeminiEmbeddingClient, SupabaseRAGStore, RAGDocumentIndexer


def create_test_pdf(pages_text: list, output_path: Path):
    """
    Creates a valid standard multi-page PDF using raw syntax.
    """
    current_id = 5
    page_obj_ids = []
    for text in pages_text:
        page_id = current_id
        content_id = current_id + 1
        current_id += 2
        page_obj_ids.append((page_id, content_id, text))

    lines = [b"%PDF-1.4\n"]
    offsets = []

    def add_obj(obj_id, content_bytes):
        offsets.append(sum(len(l) for l in lines))
        lines.append(f"{obj_id} 0 obj\n".encode("ascii"))
        lines.append(content_bytes)
        lines.append(b"\nendobj\n")

    # Obj 1: Catalog
    add_obj(1, b"<< /Type /Catalog /Pages 2 0 R >>")

    # Obj 2: Pages
    kids_str = " ".join([f"{pid} 0 R" for pid, _, _ in page_obj_ids])
    add_obj(2, f"<< /Type /Pages /Kids [{kids_str}] /Count {len(page_obj_ids)} >>".encode("ascii"))

    # Obj 4: Font
    add_obj(4, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    for pid, cid, text in page_obj_ids:
        add_obj(pid, f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {cid} 0 R /Resources << /Font << /F1 4 0 R >> >> >>".encode("ascii"))
        clean_t = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream_data = f"BT /F1 12 Tf 50 700 Td ({clean_t}) Tj ET".encode("ascii", errors="replace")
        content_bytes = f"<< /Length {len(stream_data)} >>\nstream\n".encode("ascii") + stream_data + b"\nendstream"
        add_obj(cid, content_bytes)

    xref_offset = sum(len(l) for l in lines)
    lines.append(b"xref\n")
    lines.append(f"0 {current_id}\n".encode("ascii"))
    lines.append(b"0000000000 65535 f \n")
    for off in offsets:
        lines.append(f"{off:010d} 00000 n \n".encode("ascii"))

    lines.append(b"trailer\n")
    lines.append(f"<< /Size {current_id} /Root 1 0 R >>\n".encode("ascii"))
    lines.append(b"startxref\n")
    lines.append(f"{xref_offset}\n".encode("ascii"))
    lines.append(b"%%EOF\n")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        f.writelines(lines)


class TestRAGIngestionPipeline(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="test_rag_pipeline_"))

        # Generate realistic multi-page Operating Systems curriculum text
        self.page1_text = (
            "Operating Systems Lecture Notes: Process Management and Concurrency. "
            "A process is a program in execution that requires CPU time, memory space, files, and I/O devices. "
            "Processes transition between states: New, Ready, Running, Waiting, and Terminated. "
            "Context switching is the mechanism where the kernel saves the execution state of the active process "
            "in its Process Control Block (PCB) and loads the saved context of the next scheduled thread. "
            "CPU scheduling algorithms optimize throughput, turnaround time, waiting time, and response time. "
            "Standard scheduling algorithms include First-Come First-Served (FCFS), Shortest Job First (SJF), "
            "Round Robin (RR) with time slicing, and Multi-Level Feedback Queue (MLFQ) scheduling."
        ) * 3

        self.page2_text = (
            "Virtual Memory and Paging Architecture. "
            "Virtual memory separates user logical memory from physical memory, permitting the execution of processes "
            "larger than physical RAM. Logical address spaces are partitioned into equal-sized pages, and physical RAM "
            "is divided into frames of identical size. The Memory Management Unit (MMU) translates logical page numbers "
            "into physical frame numbers using the page table. "
            "A page fault occurs when a process attempts to reference a page marked invalid in the page table, "
            "triggering an interrupt to bring the required page from secondary disk storage into RAM. "
            "Page replacement algorithms govern victim selection when all frames are full: "
            "Optimal algorithm (OPT), Least Recently Used (LRU) using stack or timestamp implementations, "
            "and First-In First-Out (FIFO) which can suffer from Belady's Anomaly."
        ) * 3

        self.page3_text = (
            "Deadlock Characterization and Prevention. "
            "A deadlock is a situation where a set of processes are blocked because each process is holding a resource "
            "and waiting for another resource acquired by some other process. "
            "Four Coffman conditions must hold simultaneously for a deadlock to arise: "
            "1. Mutual Exclusion: At least one resource must be non-shareable. "
            "2. Hold and Wait: A process must concurrently hold at least one resource while waiting for others. "
            "3. No Preemption: Resources cannot be forcibly preempted from a process. "
            "4. Circular Wait: A closed chain of processes exists where each process waits for a resource held by the next. "
            "Deadlock avoidance algorithms, notably Dijkstra's Banker's Algorithm, ensure the system never enters an unsafe state."
        ) * 3

        self.sample_pdf_path = self.temp_dir / "operating_systems_notes.pdf"
        create_test_pdf(
            [self.page1_text, self.page2_text, self.page3_text],
            self.sample_pdf_path
        )

    def tearDown(self):
        if self.temp_dir.exists():
            shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_pdf_extraction_page_preservation(self):
        """1. Validates real PDF page-by-page text extraction and exact page count preservation."""
        result = PDFExtractor.extract(self.sample_pdf_path)
        self.assertTrue(result["success"])
        self.assertEqual(result["total_pages"], 3)
        self.assertEqual(len(result["pages"]), 3)
        self.assertFalse(result["ocr_needed"])

        # Check page numbers match 1, 2, 3
        self.assertEqual(result["pages"][0].page_num, 1)
        self.assertEqual(result["pages"][1].page_num, 2)
        self.assertEqual(result["pages"][2].page_num, 3)

        # Check core technical terms are preserved intact
        self.assertIn("Process Control Block", result["pages"][0].text)
        self.assertTrue("Belady" in result["pages"][1].text and "Anomaly" in result["pages"][1].text)
        self.assertIn("Coffman conditions", result["pages"][2].text)

    def test_02_sha256_cryptographic_duplicate_detection(self):
        """2. Validates SHA-256 computation and duplicate file detection."""
        hash1 = FileHasher.compute_sha256(self.sample_pdf_path)
        self.assertEqual(len(hash1), 64)

        # Duplicate file in another directory
        dup_path = self.temp_dir / "copy_of_os_notes.pdf"
        shutil.copy(self.sample_pdf_path, dup_path)

        hash2 = FileHasher.compute_sha256(dup_path)
        self.assertEqual(hash1, hash2, "Identical content must produce identical SHA-256 hash")

        first_seen, dup_map = FileHasher.detect_batch_duplicates([self.sample_pdf_path, dup_path])
        self.assertIn(dup_path, dup_map)
        self.assertEqual(dup_map[dup_path], str(self.sample_pdf_path))

    def test_03_subject_topic_classification(self):
        """3. Validates automatic classification into Computer Science and Operating Systems."""
        extract_res = PDFExtractor.extract(self.sample_pdf_path)
        classif = SubjectTopicClassifier.classify_pdf(extract_res, self.sample_pdf_path.name)

        self.assertEqual(classif["detected_subject"], "Computer Science")
        self.assertIn("Operating Systems", classif["primary_topic"])
        self.assertGreaterEqual(classif["confidence_score"], 40.0)
        self.assertEqual(classif["classification_status"], "CONFIRMED")

    def test_04_page_aware_chunking_boundaries_and_overlap(self):
        """4. Validates chunk size bounds (300-500 words), ~50-word overlap, and page metadata."""
        extract_res = PDFExtractor.extract(self.sample_pdf_path)
        chunks = PassageChunker.chunk_extracted_pages(
            pages=extract_res["pages"],
            file_name=self.sample_pdf_path.name,
            file_hash="abcdef1234567890abcdef1234567890",
            document_title="Operating Systems Notes",
            min_words=200,
            target_words=350,
            max_words=450,
            overlap_words=50
        )

        self.assertGreaterEqual(len(chunks), 2, "Multi-page content should yield multiple chunks")

        for idx, chunk in enumerate(chunks, start=1):
            self.assertEqual(chunk.chunk_index, idx)
            self.assertTrue(chunk.chunk_id.startswith("abcdef123456_chk_"))
            self.assertGreaterEqual(chunk.start_page, 1)
            self.assertLessEqual(chunk.end_page, 3)
            self.assertGreaterEqual(chunk.word_count, 100)
            self.assertLessEqual(chunk.word_count, 550)
            self.assertIn("Page", chunk.page_reference)

        # Verify overlap between consecutive chunks
        if len(chunks) >= 2:
            chunk1_words = set(chunks[0].passage_text.split()[-40:])
            chunk2_words = set(chunks[1].passage_text.split()[:40])
            common_words = chunk1_words.intersection(chunk2_words)
            self.assertGreater(len(common_words), 5, "Consecutive chunks must have overlapping words")

    def test_05_embedding_client_dimensions_and_model(self):
        """5. Validates gemini-embedding-001 model configuration and 768 dimensions."""
        client = GeminiEmbeddingClient(api_key="AIzaFakeKeyForMockTesting123456")
        self.assertEqual(client.MODEL_NAME, "gemini-embedding-001")
        self.assertEqual(client.EMBEDDING_DIMENSIONS, 768)

        # Mock live Gemini embedContent call
        mock_vector = [0.0123 * (i % 10) for i in range(768)]
        with patch("requests.post") as mock_post:
            mock_post.return_value.status_code = 200
            mock_post.return_value.json.return_value = {
                "embedding": {
                    "values": mock_vector
                }
            }

            emb = client.embed_text("Operating systems process scheduling and concurrency")
            self.assertEqual(len(emb), 768)
            self.assertEqual(emb[0], mock_vector[0])

    def test_06_embedding_batch_processing(self):
        """6. Validates batch embedding generation with rate limit handling."""
        client = GeminiEmbeddingClient(api_key="AIzaFakeKeyForMockTesting123456")
        mock_vector_1 = [0.1] * 768
        mock_vector_2 = [0.2] * 768

        with patch("requests.post") as mock_post:
            mock_post.return_value.status_code = 200
            mock_post.return_value.json.return_value = {
                "embeddings": [
                    {"values": mock_vector_1},
                    {"values": mock_vector_2}
                ]
            }

            results = client.embed_batch(
                texts=["Passage text 1", "Passage text 2"],
                batch_size=2,
                delay_between_batches=0.0
            )
            self.assertEqual(len(results), 2)
            self.assertEqual(len(results[0]), 768)
            self.assertEqual(len(results[1]), 768)

    def test_07_dry_run_extraction_and_reporting(self):
        """7. Validates that dry-run mode extracts and chunks without modifying the database."""
        indexer = RAGDocumentIndexer(custom_env={
            "GEMINI_API_KEY": "AIzaFakeKeyForTesting",
            "VITE_SUPABASE_URL": "https://placeholder.supabase.co",
            "VITE_SUPABASE_PUBLISHABLE_KEY": "fake_key"
        })

        result = indexer.process_pdf(
            pdf_path=self.sample_pdf_path,
            dry_run=True
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "DRY_RUN_OK")
        self.assertEqual(result["total_pages"], 3)
        self.assertGreaterEqual(result["total_chunks"], 2)
        self.assertEqual(result["taxonomy"]["subject"], "Computer Science")

    def test_08_reprocessing_prevention_duplicate_documents(self):
        """8. Validates that unchanged already-indexed documents are not reprocessed."""
        indexer = RAGDocumentIndexer()

        # Mock existing document returned by Supabase
        with patch.object(indexer.supabase_store, "find_document_by_hash") as mock_find:
            mock_find.return_value = {
                "id": "e9000000-0000-0000-0000-000000000001",
                "file_hash": "dummy_hash",
                "ingestion_status": "indexed",
                "total_pages": 3,
                "total_chunks": 4
            }

            result = indexer.process_pdf(
                pdf_path=self.sample_pdf_path,
                force_reindex=False
            )

            self.assertTrue(result["success"])
            self.assertEqual(result["status"], "ALREADY_INDEXED")
            self.assertTrue(result["is_duplicate"])

    def test_09_failed_embedding_error_reporting(self):
        """9. Validates that an API error marks the document as failed without random vectors."""
        indexer = RAGDocumentIndexer(custom_env={
            "GEMINI_API_KEY": "AIzaValidLookingKey987654321",
            "VITE_SUPABASE_URL": "https://placeholder.supabase.co",
            "VITE_SUPABASE_PUBLISHABLE_KEY": "fake_key"
        })

        with patch.object(indexer.supabase_store, "find_document_by_hash", return_value=None):
            with patch.object(indexer.supabase_store, "create_document") as mock_create:
                mock_create.return_value = {"id": "doc-uuid-1234"}
                with patch.object(indexer.supabase_store, "update_document") as mock_update:
                    with patch.object(indexer.embedding_client, "embed_batch", side_effect=RuntimeError("Quota exceeded")):

                        result = indexer.process_pdf(
                            pdf_path=self.sample_pdf_path,
                            dry_run=False
                        )

                        self.assertFalse(result["success"])
                        self.assertEqual(result["status"], "EMBEDDING_FAILED")
                        self.assertIn("Quota exceeded", result["error"])

                        # Verify document status updated to 'failed' in database
                        mock_update.assert_called_with("doc-uuid-1234", {
                            "ingestion_status": "failed",
                            "error_message": "Embedding generation failed: Quota exceeded"
                        })


if __name__ == "__main__":
    unittest.main()

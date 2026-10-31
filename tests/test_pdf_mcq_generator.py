"""
Test Suite for ExamSathi AI - Local PDF-to-CSV MCQ Generator
=============================================================
Tests all core capabilities:
1. Synthetic PDF generation (single-topic, merged multi-topic, and scanned empty).
2. PDF text extraction & OCR detection (<50 chars/page warning).
3. Topic identification and document chunking with page reference tracking.
4. MCQ schema validation, answer key alignment, and deduplication hashing.
5. RFC 4180 CSV export with UTF-8 encoding and schema compatibility.
6. Graceful Gemini API error handling (missing/placeholder key diagnostics).
7. End-to-end dry-run execution and report generation.
"""

import os
import sys
import json
import csv
import shutil
import tempfile
import unittest
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.pdf_mcq_generator import (
    PDFExtractor,
    TopicChunker,
    MCQValidator,
    CSVExporter,
    GeminiMCQClient,
    PDFMCQGenerator,
    SYLLABUS_CATALOG,
    get_gemini_api_key
)


def create_minimal_pdf(pages_text: list, output_path: Path):
    """
    Creates a valid standard PDF with text streams using raw PDF syntax.
    Works without external graphical libraries.
    """
    objects = []
    page_obj_ids = []

    # Obj 1: Catalog
    # Obj 2: Pages
    # Next objs: Page, Content stream, Font
    font_obj_id = 4

    current_id = 5
    for page_idx, text in enumerate(pages_text):
        page_id = current_id
        content_id = current_id + 1
        current_id += 2
        page_obj_ids.append((page_id, content_id, text))

    lines = [b"%PDF-1.4\n"]
    offsets = []

    # 1 0 obj: Catalog
    offsets.append(sum(len(l) for l in lines))
    lines.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")

    # 2 0 obj: Pages
    kids_str = " ".join([f"{pid} 0 R" for pid, _, _ in page_obj_ids])
    offsets.append(sum(len(l) for l in lines))
    lines.append(f"2 0 obj\n<< /Type /Pages /Kids [{kids_str}] /Count {len(page_obj_ids)} >>\nendobj\n".encode("utf-8"))

    # 4 0 obj: Font (Standard Helvetica)
    offsets.append(sum(len(l) for l in lines))
    lines.append(b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")

    for pid, cid, text in page_obj_ids:
        # Page object
        offsets.append(sum(len(l) for l in lines))
        page_obj = f"{pid} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents {cid} 0 R >>\nendobj\n"
        lines.append(page_obj.encode("utf-8"))

        # Content object
        # Escape parenthesis
        safe_text = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream_content = f"BT\n/F1 12 Tf\n50 720 Td\n({safe_text}) Tj\nET\n".encode("utf-8")
        stream_len = len(stream_content)

        offsets.append(sum(len(l) for l in lines))
        content_obj = f"{cid} 0 obj\n<< /Length {stream_len} >>\nstream\n".encode("utf-8") + stream_content + b"endstream\nendobj\n"
        lines.append(content_obj)

    # Cross reference table
    xref_offset = sum(len(l) for l in lines)
    total_objs = current_id
    lines.append(f"xref\n0 {total_objs}\n0000000000 65535 f \n".encode("utf-8"))
    
    # Fill in xref table
    # Mapping of object IDs to offsets:
    id_offset_map = {1: offsets[0], 2: offsets[1], 4: offsets[2]}
    for idx, (pid, cid, _) in enumerate(page_obj_ids):
        id_offset_map[pid] = offsets[3 + idx * 2]
        id_offset_map[cid] = offsets[3 + idx * 2 + 1]

    for obj_num in range(1, total_objs):
        off = id_offset_map.get(obj_num, 0)
        lines.append(f"{off:010d} 00000 n \n".encode("utf-8"))

    lines.append(f"trailer\n<< /Size {total_objs} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("utf-8"))

    with open(output_path, "wb") as f:
        f.writelines(lines)


class TestPDFMCQGenerator(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_dir = Path(tempfile.mkdtemp(prefix="examsathi_mcq_test_"))

        # 1. Individual Topic PDF: Operating Systems
        cls.os_pdf_path = cls.test_dir / "Operating_Systems_Lecture_Notes.pdf"
        os_pages = [
            "Operating Systems Lecture 1: Process Concurrency and Coffman Conditions for Deadlocks. A deadlock requires Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait.",
            "Operating Systems Lecture 2: Memory Management, Virtual Memory, Paging, TLB Hit Ratio, Page Faults and Thrashing. Thrashing occurs when system spends more time paging than executing.",
            "Operating Systems Lecture 3: Semaphore vs Mutex and Banker's Algorithm for deadlock avoidance with safe and unsafe states."
        ]
        create_minimal_pdf(os_pages, cls.os_pdf_path)

        # 2. Merged Multi-Topic PDF: CS Lecturer Compendium
        cls.merged_pdf_path = cls.test_dir / "Lecturer_CS_Comprehensive_Notes.pdf"
        merged_pages = [
            # Page 1: OS
            "Chapter 1: Operating Systems. Concurrency, Semaphores, Mutexes, and Coffman Deadlock Conditions in modern OS kernels.",
            # Page 2: OS
            "Chapter 1 Cont: Virtual Memory, Paging, Demand Paging, Inverted Page Tables, and Page Replacement Algorithms.",
            # Page 3: DBMS
            "Chapter 2: Relational Database Systems. Normalization from 1NF to BCNF, Functional Dependencies, and Lossless Joins.",
            # Page 4: DBMS
            "Chapter 2 Cont: ACID Transaction Properties, Serializability, Two-Phase Locking Protocol (2PL), and B-Tree indexing.",
            # Page 5: Data Structures
            "Chapter 3: Data Structures and Algorithmic Complexity. Big-O Asymptotic analysis, AVL Tree rotations, and Heap Sort.",
            # Page 6: Data Structures
            "Chapter 3 Cont: Graph Traversals, Breadth First Search (BFS), Depth First Search (DFS), and Dijkstra Shortest Path."
        ]
        create_minimal_pdf(merged_pages, cls.merged_pdf_path)

        # 3. Scanned PDF (Minimal text / empty pages triggering OCR warning)
        cls.scanned_pdf_path = cls.test_dir / "Scanned_Handwritten_Notes.pdf"
        scanned_pages = [
            "p1",  # 2 chars
            "",    # 0 chars
            "p3"   # 2 chars
        ]
        create_minimal_pdf(scanned_pages, cls.scanned_pdf_path)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.test_dir, ignore_errors=True)

    def test_01_pdf_extractor_text_and_pages(self):
        """Verify text extraction, page counting, and character metrics."""
        result = PDFExtractor.extract(self.os_pdf_path)
        self.assertTrue(result["success"])
        self.assertEqual(result["total_pages"], 3)
        self.assertGreater(result["total_chars"], 200)
        self.assertFalse(result["ocr_needed"])
        self.assertIsNone(result["ocr_warning"])
        self.assertEqual(len(result["pages"]), 3)

        # Check page numbers
        self.assertEqual(result["pages"][0].page_num, 1)
        self.assertIn("Deadlock", result["pages"][0].text)
        self.assertEqual(result["pages"][1].page_num, 2)
        self.assertIn("Virtual Memory", result["pages"][1].text)

    def test_02_pdf_extractor_detects_scanned_ocr_need(self):
        """Verify that scanned or image-based PDFs with <50 chars/page trigger OCR warning."""
        result = PDFExtractor.extract(self.scanned_pdf_path)
        self.assertTrue(result["success"])
        self.assertEqual(result["total_pages"], 3)
        self.assertTrue(result["ocr_needed"], "Scanned PDF must flag ocr_needed=True")
        self.assertIsNotNone(result["ocr_warning"])
        self.assertIn("OCR", result["ocr_warning"])

    def test_03_topic_chunker_single_topic_detection(self):
        """Verify topic identification for an individual topic PDF."""
        extracted = PDFExtractor.extract(self.os_pdf_path)
        chunker = TopicChunker(exam_slug="fpsc-lecturer-cs-2026")

        chunks = chunker.chunk_individual_pdf(extracted)
        self.assertGreater(len(chunks), 0)
        self.assertEqual(chunks[0].topic_info["slug"], "operating_systems")
        self.assertEqual(chunks[0].start_page, 1)
        self.assertEqual(chunks[0].end_page, 3)
        self.assertEqual(chunks[0].page_reference, "Pages 1-3")

    def test_04_topic_chunker_merged_pdf_partitioning(self):
        """Verify that merged multi-topic PDF is partitioned into syllabus-aligned topic sections."""
        extracted = PDFExtractor.extract(self.merged_pdf_path)
        chunker = TopicChunker(exam_slug="fpsc-lecturer-cs-2026")

        chunks = chunker.chunk_merged_pdf(extracted)
        self.assertGreaterEqual(len(chunks), 3, "Merged PDF with 3 topics should yield at least 3 chunks")

        detected_slugs = [c.topic_info["slug"] for c in chunks]
        self.assertIn("operating_systems", detected_slugs)
        self.assertIn("dbms", detected_slugs)
        self.assertIn("algorithms_and_data_structures", detected_slugs)

        # Check that page references reflect original master document pages
        os_chunk = next(c for c in chunks if c.topic_info["slug"] == "operating_systems")
        self.assertIn(os_chunk.start_page, [1, 2])

        dbms_chunk = next(c for c in chunks if c.topic_info["slug"] == "dbms")
        self.assertIn(dbms_chunk.start_page, [3, 4])

    def test_05_mcq_validator_accepts_valid_question(self):
        """Verify canonical valid question passes validation and formats correctly."""
        extracted = PDFExtractor.extract(self.os_pdf_path)
        chunker = TopicChunker(exam_slug="fpsc-lecturer-cs-2026")
        chunks = chunker.chunk_individual_pdf(extracted)
        chk = chunks[0]

        valid_raw = [
            {
                "question_text": "Which of the following conditions is NOT one of the four necessary Coffman conditions for a deadlock?",
                "option_a": "Mutual Exclusion",
                "option_b": "Hold and Wait",
                "option_c": "Preemptive Scheduling",
                "option_d": "Circular Wait",
                "correct_option": 2,
                "correct_answer_text": "Preemptive Scheduling",
                "explanation": "The four Coffman conditions are Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait. Preemption breaks deadlock.",
                "difficulty": "Moderate",
                "source_page": "Pages 1-3"
            }
        ]

        validator = MCQValidator()
        exam_id = SYLLABUS_CATALOG["fpsc-lecturer-cs-2026"]["exam_id"]
        res = validator.validate_and_deduplicate(valid_raw, chk, exam_id)

        self.assertEqual(len(res.accepted), 1)
        self.assertEqual(len(res.rejected), 0)
        self.assertEqual(len(res.duplicates), 0)

        accepted_q = res.accepted[0]
        self.assertEqual(accepted_q["correct_option"], 2)
        self.assertEqual(accepted_q["subject_id"], "a1000000-0000-0000-0000-000000000007")
        self.assertEqual(accepted_q["exam_id"], "e1000000-0000-0000-0000-000000000005")
        self.assertEqual(accepted_q["syllabus_topic_id"], "d1000000-0000-0005-0000-000000000001")
        self.assertFalse(accepted_q["is_published"])
        self.assertEqual(accepted_q["question_origin"], "ai_generated_practice")

    def test_06_mcq_validator_rejects_malformed_records(self):
        """Verify that incomplete or invalid questions are rejected with clear reasons."""
        extracted = PDFExtractor.extract(self.os_pdf_path)
        chunker = TopicChunker(exam_slug="fpsc-lecturer-cs-2026")
        chunks = chunker.chunk_individual_pdf(extracted)
        chk = chunks[0]
        exam_id = SYLLABUS_CATALOG["fpsc-lecturer-cs-2026"]["exam_id"]

        malformed_raw = [
            # 1. Short text (<10 chars)
            {
                "question_text": "Short?",
                "option_a": "A", "option_b": "B", "option_c": "C", "option_d": "D",
                "correct_option": 0, "explanation": "Valid explanation"
            },
            # 2. Empty option
            {
                "question_text": "Which concurrency mechanism is used for mutual exclusion?",
                "option_a": "Mutex", "option_b": "", "option_c": "Semaphore", "option_d": "Spinlock",
                "correct_option": 0, "explanation": "Valid explanation"
            },
            # 3. Duplicate identical options
            {
                "question_text": "Which data structure implements FIFO order?",
                "option_a": "Queue", "option_b": "Queue", "option_c": "Stack", "option_d": "Tree",
                "correct_option": 0, "explanation": "Queue is FIFO"
            },
            # 4. Out of range correct_option index
            {
                "question_text": "What is the primary role of the Translation Lookaside Buffer (TLB)?",
                "option_a": "Cache page table entries", "option_b": "Manage I/O queues",
                "option_c": "Handle page replacement", "option_d": "Disk defragmentation",
                "correct_option": 5, "explanation": "TLB caches page translations"
            },
            # 5. Mismatched correct_answer_text
            {
                "question_text": "What is the primary role of Banker's Algorithm?",
                "option_a": "Deadlock avoidance", "option_b": "Deadlock detection",
                "option_c": "Process scheduling", "option_d": "Memory compaction",
                "correct_option": 0, "correct_answer_text": "Process scheduling",  # Mismatch!
                "explanation": "Banker's algorithm avoids deadlocks"
            }
        ]

        validator = MCQValidator()
        res = validator.validate_and_deduplicate(malformed_raw, chk, exam_id)

        self.assertEqual(len(res.accepted), 0, "No malformed records should be accepted")
        self.assertEqual(len(res.rejected), 5, "All 5 malformed records must be rejected")

        # Inspect specific error messages
        self.assertTrue(any("too short" in err for err in res.rejected[0]["errors"]))
        self.assertTrue(any("options are empty" in err for err in res.rejected[1]["errors"]))
        self.assertTrue(any("duplicate/identical options" in err for err in res.rejected[2]["errors"]))
        self.assertTrue(any("Invalid correct_option index" in err for err in res.rejected[3]["errors"]))
        self.assertTrue(any("does not match option index" in err for err in res.rejected[4]["errors"]))

    def test_07_mcq_deduplication_in_batch_and_against_database(self):
        """Verify in-batch and cross-database duplicate detection via SHA-256 hash."""
        extracted = PDFExtractor.extract(self.os_pdf_path)
        chunker = TopicChunker(exam_slug="fpsc-lecturer-cs-2026")
        chunks = chunker.chunk_individual_pdf(extracted)
        chk = chunks[0]
        exam_id = SYLLABUS_CATALOG["fpsc-lecturer-cs-2026"]["exam_id"]
        subject_id = chk.topic_info["subject_id"]

        existing_q_text = "In modern operating systems, virtual memory paging suffers from severe thrashing when the system spends more time paging than executing."
        existing_hash = MCQValidator.calculate_hash(subject_id, existing_q_text)

        validator = MCQValidator(existing_hashes={existing_hash})

        batch = [
            # 1. Matches existing database record
            {
                "question_text": "IN MODERN OPERATING SYSTEMS, virtual memory paging suffers from severe thrashing when the system spends more time paging than executing.",
                "option_a": "Thrashing", "option_b": "Paging", "option_c": "Swapping", "option_d": "Fragmentation",
                "correct_option": 0, "correct_answer_text": "Thrashing",
                "explanation": "Thrashing occurs when paging takes up excessive CPU time.",
                "difficulty": "Moderate"
            },
            # 2. Unique question
            {
                "question_text": "What does the Banker's algorithm test before allocating resources to a requesting process?",
                "option_a": "System stays in a safe state", "option_b": "All resources are freed",
                "option_c": "Circular wait is immediately broken", "option_d": "Mutual exclusion is disabled",
                "correct_option": 0, "correct_answer_text": "System stays in a safe state",
                "explanation": "Banker's algorithm checks for a safe state before granting requests.",
                "difficulty": "Moderate"
            },
            # 3. Duplicate of unique question within same batch
            {
                "question_text": "What does the Banker's algorithm test before allocating resources to a requesting process?",
                "option_a": "System stays in a safe state", "option_b": "All resources are freed",
                "option_c": "Circular wait is immediately broken", "option_d": "Mutual exclusion is disabled",
                "correct_option": 0, "correct_answer_text": "System stays in a safe state",
                "explanation": "Banker's algorithm checks for safe state.",
                "difficulty": "Moderate"
            }
        ]

        res = validator.validate_and_deduplicate(batch, chk, exam_id)
        self.assertEqual(len(res.accepted), 1, "Only the 1 unique question should be accepted")
        self.assertEqual(len(res.duplicates), 2, "Both DB match and in-batch duplicate should be caught")
        self.assertIn("database record", res.duplicates[0]["reason"])
        self.assertIn("current generation session", res.duplicates[1]["reason"])

    def test_08_csv_exporter_utf8_rfc4180_and_schema_matching(self):
        """Verify that exported CSV adheres to RFC 4180, uses UTF-8, and matches ingestion schema."""
        output_dir = self.test_dir / "generated_mcqs_test"
        exporter = CSVExporter(output_dir=output_dir)

        test_questions = [
            {
                "question_text": "Which normal form eliminates partial dependency on a composite primary key?",
                "option_a": "1NF (First Normal Form)",
                "option_b": "2NF (Second Normal Form)",
                "option_c": "3NF (Third Normal Form)",
                "option_d": "BCNF (Boyce-Codd Normal Form)",
                "correct_option": 1,
                "correct_answer_text": "2NF (Second Normal Form)",
                "difficulty": "Moderate",
                "subject": "Computer Science",
                "subject_id": "a1000000-0000-0000-0000-000000000007",
                "exam": "fpsc-lecturer-cs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000005",
                "topic": "Database Systems: Normalization, BCNF & ACID Transactions",
                "syllabus_topic_id": "d1000000-0000-0005-0000-000000000002",
                "explanation": "2NF requires 1NF plus the absence of partial dependencies, where non-prime attributes depend on the full composite key.",
                "source_title": "Lecturer_CS_Comprehensive_Notes.pdf",
                "source_page": "Pages 3-4",
                "source_url": "",
                "question_origin": "ai_generated_practice",
                "verification_status": "practice_exercise",
                "is_published": False
            }
        ]

        csv_path = exporter.export_topic_csv("dbms", test_questions)
        self.assertTrue(csv_path.exists())
        self.assertEqual(csv_path.name, "computer_science_lecturer_dbms.csv")

        # Read back and verify CSV headers & values
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames
            rows = list(reader)

        self.assertEqual(len(rows), 1)
        row = rows[0]

        # Verify required headers for questionIngestionService
        expected_headers = [
            "question_text", "option_a", "option_b", "option_c", "option_d",
            "correct_option", "correct_answer_text", "difficulty", "subject",
            "subject_id", "exam", "exam_id", "topic", "syllabus_topic_id",
            "explanation", "source_title", "source_page", "source_url",
            "question_origin", "verification_status", "is_published"
        ]
        for eh in expected_headers:
            self.assertIn(eh, headers)

        self.assertEqual(row["correct_option"], "1")
        self.assertEqual(row["is_published"], "false")
        self.assertEqual(row["exam_id"], "e1000000-0000-0000-0000-000000000005")
        self.assertEqual(row["syllabus_topic_id"], "d1000000-0000-0005-0000-000000000002")

    def test_09_gemini_client_graceful_missing_key_behavior(self):
        """Verify that Gemini client reports clearly and refuses to fake responses when key is unconfigured."""
        client_missing = GeminiMCQClient(api_key=None)
        self.assertFalse(client_missing.is_available())

        client_placeholder = GeminiMCQClient(api_key="your_gemini_api_key_here")
        self.assertFalse(client_placeholder.is_available())

        # Calling generate without valid key should raise RuntimeError with clean explanation
        extracted = PDFExtractor.extract(self.os_pdf_path)
        chunker = TopicChunker(exam_slug="fpsc-lecturer-cs-2026")
        chunks = chunker.chunk_individual_pdf(extracted)

        with self.assertRaises(RuntimeError) as cm:
            client_placeholder.generate_mcqs_for_chunk(chunks[0], "Lecturer CS")
        self.assertIn("Gemini API is not configured", str(cm.exception))

    def test_10_end_to_end_generator_dry_run(self):
        """Verify full CLI and programmatic orchestration in dry-run mode on merged PDF."""
        output_dir = self.test_dir / "generated_mcqs_e2e"
        generator = PDFMCQGenerator(
            exam_slug="fpsc-lecturer-cs-2026",
            output_dir=str(output_dir),
            custom_env={"GEMINI_API_KEY": "your_gemini_api_key_here"}  # placeholder triggers dry-run safety
        )

        report = generator.process_pdf(
            pdf_path=self.merged_pdf_path,
            mode="merged",
            dry_run=True
        )

        self.assertTrue(report.get("dry_run"))
        self.assertEqual(report["file_name"], "Lecturer_CS_Comprehensive_Notes.pdf")
        self.assertEqual(report["total_pages"], 6)
        self.assertGreaterEqual(report["chunks_count"], 3)
        self.assertTrue((output_dir / "generation_report.json").exists())


if __name__ == "__main__":
    unittest.main()

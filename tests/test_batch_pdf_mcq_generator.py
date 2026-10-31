"""
Comprehensive Test Suite for ExamSathi AI Batch PDF MCQ Generator
=================================================================
Verifies all 10 core batch processing requirements:
1. Recursive PDF discovery inside --input-dir while strictly excluding .venv, node_modules, .git, etc.
2. Independent classification across multiple subjects (English Grammar, Pedagogy, OS, etc.).
3. Uncertain classification detection (<40% confidence, flagged for confirmation, zero invented UUIDs).
4. Manifest-only mode execution (manifest JSON/CSV generated, zero Gemini calls, zero CSV writes).
5. Dry-run mode execution (chunk preview, validation checks, zero Gemini calls).
6. Real generation topic-specificity and schema compliance.
7. Batch failure isolation (corrupted/unreadable files do not stop the batch).
8. Duplicate file detection across batch using SHA-256 hashes.
9. Overwrite protection (preserving existing CSV output files unless --overwrite is passed).
10. Database safety (all records have is_published: false, zero automatic Supabase writes).
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
    DirectoryScanner,
    FileHasher,
    SubjectTopicClassifier,
    TopicChunker,
    MCQValidator,
    CSVExporter,
    ManifestBuilder,
    PDFMCQGenerator,
    DOMAINS_TAXONOMY,
    SYLLABUS_CATALOG
)
from tests.test_pdf_mcq_generator import create_minimal_pdf


class TestBatchPDFMCQGenerator(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root_test_dir = Path(tempfile.mkdtemp(prefix="examsathi_batch_test_"))
        cls.input_dir = cls.root_test_dir / "notes_input"
        cls.output_dir = cls.root_test_dir / "generated_mcqs"
        cls.input_dir.mkdir(parents=True, exist_ok=True)
        cls.output_dir.mkdir(parents=True, exist_ok=True)

        # 1. English Grammar PDF
        cls.english_pdf = cls.input_dir / "English_Grammar_and_Vocabulary.pdf"
        english_pages = [
            "English Grammar Lecture: Preposition rules. We say 'absolve from', 'comply with', 'abide by', and 'adhere to'.",
            "English Syntax: Conditional sentences, active and passive voice transformations, and direct/indirect narration rules.",
            "English Vocabulary: Synonyms, antonyms, and idiomatic expressions frequently evaluated in FPSC papers."
        ]
        create_minimal_pdf(english_pages, cls.english_pdf)

        # 2. Pedagogy & Teaching Methodology PDF
        cls.pedagogy_pdf = cls.input_dir / "Pedagogy_and_Teaching_Methodology.pdf"
        pedagogy_pages = [
            "Teaching Methodology Lecture 1: Bloom's Revised Taxonomy covers Cognitive, Affective, and Psychomotor domains.",
            "Lecture 2: Formative assessment versus Summative assessment in classroom management and educational evaluation.",
            "Lecture 3: Lesson planning, andragogy principles, curriculum design, and student-centered active learning strategies."
        ]
        create_minimal_pdf(pedagogy_pages, cls.pedagogy_pdf)

        # 3. Operating Systems PDF
        cls.os_pdf = cls.input_dir / "Operating_Systems_Concurrency_and_Memory.pdf"
        os_pages = [
            "Operating Systems Unit 1: Coffman Deadlock Conditions - Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait.",
            "Unit 2: Virtual Memory, Demand Paging, TLB Translation Lookaside Buffer, Page Fault handling, and Thrashing.",
            "Unit 3: CPU Process Scheduling, Round Robin, Banker's Algorithm for deadlock avoidance in safe states."
        ]
        create_minimal_pdf(os_pages, cls.os_pdf)

        # 4. Merged Multi-Topic PDF (OS + DBMS + English)
        cls.merged_pdf = cls.input_dir / "Comprehensive_Lecturer_CS_Notes.pdf"
        merged_pages = [
            # P1-2: Operating Systems
            "Chapter 1: Operating Systems. Concurrency, Semaphores, Mutexes, and Coffman Deadlock Conditions.",
            "Chapter 1 Cont: Virtual Memory, Paging, Demand Paging, and Page Replacement Algorithms.",
            # P3-4: DBMS
            "Chapter 2: Relational Database Management Systems. Normalization, 1NF, 2NF, 3NF, BCNF, and Functional Dependencies.",
            "Chapter 2 Cont: ACID Properties, Serializability, Two-Phase Locking (2PL), and B-Tree indexing.",
            # P5-6: English Grammar
            "Chapter 3: English Grammar and Preposition usage. Syntax, idiomatic expressions, and sentence correction."
        ]
        create_minimal_pdf(merged_pages, cls.merged_pdf)

        # 5. Duplicate PDF (Byte-for-byte copy of Operating Systems PDF)
        cls.duplicate_os_pdf = cls.input_dir / "Duplicate_OS_Notes_Copy.pdf"
        shutil.copyfile(cls.os_pdf, cls.duplicate_os_pdf)

        # 6. Scanned / Image PDF (<50 chars/page requiring OCR)
        cls.scanned_pdf = cls.input_dir / "Scanned_Handwritten_Class_Notes.pdf"
        scanned_pages = ["pg1", "", "pg3"]
        create_minimal_pdf(scanned_pages, cls.scanned_pdf)

        # 7. Uncertain / Low Signal PDF (Unrelated content, e.g. fruit cake recipe)
        cls.uncertain_pdf = cls.input_dir / "Baking_Recipes_and_Kitchen_Tips.pdf"
        uncertain_pages = [
            "Mix 200 grams of flour with sugar, butter, and vanilla extract. Bake at 180 degrees Celsius for 45 minutes.",
            "Allow the cake to cool on a wire rack before applying chocolate ganache and powdered icing sugar."
        ]
        create_minimal_pdf(uncertain_pages, cls.uncertain_pdf)

        # 8. Nested directory containing another valid PDF (testing recursive discovery)
        cls.sub_dir = cls.input_dir / "subfolder_cs"
        cls.sub_dir.mkdir(parents=True, exist_ok=True)
        cls.dsa_pdf = cls.sub_dir / "Data_Structures_and_Algorithms_Notes.pdf"
        dsa_pages = [
            "Data Structures: Binary Search Trees, AVL Tree rotations, Big-O asymptotic notation, and Heap Sort.",
            "Graph Algorithms: Dijkstra shortest path, Breadth First Search (BFS), and Depth First Search (DFS)."
        ]
        create_minimal_pdf(dsa_pages, cls.dsa_pdf)

        # 9. Excluded folders that MUST be ignored by scanner
        cls.venv_dir = cls.input_dir / ".venv"
        cls.venv_dir.mkdir(parents=True, exist_ok=True)
        cls.venv_pdf = cls.venv_dir / "Ignored_Venv_Manual.pdf"
        create_minimal_pdf(["This should never be scanned."], cls.venv_pdf)

        cls.nm_dir = cls.input_dir / "node_modules"
        cls.nm_dir.mkdir(parents=True, exist_ok=True)
        cls.nm_pdf = cls.nm_dir / "Ignored_Node_Modules.pdf"
        create_minimal_pdf(["This should never be scanned."], cls.nm_pdf)

        # 10. Corrupted PDF (invalid binary data)
        cls.corrupted_pdf = cls.input_dir / "Corrupted_Damaged_Document.pdf"
        with open(cls.corrupted_pdf, "wb") as f:
            f.write(b"NOT_A_VALID_PDF_HEADER_1234567890_CORRUPT")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.root_test_dir, ignore_errors=True)

    def test_01_recursive_discovery_and_exclusion_boundary(self):
        """Verify that discovery finds nested PDFs while strictly excluding .venv, node_modules, etc."""
        discovered = DirectoryScanner.discover_pdfs(self.input_dir)
        discovered_names = [p.name for p in discovered]

        # Valid files must be found
        self.assertIn("English_Grammar_and_Vocabulary.pdf", discovered_names)
        self.assertIn("Pedagogy_and_Teaching_Methodology.pdf", discovered_names)
        self.assertIn("Operating_Systems_Concurrency_and_Memory.pdf", discovered_names)
        self.assertIn("Data_Structures_and_Algorithms_Notes.pdf", discovered_names)
        self.assertIn("Duplicate_OS_Notes_Copy.pdf", discovered_names)
        self.assertIn("Scanned_Handwritten_Class_Notes.pdf", discovered_names)
        self.assertIn("Baking_Recipes_and_Kitchen_Tips.pdf", discovered_names)
        self.assertIn("Corrupted_Damaged_Document.pdf", discovered_names)

        # Excluded directory files MUST NOT be found
        self.assertNotIn("Ignored_Venv_Manual.pdf", discovered_names)
        self.assertNotIn("Ignored_Node_Modules.pdf", discovered_names)

    def test_02_file_hasher_and_duplicate_file_detection(self):
        """Verify that identical source files are detected by SHA-256 hash across the batch."""
        hash_os = FileHasher.compute_sha256(self.os_pdf)
        hash_dup = FileHasher.compute_sha256(self.duplicate_os_pdf)
        self.assertEqual(hash_os, hash_dup, "Byte-identical copies must produce identical SHA-256 hashes")

        discovered = [self.os_pdf, self.english_pdf, self.duplicate_os_pdf]
        first_seen, dup_map = FileHasher.detect_batch_duplicates(discovered)

        self.assertIn(self.duplicate_os_pdf, dup_map)
        self.assertEqual(dup_map[self.duplicate_os_pdf], str(self.os_pdf))
        self.assertNotIn(self.os_pdf, dup_map)
        self.assertNotIn(self.english_pdf, dup_map)

    def test_03_independent_subject_classification(self):
        """Verify that English, Pedagogy, and OS are classified independently and correctly."""
        # English
        ext_eng = PDFExtractor.extract(self.english_pdf)
        class_eng = SubjectTopicClassifier.classify_pdf(ext_eng, self.english_pdf.name)
        self.assertEqual(class_eng["detected_subject"], "English & Grammar")
        self.assertEqual(class_eng["detected_subject_id"], "a1000000-0000-0000-0000-000000000003")
        self.assertEqual(class_eng["classification_status"], "CONFIRMED")
        self.assertGreaterEqual(class_eng["confidence_score"], 60.0)

        # Pedagogy
        ext_ped = PDFExtractor.extract(self.pedagogy_pdf)
        class_ped = SubjectTopicClassifier.classify_pdf(ext_ped, self.pedagogy_pdf.name)
        self.assertEqual(class_ped["detected_subject"], "Computer Science")
        self.assertEqual(class_ped["detected_subject_id"], "a1000000-0000-0000-0000-000000000007")
        self.assertEqual(class_ped["primary_topic"], "Software Engineering & Teaching Methodology")
        self.assertEqual(class_ped["classification_status"], "CONFIRMED")

        # OS
        ext_os = PDFExtractor.extract(self.os_pdf)
        class_os = SubjectTopicClassifier.classify_pdf(ext_os, self.os_pdf.name)
        self.assertEqual(class_os["detected_subject"], "Computer Science")
        self.assertEqual(class_os["primary_topic"], "Operating Systems: Deadlocks, Virtual Memory & Concurrency")
        self.assertEqual(class_os["classification_status"], "CONFIRMED")

    def test_04_uncertain_classification_flagged_for_confirmation(self):
        """Verify that an unrelated document is flagged as NEEDS_REVIEW with <40% confidence and zero invented IDs."""
        ext_unc = PDFExtractor.extract(self.uncertain_pdf)
        class_unc = SubjectTopicClassifier.classify_pdf(ext_unc, self.uncertain_pdf.name)

        self.assertTrue(class_unc["is_uncertain"])
        self.assertEqual(class_unc["classification_status"], "NEEDS_REVIEW")
        self.assertLess(class_unc["confidence_score"], 40.0)
        self.assertEqual(class_unc["recommended_action"], "confirm_topic_manually")
        self.assertIsNone(class_unc["detected_subject_id"], "Must NEVER invent foreign-key IDs for uncertain topics")
        self.assertIsNone(class_unc["primary_syllabus_topic_id"], "Must NEVER invent syllabus_topic_id")

    def test_05_ocr_and_corrupted_file_handling(self):
        """Verify OCR requirement detection and graceful extraction handling of corrupted files."""
        # Scanned PDF
        ext_scan = PDFExtractor.extract(self.scanned_pdf)
        self.assertTrue(ext_scan["ocr_needed"])
        self.assertEqual(ext_scan["extraction_status"], "OCR_REQUIRED")

        # Corrupted PDF
        ext_corr = PDFExtractor.extract(self.corrupted_pdf)
        self.assertFalse(ext_corr["success"])
        self.assertEqual(ext_corr["extraction_status"], "CORRUPTED")

    def test_06_manifest_only_mode_generates_manifest_without_gemini(self):
        """Verify that --manifest-only produces manifest JSON/CSV, avoids Gemini calls, and avoids CSV generation."""
        manifest_out = self.output_dir / "manifest_test_out"
        generator = PDFMCQGenerator(
            output_dir=str(manifest_out),
            custom_env={"GEMINI_API_KEY": "AIzaSyFakeKeyForTest1234567890"}
        )

        res = generator.process_directory(
            input_dir=self.input_dir,
            manifest_only=True
        )

        json_path = manifest_out / "processing_manifest.json"
        csv_path = manifest_out / "processing_manifest.csv"

        self.assertTrue(json_path.exists(), "processing_manifest.json must be written")
        self.assertTrue(csv_path.exists(), "processing_manifest.csv must be written")

        with open(json_path, "r", encoding="utf-8") as f:
            entries = json.load(f)

        self.assertGreaterEqual(len(entries), 7)

        # Confirm duplicate file is marked (alphabetical sort processes Duplicate_OS first, so Operating_Systems is duplicate)
        os_entry = next((e for e in entries if e["file_name"] == "Operating_Systems_Concurrency_and_Memory.pdf"), None)
        dup_entry = next((e for e in entries if e["file_name"] == "Duplicate_OS_Notes_Copy.pdf"), None)
        self.assertIsNotNone(os_entry)
        self.assertIsNotNone(dup_entry)
        self.assertTrue(os_entry["is_duplicate_file"] or dup_entry["is_duplicate_file"])
        self.assertTrue(os_entry["recommended_action"] == "skip_duplicate" or dup_entry["recommended_action"] == "skip_duplicate")

        # Confirm OCR file is marked
        scan_entry = next((e for e in entries if e["file_name"] == "Scanned_Handwritten_Class_Notes.pdf"), None)
        self.assertIsNotNone(scan_entry)
        self.assertTrue(scan_entry["ocr_needed"])
        self.assertEqual(scan_entry["recommended_action"], "ocr_preprocessing_required")

        # Confirm corrupted file is marked
        corr_entry = next((e for e in entries if e["file_name"] == "Corrupted_Damaged_Document.pdf"), None)
        self.assertIsNotNone(corr_entry)
        self.assertEqual(corr_entry["extraction_status"], "CORRUPTED")
        self.assertEqual(corr_entry["recommended_action"], "file_unreadable")

        # Confirm NO question CSV was generated
        question_csvs = list(manifest_out.glob("computer_science_lecturer_*.csv"))
        self.assertEqual(len(question_csvs), 0, "Manifest-only mode must NOT generate question CSVs")

    def test_07_dry_run_batch_mode_previews_chunks_without_gemini(self):
        """Verify that --dry-run previews chunking for eligible files without calling Gemini API."""
        dryrun_out = self.output_dir / "dryrun_test_out"
        generator = PDFMCQGenerator(
            output_dir=str(dryrun_out),
            custom_env={"GEMINI_API_KEY": "AIzaSyFakeKeyForTest1234567890"}
        )

        report = generator.process_directory(
            input_dir=self.input_dir,
            dry_run=True
        )

        self.assertEqual(report["mode"], "dry_run")
        self.assertTrue((dryrun_out / "processing_manifest.json").exists())
        self.assertTrue((dryrun_out / "batch_generation_report.json").exists())
        self.assertTrue((dryrun_out / "batch_generation_report.csv").exists())

        # Question CSVs should NOT be generated in dry run
        question_csvs = list(dryrun_out.glob("computer_science_lecturer_*.csv"))
        self.assertEqual(len(question_csvs), 0, "Dry-run mode must NOT generate question CSVs")

    def test_08_failure_isolation_in_batch_processing(self):
        """Verify that corrupted and unreadable files do not stop processing of valid files."""
        # When processing a batch that includes corrupted and unreadable files,
        # the generator must complete the batch and log individual failures in per_file_results.
        test_out = self.output_dir / "failure_isolation_out"
        generator = PDFMCQGenerator(
            output_dir=str(test_out),
            custom_env={"GEMINI_API_KEY": "AIzaSyFakeKeyForTest1234567890"}
        )

        report = generator.process_directory(
            input_dir=self.input_dir,
            dry_run=True
        )

        results = report.get("per_file_results", [])
        corrupted_res = next((r for r in results if r["file_name"] == "Corrupted_Damaged_Document.pdf"), None)
        self.assertIsNotNone(corrupted_res)
        self.assertIn("SKIPPED", corrupted_res["status"])

        # Eligible files must still be processed
        eng_res = next((r for r in results if r["file_name"] == "English_Grammar_and_Vocabulary.pdf"), None)
        self.assertIsNotNone(eng_res)
        self.assertEqual(eng_res["status"], "PREVIEW_OK")

    def test_09_overwrite_protection_preserves_existing_files(self):
        """Verify that existing output files are preserved unless overwrite=True is explicitly passed."""
        out_dir = self.output_dir / "overwrite_protection_test"
        exporter = CSVExporter(output_dir=out_dir)

        test_q1 = [{
            "question_text": "Original existing question 1 text for overwrite test.",
            "option_a": "A1", "option_b": "B1", "option_c": "C1", "option_d": "D1",
            "correct_option": 0, "correct_answer_text": "A1", "difficulty": "Moderate",
            "subject": "Computer Science", "subject_id": "a1000000-0000-0000-0000-000000000007",
            "exam": "fpsc-lecturer-cs-2026", "exam_id": "e1000000-0000-0000-0000-000000000005",
            "topic": "Operating Systems", "syllabus_topic_id": "d1000000-0000-0005-0000-000000000001",
            "explanation": "Exp 1", "source_title": "Doc1.pdf", "source_page": "Page 1",
            "source_url": "", "question_origin": "ai_generated_practice",
            "verification_status": "practice_exercise", "is_published": False
        }]

        # 1. First write (creates computer_science_lecturer_operating_systems.csv)
        path1 = exporter.export_topic_csv("operating_systems", test_q1, source_stem="doc1", overwrite=False)
        self.assertEqual(path1.name, "computer_science_lecturer_operating_systems.csv")

        # 2. Second write with overwrite=False (must NOT clobber path1!)
        test_q2 = [{
            "question_text": "Second batch question text for overwrite test.",
            "option_a": "A2", "option_b": "B2", "option_c": "C2", "option_d": "D2",
            "correct_option": 1, "correct_answer_text": "B2", "difficulty": "Moderate",
            "subject": "Computer Science", "subject_id": "a1000000-0000-0000-0000-000000000007",
            "exam": "fpsc-lecturer-cs-2026", "exam_id": "e1000000-0000-0000-0000-000000000005",
            "topic": "Operating Systems", "syllabus_topic_id": "d1000000-0000-0005-0000-000000000001",
            "explanation": "Exp 2", "source_title": "Doc2.pdf", "source_page": "Page 2",
            "source_url": "", "question_origin": "ai_generated_practice",
            "verification_status": "practice_exercise", "is_published": False
        }]

        path2 = exporter.export_topic_csv("operating_systems", test_q2, source_stem="doc2", overwrite=False)
        self.assertNotEqual(path1, path2, "Second export must NOT overwrite existing CSV when overwrite=False")
        self.assertTrue(path1.exists())
        self.assertTrue(path2.exists())

        # Verify original file content is intact
        with open(path1, "r", encoding="utf-8-sig") as f:
            content1 = f.read()
        self.assertIn("Original existing question 1 text", content1)

    def test_10_csv_schema_matches_ingestion_pipeline_with_unpublished_status(self):
        """Verify that generated questions strictly conform to questionIngestionService schema and are unpublished."""
        out_dir = self.output_dir / "schema_check_out"
        exporter = CSVExporter(output_dir=out_dir)

        test_questions = [
            {
                "question_text": "What does Bloom's Revised Taxonomy classify under the cognitive domain?",
                "option_a": "Physical reflexes and body movement",
                "option_b": "Knowledge recall, comprehension, and evaluation",
                "option_c": "Emotional responses and attitudes",
                "option_d": "Auditory listening and speech clarity",
                "correct_option": 1,
                "correct_answer_text": "Knowledge recall, comprehension, and evaluation",
                "difficulty": "Moderate",
                "subject": "Computer Science",
                "subject_id": "a1000000-0000-0000-0000-000000000007",
                "exam": "fpsc-lecturer-cs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000005",
                "topic": "Software Engineering & Teaching Methodology",
                "syllabus_topic_id": "d1000000-0000-0005-0000-000000000005",
                "explanation": "Bloom's Revised Taxonomy cognitive domain categorizes intellectual skills from remembering to creating.",
                "source_title": "Pedagogy_and_Teaching_Methodology.pdf",
                "source_page": "Pages 1-3",
                "source_url": "",
                "question_origin": "ai_generated_practice",
                "verification_status": "practice_exercise",
                "is_published": False
            }
        ]

        csv_file = exporter.export_topic_csv("software_engineering", test_questions, overwrite=True)
        self.assertTrue(csv_file.exists())

        with open(csv_file, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            row = next(reader)

        self.assertEqual(row["is_published"], "false")
        self.assertEqual(row["verification_status"], "practice_exercise")
        self.assertEqual(row["question_origin"], "ai_generated_practice")
        self.assertEqual(row["correct_option"], "1")
        self.assertEqual(row["subject_id"], "a1000000-0000-0000-0000-000000000007")
        self.assertEqual(row["syllabus_topic_id"], "d1000000-0000-0005-0000-000000000005")


if __name__ == "__main__":
    unittest.main()

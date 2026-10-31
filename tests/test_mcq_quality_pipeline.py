"""
ExamSathi AI - MCQ Quality Pipeline & Evidence Grounding Test Suite
===================================================================
Tests Phase 1 & Phase 2 quality validation requirements:
1. Valid English MCQ accepted with supporting evidence.
2. Valid Operating Systems MCQ accepted with supporting evidence.
3. Rejection of vague question resembling "Which standard applies to Systems?".
4. Rejection of invented official notice / advertisement / citation references (e.g., "Notice Ref: 1792829945416").
5. Rejection of generic / disallowed options (e.g. "All of the above", "Both A and B").
6. Rejection of unsupported claims like "according to the official syllabus" without source grounding.
7. Rejection of near-duplicate questions with minor wording changes.
8. Validation of supporting evidence excerpts against source text chunks.
"""

import os
import sys
import unittest
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.pdf_mcq_generator import (
    MCQValidator,
    DocumentChunk,
    SYLLABUS_CATALOG
)


class TestMCQQualityPipeline(unittest.TestCase):

    def setUp(self):
        # Sample Operating Systems text chunk
        self.os_chunk_text = """
        --- [Page 1] ---
        In modern operating systems, a deadlock occurs when a set of processes are blocked because each process
        is holding a resource and waiting for another resource acquired by some other process.
        According to E. G. Coffman (1971), four necessary conditions must hold simultaneously for a deadlock to occur:
        1. Mutual Exclusion: At least one resource must be held in a non-shareable mode.
        2. Hold and Wait: A process must be concurrently holding at least one resource and requesting additional resources.
        3. No Preemption: Resources cannot be forcibly taken from a process holding them; they can only be released voluntarily.
        4. Circular Wait: A closed chain of processes exists such that each process holds at least one resource needed by the next.
        Paging is a memory management scheme that eliminates the need for contiguous allocation of physical memory.
        A page fault occurs when a program attempts to access a block of memory not stored in physical RAM.
        """
        self.os_chunk = DocumentChunk(
            chunk_id="os_chk_1",
            topic_info={
                "slug": "operating_systems",
                "title": "Operating Systems: Deadlocks, Virtual Memory & Concurrency",
                "subject": "Computer Science",
                "subject_id": "a1000000-0000-0000-0000-000000000007",
                "exam": "fpsc-lecturer-cs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000005",
                "id": "d1000000-0000-0005-0000-000000000001"
            },
            text=self.os_chunk_text,
            start_page=1,
            end_page=1,
            doc_title="OS_Lecturer_Notes.pdf"
        )

        # Sample English text chunk
        self.english_chunk_text = """
        --- [Page 1] ---
        Subject-verb agreement requires that singular subjects take singular verbs, and plural subjects take plural verbs.
        When subjects are connected by 'either... or' or 'neither... nor', the verb agrees with the subject closer to it.
        Example: Neither the teacher nor the students were present in the laboratory.
        A conditional sentence type 2 refers to an unlikely or hypothetical condition and its probable result:
        'If I had enough time, I would study the entire curriculum.'
        """
        self.english_chunk = DocumentChunk(
            chunk_id="eng_chk_1",
            topic_info={
                "slug": "english_grammar",
                "title": "English Grammar, Syntax & Vocabulary",
                "subject": "English & Grammar",
                "subject_id": "a1000000-0000-0000-0000-000000000003",
                "exam": "fpsc-lecturer-cs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000005",
                "id": "d1000000-0000-0005-0000-000000000006"
            },
            text=self.english_chunk_text,
            start_page=1,
            end_page=1,
            doc_title="English_Grammar_Rules.pdf"
        )

        self.exam_id = "e1000000-0000-0000-0000-000000000005"

    def test_01_accepts_valid_operating_systems_mcq_with_evidence(self):
        """Verify that a conceptually sound OS question with supporting evidence is accepted."""
        validator = MCQValidator()
        valid_os = [{
            "question_text": "Which of the following is NOT one of the four necessary Coffman conditions for a deadlock to occur?",
            "option_a": "Mutual Exclusion",
            "option_b": "Hold and Wait",
            "option_c": "Preemptive Resource Allocation",
            "option_d": "Circular Wait",
            "correct_option": 2,
            "correct_answer_text": "Preemptive Resource Allocation",
            "explanation": "The four Coffman conditions are Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait. Preemptive resource allocation eliminates deadlocks.",
            "difficulty": "Moderate",
            "source_page": "Page 1",
            "supporting_evidence": "According to E. G. Coffman (1971), four necessary conditions must hold simultaneously: Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait."
        }]

        res = validator.validate_and_deduplicate(valid_os, self.os_chunk, self.exam_id)
        self.assertEqual(len(res.accepted), 1)
        self.assertEqual(len(res.rejected), 0)

        q = res.accepted[0]
        self.assertEqual(q["correct_option"], 2)
        self.assertEqual(q["subject"], "Computer Science")
        self.assertFalse(q["is_published"])
        self.assertEqual(q["question_origin"], "ai_generated_practice")
        self.assertIn("Coffman", q["supporting_evidence"])

    def test_02_accepts_valid_english_mcq_with_evidence(self):
        """Verify that a genuine English grammar question grounded in notes is accepted."""
        validator = MCQValidator()
        valid_eng = [{
            "question_text": "In English syntax, when two subjects are connected by 'neither... nor', the verb agrees with which element?",
            "option_a": "Always the first subject mentioned",
            "option_b": "The subject closer to the verb",
            "option_c": "Always a plural verb regardless of subjects",
            "option_d": "The subject with the higher grammatical case",
            "correct_option": 1,
            "correct_answer_text": "The subject closer to the verb",
            "explanation": "Under proximity agreement rules, verbs joined by 'either... or' or 'neither... nor' agree with the subject closest to the verb position.",
            "difficulty": "Moderate",
            "source_page": "Page 1",
            "supporting_evidence": "When subjects are connected by 'either... or' or 'neither... nor', the verb agrees with the subject closer to it."
        }]

        res = validator.validate_and_deduplicate(valid_eng, self.english_chunk, self.exam_id)
        self.assertEqual(len(res.accepted), 1)
        self.assertEqual(len(res.rejected), 0)
        self.assertEqual(res.accepted[0]["subject"], "English & Grammar")

    def test_03_rejects_vague_question_stem(self):
        """Reject questions with vague stems resembling 'Which standard applies to Systems?'."""
        validator = MCQValidator()
        vague_questions = [
            {
                "question_text": "Which standard applies to Systems?",
                "option_a": "Standard 1",
                "option_b": "Standard 2",
                "option_c": "Standard 3",
                "option_d": "Standard 4",
                "correct_option": 0,
                "correct_answer_text": "Standard 1",
                "explanation": "Standard 1 applies.",
                "difficulty": "Moderate"
            },
            {
                "question_text": "Which of the following is true?",
                "option_a": "First statement",
                "option_b": "Second statement",
                "option_c": "Third statement",
                "option_d": "Fourth statement",
                "correct_option": 0,
                "correct_answer_text": "First statement",
                "explanation": "It is true based on facts.",
                "difficulty": "Moderate"
            }
        ]

        res = validator.validate_and_deduplicate(vague_questions, self.os_chunk, self.exam_id)
        self.assertEqual(len(res.accepted), 0)
        self.assertEqual(len(res.rejected), 2)
        self.assertTrue(any("Vague question stem" in err for err in res.rejected[0]["errors"]))
        self.assertTrue(any("Vague question stem" in err for err in res.rejected[1]["errors"]))

    def test_04_rejects_hallucinated_official_notices_and_citations(self):
        """Reject questions inventing fake citations like 'Notice Ref: 1792829945416' or 'Advt No: 04/2026'."""
        validator = MCQValidator()
        hallucinated_q = [{
            "question_text": "Under Notice Ref: 1792829945416, which memory allocation procedure is mandated?",
            "option_a": "Paging with TLB lookup",
            "option_b": "Segmentation with base registers",
            "option_c": "Contiguous memory allocation",
            "option_d": "Inverted page tables",
            "correct_option": 0,
            "correct_answer_text": "Paging with TLB lookup",
            "explanation": "Notice Ref: 1792829945416 specifies modern virtual memory rules.",
            "difficulty": "Advanced"
        }]

        res = validator.validate_and_deduplicate(hallucinated_q, self.os_chunk, self.exam_id)
        self.assertEqual(len(res.accepted), 0)
        self.assertEqual(len(res.rejected), 1)
        self.assertTrue(any("Invented official notice" in err for err in res.rejected[0]["errors"]))

    def test_05_rejects_generic_and_disallowed_options(self):
        """Reject questions with options like 'all of the above', 'none of the above', 'both a and b'."""
        validator = MCQValidator()
        generic_opts_questions = [
            {
                "question_text": "Which condition can lead to an operating system deadlock?",
                "option_a": "Mutual Exclusion",
                "option_b": "Circular Wait",
                "option_c": "Both A and B",
                "option_d": "None of the above",
                "correct_option": 2,
                "correct_answer_text": "Both A and B",
                "explanation": "Both conditions contribute to deadlocks.",
                "difficulty": "Moderate"
            }
        ]

        res = validator.validate_and_deduplicate(generic_opts_questions, self.os_chunk, self.exam_id)
        self.assertEqual(len(res.accepted), 0)
        self.assertEqual(len(res.rejected), 1)
        self.assertTrue(any("disallowed or generic option" in err for err in res.rejected[0]["errors"]))

    def test_06_rejects_unsupported_official_syllabus_claims(self):
        """Reject questions claiming 'according to official syllabus' when absent in source notes."""
        validator = MCQValidator()
        unsupported_claim = [{
            "question_text": "According to the official syllabus, what is the maximum page fault penalty allowed?",
            "option_a": "10 milliseconds",
            "option_b": "20 milliseconds",
            "option_c": "30 milliseconds",
            "option_d": "40 milliseconds",
            "correct_option": 0,
            "correct_answer_text": "10 milliseconds",
            "explanation": "According to the official syllabus, page fault penalties must be minimized.",
            "difficulty": "Moderate"
        }]

        res = validator.validate_and_deduplicate(unsupported_claim, self.os_chunk, self.exam_id)
        self.assertEqual(len(res.accepted), 0)
        self.assertEqual(len(res.rejected), 1)
        self.assertTrue(any("according to official syllabus" in err for err in res.rejected[0]["errors"]))

    def test_07_rejects_near_duplicate_questions(self):
        """Reject near-duplicate questions that repeat the same question with minor wording alterations."""
        validator = MCQValidator()
        q1 = {
            "question_text": "Which necessary condition for a deadlock states that a resource cannot be forcibly confiscated from a process?",
            "option_a": "No Preemption",
            "option_b": "Hold and Wait",
            "option_c": "Mutual Exclusion",
            "option_d": "Circular Wait",
            "correct_option": 0,
            "correct_answer_text": "No Preemption",
            "explanation": "No preemption means resources cannot be taken from a process unless released voluntarily.",
            "difficulty": "Moderate"
        }
        # Near duplicate with minor change of phrasing
        q2 = {
            "question_text": "Which necessary condition for a deadlock states that resources cannot be forcibly confiscated from a process holding them?",
            "option_a": "No Preemption",
            "option_b": "Hold and Wait",
            "option_c": "Mutual Exclusion",
            "option_d": "Circular Wait",
            "correct_option": 0,
            "correct_answer_text": "No Preemption",
            "explanation": "No preemption means resources cannot be taken from a process unless released voluntarily.",
            "difficulty": "Moderate"
        }

        res = validator.validate_and_deduplicate([q1, q2], self.os_chunk, self.exam_id)
        self.assertEqual(len(res.accepted), 1, "First question should be accepted")
        self.assertEqual(len(res.duplicates), 1, "Near duplicate question must be caught")
        self.assertIn("Near-duplicate", res.duplicates[0]["reason"])


if __name__ == "__main__":
    unittest.main()

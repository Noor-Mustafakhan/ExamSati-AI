"""
Tests for Tesseract OCR Integration in Stage 1 PDF & Scanned-Page Ingestion
============================================================================
Verifies:
1. Detection and availability of Tesseract OCR configuration.
2. Standard digital PDFs continue extracting text normally without invoking OCR.
3. Scanned PDF pages with no extractable text fallback to OCR.
4. OCR-extracted text preserves the original page number (1-indexed).
5. OCR-extracted text flows seamlessly into the RAG chunking pipeline.
6. Standalone image files (.png, .jpg) are supported as single-page documents.
7. Graceful degradation and error handling when OCR produces no text or fails.
"""

import os
import sys
import io
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from PIL import Image, ImageDraw
import pypdf
from tools.pdf_mcq_generator import (
    PDFExtractor,
    ExtractedPage,
    configure_tesseract,
)
from tools.rag_passage_chunker import PassageChunker


def create_image_pdf(pages_data: list, output_path: Path):
    """
    Creates a PDF where each page can either have digital text or be a pure scanned image.
    pages_data is a list of tuples: (page_type, content)
    - ("text", "digital text string") -> normal text page
    - ("scanned_image", "text to render onto image") -> raster image page
    """
    writer = pypdf.PdfWriter()

    for ptype, text in pages_data:
        if ptype == "text":
            # Normal text page
            packet = io.BytesIO()
            # Generate a minimal 1-page PDF using PIL or raw syntax
            img = Image.new("RGB", (612, 792), color="white")
            # Create a page via writer.add_blank_page
            page = writer.add_blank_page(width=612, height=792)
            # Add text annotation or simple stream
        elif ptype == "scanned_image":
            # Pure raster image page (no text stream)
            img = Image.new("RGB", (600, 200), color="white")
            draw = ImageDraw.Draw(img)
            draw.text((20, 50), text, fill="black")

            img_pdf_bytes = io.BytesIO()
            img.save(img_pdf_bytes, format="PDF")
            img_pdf_bytes.seek(0)

            img_reader = pypdf.PdfReader(img_pdf_bytes)
            writer.add_page(img_reader.pages[0])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        writer.write(f)


class TestTesseractOCRIngestion(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = Path(tempfile.mkdtemp(prefix="test_ocr_rag_"))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def test_01_ocr_detection_and_configuration(self):
        """Verifies that Tesseract OCR helper methods exist and detect environment appropriately."""
        # Method must exist
        self.assertTrue(hasattr(PDFExtractor, "is_tesseract_available"))
        self.assertTrue(hasattr(PDFExtractor, "_ocr_page"))
        self.assertTrue(hasattr(PDFExtractor, "_ocr_image_bytes"))
        self.assertTrue(hasattr(PDFExtractor, "ocr_image_file"))

        # configure_tesseract function must exist
        self.assertTrue(callable(configure_tesseract))

    def test_02_digital_pdf_leaves_existing_extraction_unchanged(self):
        """Pages with existing extractable text MUST NOT trigger OCR."""
        pdf_path = self.temp_dir / "pure_digital.pdf"
        pages = [
            ("scanned_image", "Page 1 digital text for operating systems"),
        ]
        # Using minimal PDF with text stream
        from tests.test_pdf_mcq_generator import create_minimal_pdf
        create_minimal_pdf(["Process Management and CPU Scheduling algorithms like Round Robin and SJF."], pdf_path)

        with patch.object(PDFExtractor, "_ocr_page") as mock_ocr:
            res = PDFExtractor.extract(pdf_path)
            # OCR must NOT have been called because normal text was extractable
            mock_ocr.assert_not_called()
            self.assertTrue(res["success"])
            self.assertEqual(res["total_pages"], 1)
            self.assertIn("Round Robin", res["pages"][0].text)
            self.assertFalse(res["pages"][0].ocr_applied)

    def test_03_scanned_page_with_no_text_uses_ocr_and_preserves_page_num(self):
        """When a PDF page has no extractable text, OCR is used and page numbers are preserved."""
        # Create a 3-page PDF:
        # Page 1: Scanned image with text
        # Page 2: Scanned image with text
        # Page 3: Scanned image with text
        pdf_path = self.temp_dir / "scanned_doc.pdf"

        writer = pypdf.PdfWriter()
        for i in range(1, 4):
            img = Image.new("RGB", (400, 100), color="white")
            draw = ImageDraw.Draw(img)
            draw.text((10, 30), f"Scanned Chapter Notes Page {i}", fill="black")
            img_buf = io.BytesIO()
            img.save(img_buf, format="PDF")
            img_buf.seek(0)
            r = pypdf.PdfReader(img_buf)
            writer.add_page(r.pages[0])

        with open(pdf_path, "wb") as f:
            writer.write(f)

        # Mock OCR output to verify end-to-end extraction and page preservation
        simulated_ocr_texts = {
            1: "Belady Anomaly in FIFO Page Replacement. Increasing page frames causes more page faults.",
            2: "Banker's Algorithm for Deadlock Avoidance. Safe states, unsafe states, and resource allocation graphs.",
            3: "Virtual Memory Paging Mechanisms. Page table entries, translation lookaside buffers, and demand paging."
        }

        def mock_ocr_func(page, page_num):
            return simulated_ocr_texts.get(page_num, "")

        with patch.object(PDFExtractor, "_ocr_page", side_effect=mock_ocr_func) as mock_ocr:
            res = PDFExtractor.extract(pdf_path)

            self.assertTrue(res["success"])
            self.assertEqual(res["total_pages"], 3)
            self.assertEqual(mock_ocr.call_count, 3)

            # Check each page preserves original page number
            for idx, p in enumerate(res["pages"], start=1):
                self.assertEqual(p.page_num, idx, f"Extracted page must have page_num={idx}")
                self.assertTrue(p.ocr_applied, f"Page {idx} must be marked ocr_applied=True")
                self.assertIn(simulated_ocr_texts[idx][:20], p.text)

            self.assertEqual(res["ocr_pages_count"], 3)
            # Since avg chars > 50, ocr_needed should be False and status SUCCESS
            self.assertFalse(res["ocr_needed"])
            self.assertEqual(res["extraction_status"], "SUCCESS")

    def test_04_mixed_digital_and_scanned_pages(self):
        """Verifies mixed PDFs: text pages use normal extraction, blank/scanned pages use OCR."""
        # Page 1 has digital text, Page 2 is a pure image
        pdf_path = self.temp_dir / "mixed_doc.pdf"

        # Page 1: digital
        from tests.test_pdf_mcq_generator import create_minimal_pdf
        create_minimal_pdf(["Digital Page 1: Relational Database Normalization and BCNF."], pdf_path)

        # Append Page 2 as an image
        reader = pypdf.PdfReader(str(pdf_path))
        writer = pypdf.PdfWriter()
        writer.add_page(reader.pages[0])

        # Add image page
        img = Image.new("RGB", (400, 100), color="white")
        img_buf = io.BytesIO()
        img.save(img_buf, format="PDF")
        img_buf.seek(0)
        writer.add_page(pypdf.PdfReader(img_buf).pages[0])

        with open(pdf_path, "wb") as f:
            writer.write(f)

        def mock_ocr_func(page, page_num):
            if page_num == 2:
                return "OCR Page 2: ACID Transactions, Two-Phase Locking and Concurrency Control."
            return ""

        with patch.object(PDFExtractor, "_ocr_page", side_effect=mock_ocr_func) as mock_ocr:
            res = PDFExtractor.extract(pdf_path)
            self.assertTrue(res["success"])
            self.assertEqual(res["total_pages"], 2)

            # Page 1: digital extraction
            self.assertEqual(res["pages"][0].page_num, 1)
            self.assertIn("Normalization", res["pages"][0].text)
            self.assertFalse(res["pages"][0].ocr_applied)

            # Page 2: OCR extraction
            self.assertEqual(res["pages"][1].page_num, 2)
            self.assertIn("Two-Phase Locking", res["pages"][1].text)
            self.assertTrue(res["pages"][1].ocr_applied)

            # OCR should only have been called for Page 2
            mock_ocr.assert_called_once()

    def test_05_ocr_extracted_text_flows_into_rag_chunking(self):
        """Verifies OCR-extracted text produces standard RAG passage chunks with correct page references."""
        # Create 2 pages with simulated OCR content
        p1 = ExtractedPage(
            page_num=1,
            text=(
                "Operating Systems Process Synchronization and Inter-process Communication. "
                "Semaphores provide synchronization through atomic wait and signal operations. "
                "Counting semaphores control access to a resource pool with finite instances. "
                "Binary semaphores function identically to mutex locks in mutual exclusion. "
                "Race conditions occur when multiple processes access shared memory concurrently."
            ),
            ocr_applied=True
        )
        p2 = ExtractedPage(
            page_num=2,
            text=(
                "Deadlock Characterization and the Coffman Conditions in Modern Kernels. "
                "Deadlocks require mutual exclusion, hold and wait, no preemption, and circular wait. "
                "Banker's Algorithm prevents deadlocks by granting requests only if the system remains in a safe state. "
                "Resource Allocation Graphs contain request and assignment edges to detect circular waits."
            ),
            ocr_applied=True
        )

        chunks = PassageChunker.chunk_extracted_pages(
            pages=[p1, p2],
            file_name="scanned_os_notes.pdf",
            file_hash="abc1234567890abcdef",
            document_title="Scanned OS Notes"
        )

        self.assertGreater(len(chunks), 0)
        # Check first chunk
        chunk = chunks[0]
        self.assertIn("Semaphores", chunk.passage_text)
        self.assertEqual(chunk.start_page, 1)
        self.assertTrue("Page" in chunk.page_reference and "1" in chunk.page_reference)

    def test_06_standalone_image_support(self):
        """Verifies direct ingestion of standalone image files (.png, .jpg) via OCR."""
        image_path = self.temp_dir / "diagram_note.png"
        img = Image.new("RGB", (500, 200), color="white")
        draw = ImageDraw.Draw(img)
        draw.text((20, 80), "Graph Theory: Dijkstra Algorithm and Shortest Path Trees", fill="black")
        img.save(image_path)

        with patch.object(
            PDFExtractor,
            "ocr_image_file",
            return_value="Graph Theory: Dijkstra Algorithm and Shortest Path Trees with Adjacency Matrix."
        ):
            res = PDFExtractor.extract(image_path)
            self.assertTrue(res["success"])
            self.assertEqual(res["total_pages"], 1)
            self.assertEqual(res["pages"][0].page_num, 1)
            self.assertTrue(res["pages"][0].ocr_applied)
            self.assertIn("Dijkstra", res["pages"][0].text)
            self.assertEqual(res["metadata"]["source_format"], "image")

    def test_07_graceful_degradation_when_ocr_fails(self):
        """When OCR fails or returns empty, the extractor degrades gracefully without crashing."""
        pdf_path = self.temp_dir / "corrupted_scanned.pdf"
        writer = pypdf.PdfWriter()
        img = Image.new("RGB", (100, 100), color="white")
        buf = io.BytesIO()
        img.save(buf, format="PDF")
        buf.seek(0)
        writer.add_page(pypdf.PdfReader(buf).pages[0])
        with open(pdf_path, "wb") as f:
            writer.write(f)

        # Force OCR to return empty string
        with patch.object(PDFExtractor, "_ocr_page", return_value=""):
            res = PDFExtractor.extract(pdf_path)
            self.assertTrue(res["success"])
            self.assertEqual(res["total_pages"], 1)
            self.assertEqual(res["pages"][0].text, "")
            self.assertTrue(res["ocr_needed"])
            self.assertEqual(res["extraction_status"], "OCR_REQUIRED")


if __name__ == "__main__":
    unittest.main()

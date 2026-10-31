"""
ExamSathi AI - Page-Aware Passage Chunker for RAG Pipeline
===========================================================
Partitions extracted PDF pages into focused semantic passages for vector indexing
and retrieval-augmented question generation.

Initial Settings:
- Approximately 300-500 words per chunk
- Approximately 50 words overlap
- Preserves exact original page numbers (start_page, end_page)
- Retains full document, subject, topic, and exam metadata
- Stable deterministic chunk IDs (e.g., {file_hash[:12]}_chk_{idx})
"""

import re
from typing import List, Dict, Any, Optional, Tuple


class PassageChunk:
    """
    Represents a single page-aware passage chunk ready for embedding and indexing.
    """
    def __init__(
        self,
        chunk_id: str,
        chunk_index: int,
        passage_text: str,
        start_page: int,
        end_page: int,
        word_count: int,
        char_count: int,
        document_id: Optional[str] = None,
        document_title: str = "",
        file_name: str = "",
        file_hash: str = "",
        subject_id: Optional[str] = None,
        syllabus_topic_id: Optional[str] = None,
        exam_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.chunk_id = chunk_id
        self.chunk_index = chunk_index
        self.passage_text = passage_text
        self.start_page = start_page
        self.end_page = end_page
        self.word_count = word_count
        self.char_count = char_count
        self.document_id = document_id
        self.document_title = document_title
        self.file_name = file_name
        self.file_hash = file_hash
        self.subject_id = subject_id
        self.syllabus_topic_id = syllabus_topic_id
        self.exam_id = exam_id
        self.metadata = metadata or {}

    @property
    def page_reference(self) -> str:
        """Exact citation format (e.g. 'Page 3' or 'Pages 3-5')"""
        if self.start_page == self.end_page:
            return f"Page {self.start_page}"
        return f"Pages {self.start_page}-{self.end_page}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "chunk_index": self.chunk_index,
            "passage_text": self.passage_text,
            "word_count": self.word_count,
            "char_count": self.char_count,
            "start_page": self.start_page,
            "end_page": self.end_page,
            "page_reference": self.page_reference,
            "document_id": self.document_id,
            "document_title": self.document_title,
            "file_name": self.file_name,
            "file_hash": self.file_hash,
            "subject_id": self.subject_id,
            "syllabus_topic_id": self.syllabus_topic_id,
            "exam_id": self.exam_id,
            "metadata": self.metadata
        }

    def __repr__(self) -> str:
        return f"<PassageChunk {self.chunk_id} ({self.page_reference}): {self.word_count} words>"


class PassageChunker:
    """
    Splits page-extracted text into semantic passage chunks while preserving
    page boundaries and citation metadata.
    """
    DEFAULT_MIN_WORDS = 250
    DEFAULT_TARGET_WORDS = 380
    DEFAULT_MAX_WORDS = 500
    DEFAULT_OVERLAP_WORDS = 50

    @classmethod
    def chunk_extracted_pages(
        cls,
        pages: List[Any], # List of ExtractedPage or dicts with page_num & text
        file_name: str = "",
        file_hash: str = "",
        document_title: str = "",
        document_id: Optional[str] = None,
        exam_id: Optional[str] = None,
        subject_id: Optional[str] = None,
        syllabus_topic_id: Optional[str] = None,
        min_words: int = DEFAULT_MIN_WORDS,
        target_words: int = DEFAULT_TARGET_WORDS,
        max_words: int = DEFAULT_MAX_WORDS,
        overlap_words: int = DEFAULT_OVERLAP_WORDS,
    ) -> List[PassageChunk]:
        """
        Chunks pages into semantic passages.

        Args:
            pages: List of extracted page objects or dicts (must have page_num and text).
            file_name: Base file name of source PDF.
            file_hash: Cryptographic SHA-256 hash of PDF.
            document_title: Logical document title.
            document_id: Database document UUID (optional during preview).
            exam_id: Linked exam UUID.
            subject_id: Linked subject UUID.
            syllabus_topic_id: Linked topic UUID.
            min_words: Lower bound target for chunk size.
            target_words: Optimal target word count.
            max_words: Hard ceiling for chunk size before forcing split.
            overlap_words: Number of trailing words carried over to next chunk.

        Returns:
            List of PassageChunk objects.
        """
        if not pages:
            return []

        # 1. Flatten into tokenized sentence/paragraph fragments with page tracking
        fragments: List[Tuple[str, int]] = [] # (fragment_text, page_num)

        for p in pages:
            page_num = p.page_num if hasattr(p, "page_num") else p.get("page_num", 1)
            raw_text = p.text if hasattr(p, "text") else p.get("text", "")
            if not raw_text or not raw_text.strip():
                continue

            # Split text by paragraphs while preserving lists/definitions
            paragraphs = re.split(r"\n\s*\n", raw_text)
            for para in paragraphs:
                para_clean = para.strip()
                if not para_clean:
                    continue

                # If paragraph itself is excessively large (>250 words), split on sentence boundaries
                para_words = para_clean.split()
                if len(para_words) > 220:
                    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", para_clean)
                    for sent in sentences:
                        s_clean = sent.strip()
                        if s_clean:
                            fragments.append((s_clean, page_num))
                else:
                    fragments.append((para_clean, page_num))

        if not fragments:
            return []

        # 2. Accumulate fragments into 300-500 word chunks with ~50-word overlap
        chunks: List[PassageChunk] = []
        current_fragments: List[Tuple[str, int]] = []
        current_words_count = 0
        chunk_idx = 1
        hash_prefix = (file_hash[:12] if file_hash else "doc").lower()

        for frag_text, page_num in fragments:
            frag_word_len = len(frag_text.split())

            # Check if adding this fragment exceeds our target/max boundary
            if current_words_count + frag_word_len > max_words and current_words_count >= min_words:
                # Emit current chunk
                passage_text = "\n\n".join(f[0] for f in current_fragments)
                start_p = current_fragments[0][1]
                end_p = current_fragments[-1][1]
                total_w = len(passage_text.split())

                chunk_obj = PassageChunk(
                    chunk_id=f"{hash_prefix}_chk_{chunk_idx}",
                    chunk_index=chunk_idx,
                    passage_text=passage_text,
                    start_page=start_p,
                    end_page=end_p,
                    word_count=total_w,
                    char_count=len(passage_text),
                    document_id=document_id,
                    document_title=document_title or file_name,
                    file_name=file_name,
                    file_hash=file_hash,
                    subject_id=subject_id,
                    syllabus_topic_id=syllabus_topic_id,
                    exam_id=exam_id
                )
                chunks.append(chunk_obj)
                chunk_idx += 1

                # Calculate overlap fragments
                overlap_frags: List[Tuple[str, int]] = []
                overlap_accum = 0
                for f_text, f_page in reversed(current_fragments):
                    w_cnt = len(f_text.split())
                    if overlap_accum + w_cnt <= overlap_words * 1.5:
                        overlap_frags.insert(0, (f_text, f_page))
                        overlap_accum += w_cnt
                    else:
                        break

                current_fragments = overlap_frags
                current_words_count = sum(len(f[0].split()) for f in current_fragments)

            current_fragments.append((frag_text, page_num))
            current_words_count += frag_word_len

        # 3. Emit final chunk if fragments remain
        if current_fragments:
            passage_text = "\n\n".join(f[0] for f in current_fragments)
            total_w = len(passage_text.split())

            # If trailing chunk is very small (< 60 words) and we already have chunks,
            # merge it with the last chunk to avoid tiny orphaned fragments
            if total_w < 60 and chunks:
                last_chunk = chunks[-1]
                last_chunk.passage_text += "\n\n" + passage_text
                last_chunk.end_page = max(last_chunk.end_page, current_fragments[-1][1])
                last_chunk.word_count = len(last_chunk.passage_text.split())
                last_chunk.char_count = len(last_chunk.passage_text)
            else:
                start_p = current_fragments[0][1]
                end_p = current_fragments[-1][1]

                chunk_obj = PassageChunk(
                    chunk_id=f"{hash_prefix}_chk_{chunk_idx}",
                    chunk_index=chunk_idx,
                    passage_text=passage_text,
                    start_page=start_p,
                    end_page=end_p,
                    word_count=total_w,
                    char_count=len(passage_text),
                    document_id=document_id,
                    document_title=document_title or file_name,
                    file_name=file_name,
                    file_hash=file_hash,
                    subject_id=subject_id,
                    syllabus_topic_id=syllabus_topic_id,
                    exam_id=exam_id
                )
                chunks.append(chunk_obj)

        return chunks

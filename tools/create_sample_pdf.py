"""
Helper script to generate a sample Computer Science Lecturer notes PDF
for local testing and verification of tools/pdf_mcq_generator.py.
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tests.test_pdf_mcq_generator import create_minimal_pdf

def generate_samples():
    docs_dir = Path("sample_notes")
    docs_dir.mkdir(exist_ok=True)

    # 1. Single Topic: Operating Systems
    os_pdf = docs_dir / "Operating_Systems_Lecture_Notes.pdf"
    os_content = [
        "Operating Systems Lecture 1: Process Concurrency and Coffman Conditions for Deadlocks. A deadlock requires Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait.",
        "Operating Systems Lecture 2: Memory Management, Virtual Memory, Paging, TLB Hit Ratio, Page Faults and Thrashing. Thrashing occurs when system spends more time paging than executing.",
        "Operating Systems Lecture 3: Semaphore vs Mutex and Banker's Algorithm for deadlock avoidance with safe and unsafe states."
    ]
    create_minimal_pdf(os_content, os_pdf)
    print(f"Created: {os_pdf}")

    # 2. Merged Multi-Topic PDF
    merged_pdf = docs_dir / "Lecturer_CS_Comprehensive_Notes.pdf"
    merged_content = [
        "Chapter 1: Operating Systems. Concurrency, Semaphores, Mutexes, and Coffman Deadlock Conditions in modern OS kernels.",
        "Chapter 1 Cont: Virtual Memory, Paging, Demand Paging, Inverted Page Tables, and Page Replacement Algorithms.",
        "Chapter 2: Relational Database Systems. Normalization from 1NF to BCNF, Functional Dependencies, and Lossless Joins.",
        "Chapter 2 Cont: ACID Transaction Properties, Serializability, Two-Phase Locking Protocol (2PL), and B-Tree indexing.",
        "Chapter 3: Data Structures and Algorithmic Complexity. Big-O Asymptotic analysis, AVL Tree rotations, and Heap Sort.",
        "Chapter 3 Cont: Graph Traversals, Breadth First Search (BFS), Depth First Search (DFS), and Dijkstra Shortest Path."
    ]
    create_minimal_pdf(merged_content, merged_pdf)
    print(f"Created: {merged_pdf}")

    # 3. Scanned PDF (Minimal text / empty pages triggering OCR warning)
    scanned_pdf = docs_dir / "Scanned_Handwritten_Notes.pdf"
    scanned_content = ["p1", "", "p3"]
    create_minimal_pdf(scanned_content, scanned_pdf)
    print(f"Created: {scanned_pdf}")

if __name__ == "__main__":
    generate_samples()

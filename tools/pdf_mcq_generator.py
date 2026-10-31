"""
ExamSathi AI - Local PDF-to-CSV MCQ Generator & Batch Processor
==============================================================
A robust, local Python data-engineering and AI utility that processes single or multiple
PDFs from explicitly selected folders, detects scanned pages needing OCR, identifies duplicate
files via SHA-256 hashes, classifies competitive-exam subjects and topics, creates a processing
manifest, chunks documents into manageable syllabus-focused batches, generates practice MCQs via
Google Gemini API, validates and deduplicates them against batch and Supabase question bank,
and exports them to schema-compliant CSV files ready for Supabase ingestion.

CRITICAL SECURITY, PRIVACY & INTEGRITY RULES:
1. Source PDFs remain strictly local on the user's machine (never uploaded to Supabase or committed to Git).
2. All generated questions are exported locally to `generated_mcqs/` with `is_published = false`.
3. GEMINI_API_KEY is read securely from .env / .env.local and never exposed in logs, outputs, or CSVs.
4. When Gemini generation is active, notes text is transmitted to Google's API over HTTPS; key status is reported clearly without faking responses.
5. All database foreign keys (exam_id, subject_id, syllabus_topic_id) are strictly grounded in real Supabase records.
6. Uncertain classifications (<40% confidence or ambiguous signal) are flagged for confirmation without inventing UUIDs.
7. Existing output CSVs are preserved by default unless `--overwrite` is explicitly enabled.
8. Recursive PDF discovery never scans outside the explicitly selected folder and strictly skips .venv, node_modules, .git, etc.
"""

import os
import re
import sys
import io
import json
import csv
import shutil
import hashlib
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Set

# Ensure UTF-8 output streams on Windows to prevent charmap encoding errors
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

# Try importing pypdf
try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

# Try importing requests
try:
    import requests
except ImportError:
    requests = None

# Try importing pytesseract and Pillow for Tesseract OCR
try:
    import pytesseract
    from PIL import Image
except ImportError:
    pytesseract = None
    Image = None


def configure_tesseract() -> Optional[str]:
    """
    Locates and configures the Tesseract OCR executable path for pytesseract on Windows/Linux/macOS.
    Checks:
    1. PATH via shutil.which('tesseract')
    2. TESSERACT_CMD or TESSERACT_PATH environment variables
    3. Common Windows install locations (Program Files, LocalAppData)
    Returns configured path or None if not found.
    """
    if pytesseract is None:
        return None

    # Check env vars first
    env_cmd = os.environ.get("TESSERACT_CMD") or os.environ.get("TESSERACT_PATH")
    if env_cmd and Path(env_cmd).is_file():
        pytesseract.pytesseract.tesseract_cmd = str(Path(env_cmd).resolve())
        return str(Path(env_cmd).resolve())

    # Check system PATH
    which_cmd = shutil.which("tesseract")
    if which_cmd:
        pytesseract.pytesseract.tesseract_cmd = which_cmd
        return which_cmd

    # Check common Windows directories
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    user_profile = os.environ.get("USERPROFILE", "")
    candidate_paths = [
        Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
        Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
        Path(local_app_data) / r"Programs\Tesseract-OCR\tesseract.exe" if local_app_data else None,
        Path(user_profile) / r"AppData\Local\Programs\Tesseract-OCR\tesseract.exe" if user_profile else None,
    ]

    for p in candidate_paths:
        if p and p.is_file():
            pytesseract.pytesseract.tesseract_cmd = str(p.resolve())
            return str(p.resolve())

    return None



# ==============================================================================
# 1. GROUND TRUTH SYLLABUS & DATABASE SCHEMA CATALOG
# ==============================================================================
# Verified database records from public.exams, public.subjects, and public.syllabus_topics.
# Do NOT invent or alter UUIDs.
SYLLABUS_CATALOG: Dict[str, Dict[str, Any]] = {
    "fpsc-lecturer-cs-2026": {
        "exam_title": "Lecturer Computer Science (BS-17)",
        "exam_id": "e1000000-0000-0000-0000-000000000005",
        "default_subject": "Computer Science",
        "default_subject_id": "a1000000-0000-0000-0000-000000000007",
        "topics": [
            {
                "id": "d1000000-0000-0005-0000-000000000001",
                "slug": "operating_systems",
                "title": "Operating Systems: Deadlocks, Virtual Memory & Concurrency",
                "subject": "Computer Science",
                "subject_id": "a1000000-0000-0000-0000-000000000007",
                "exam": "fpsc-lecturer-cs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000005",
                "keywords": [
                    "operating system", "os", "deadlock", "coffman", "virtual memory",
                    "paging", "page fault", "page replacement", "concurrency", "semaphore", "mutex",
                    "scheduling", "banker's algorithm", "process", "thread", "tlb",
                    "thrashing", "critical section", "round robin", "context switch", "kernel"
                ]
            },
            {
                "id": "d1000000-0000-0005-0000-000000000002",
                "slug": "dbms",
                "title": "Database Systems: Normalization, BCNF & ACID Transactions",
                "subject": "Computer Science",
                "subject_id": "a1000000-0000-0000-0000-000000000007",
                "exam": "fpsc-lecturer-cs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000005",
                "keywords": [
                    "database", "dbms", "sql", "normalization", "1nf", "2nf", "3nf", "bcnf",
                    "acid", "atomicity", "consistency", "isolation", "durability",
                    "transaction", "serializability", "2pl", "two phase locking", "b-tree",
                    "b+ tree", "relational algebra", "foreign key", "primary key", "er diagram"
                ]
            },
            {
                "id": "d1000000-0000-0005-0000-000000000003",
                "slug": "algorithms_and_data_structures",
                "title": "Data Structures & Algorithms: Trees, Graphs & Complexity",
                "subject": "Computer Science",
                "subject_id": "a1000000-0000-0000-0000-000000000007",
                "exam": "fpsc-lecturer-cs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000005",
                "keywords": [
                    "data structure", "data structures", "algorithm", "algorithms", "complexity", "big o", "asymptotic",
                    "binary tree", "bst", "avl", "red-black", "graph", "dijkstra",
                    "bfs", "dfs", "bellman-ford", "dynamic programming", "sorting",
                    "hash table", "heap", "stack", "queue", "linked list", "divide and conquer"
                ]
            },
            {
                "id": "d1000000-0000-0005-0000-000000000004",
                "slug": "computer_architecture_and_networks",
                "title": "Computer Architecture, Networks & Formal Languages",
                "subject": "Computer Science",
                "subject_id": "a1000000-0000-0000-0000-000000000007",
                "exam": "fpsc-lecturer-cs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000005",
                "keywords": [
                    "computer architecture", "cpu", "pipelining", "cache", "instruction set",
                    "hazard", "risc", "cisc", "network", "networking", "osi model", "tcp", "udp", "ip",
                    "routing", "subnetting", "cidr", "formal languages", "automata", "dfa",
                    "nfa", "cfg", "turing machine", "regular expression"
                ]
            },
            {
                "id": "d1000000-0000-0005-0000-000000000005",
                "slug": "software_engineering",
                "title": "Software Engineering & Teaching Methodology",
                "subject": "Computer Science",
                "subject_id": "a1000000-0000-0000-0000-000000000007",
                "exam": "fpsc-lecturer-cs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000005",
                "keywords": [
                    "software engineering", "sdlc", "agile", "scrum", "waterfall",
                    "design pattern", "solid", "testing", "refactoring", "teaching methodology",
                    "pedagogy", "curriculum", "assessment", "bloom's taxonomy", "lesson plan",
                    "coupling", "cohesion", "uml", "andragogy", "instructional design"
                ]
            },
            {
                "id": "d1000000-0000-0005-0000-000000000006",
                "slug": "english_grammar",
                "title": "English Grammar, Syntax & Vocabulary",
                "subject": "English & Grammar",
                "subject_id": "a1000000-0000-0000-0000-000000000003",
                "exam": "fpsc-lecturer-cs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000005",
                "keywords": [
                    "english", "grammar", "syntax", "vocabulary", "preposition", "prepositions", "idiom", "idioms",
                    "synonym", "antonym", "sentence correction", "subject verb agreement",
                    "conditional", "active passive", "direct indirect", "clause", "phrase"
                ]
            }
        ]
    },
    "fpsc-computer-programmer-2026": {
        "exam_title": "Computer Programmer (BS-17)",
        "exam_id": "e1000000-0000-0000-0000-000000000006",
        "default_subject": "Computer Science",
        "default_subject_id": "a1000000-0000-0000-0000-000000000007",
        "topics": [
            {
                "id": "d1000000-0000-0006-0000-000000000001",
                "slug": "oop_design_patterns",
                "title": "Object-Oriented Design & GoF Patterns",
                "subject": "Computer Science",
                "subject_id": "a1000000-0000-0000-0000-000000000007",
                "exam": "fpsc-computer-programmer-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000006",
                "keywords": ["oop", "object oriented", "design pattern", "singleton", "factory", "observer", "gof"]
            },
            {
                "id": "d1000000-0000-0006-0000-000000000002",
                "slug": "sql_optimization",
                "title": "Relational Databases & SQL Optimization",
                "subject": "Computer Science",
                "subject_id": "a1000000-0000-0000-0000-000000000007",
                "exam": "fpsc-computer-programmer-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000006",
                "keywords": ["sql optimization", "query optimization", "indexing", "hash join", "referential integrity"]
            },
            {
                "id": "d1000000-0000-0006-0000-000000000003",
                "slug": "web_owasp_security",
                "title": "Web Architecture, REST APIs & OWASP Security",
                "subject": "Computer Science",
                "subject_id": "a1000000-0000-0000-0000-000000000007",
                "exam": "fpsc-computer-programmer-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000006",
                "keywords": ["rest api", "web architecture", "owasp", "sql injection", "csrf", "xss", "http"]
            }
        ]
    },
    "fpsc-ad-fia-2026": {
        "exam_title": "Assistant Director FIA (BS-17)",
        "exam_id": "e1000000-0000-0000-0000-000000000003",
        "default_subject": "Pakistan Affairs",
        "default_subject_id": "a1000000-0000-0000-0000-000000000001",
        "topics": [
            {
                "id": "d1000000-0000-0003-0000-000000000003",
                "slug": "pakistan_affairs_constitution",
                "title": "Pakistan Affairs & 1973 Constitution",
                "subject": "Pakistan Affairs",
                "subject_id": "a1000000-0000-0000-0000-000000000001",
                "exam": "fpsc-ad-fia-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000003",
                "keywords": ["pakistan affairs", "1973 constitution", "fundamental rights", "quaid-e-azam", "lahore resolution"]
            },
            {
                "id": "d1000000-0000-0003-0000-000000000006",
                "slug": "everyday_science_gk",
                "title": "Everyday Science & General Knowledge",
                "subject": "Everyday Science",
                "subject_id": "a1000000-0000-0000-0000-000000000005",
                "exam": "fpsc-ad-fia-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000003",
                "keywords": ["everyday science", "general knowledge", "atmosphere", "ozone layer", "si units", "solar system"]
            },
            {
                "id": "d1000000-0000-0003-0000-000000000005",
                "slug": "basic_arithmetic_fia",
                "title": "Basic Arithmetic & Quantitative Ability",
                "subject": "Basic Mathematics",
                "subject_id": "a1000000-0000-0000-0000-000000000006",
                "exam": "fpsc-ad-fia-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000003",
                "keywords": ["arithmetic", "percentages", "ratios", "algebra", "speed time distance", "quantitative ability"]
            }
        ]
    },
    "fpsc-inspector-customs-2026": {
        "exam_title": "Inspector Customs / Intelligence Officer (BS-16)",
        "exam_id": "e1000000-0000-0000-0000-000000000001",
        "default_subject": "Pakistan Affairs",
        "default_subject_id": "a1000000-0000-0000-0000-000000000001",
        "topics": [
            {
                "id": "d1000000-0000-0001-0000-000000000003",
                "slug": "customs_pakistan_affairs",
                "title": "Pakistan Affairs & Constitutional History",
                "subject": "Pakistan Affairs",
                "subject_id": "a1000000-0000-0000-0000-000000000001",
                "exam": "fpsc-inspector-customs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000001",
                "keywords": ["pakistan affairs", "constitutional history", "1973 constitution", "trade corridors"]
            },
            {
                "id": "d1000000-0000-0001-0000-000000000007",
                "slug": "islamic_studies_customs",
                "title": "Islamic Studies & Current Events",
                "subject": "Islamic Studies",
                "subject_id": "a1000000-0000-0000-0000-000000000002",
                "exam": "fpsc-inspector-customs-2026",
                "exam_id": "e1000000-0000-0000-0000-000000000001",
                "keywords": ["islamic studies", "quran", "treaty of hudaybiyyah", "caliphate", "pillars of islam", "hadith"]
            }
        ]
    }
}

# Master Domain Taxonomy for Subject & Topic Classification
DOMAINS_TAXONOMY: Dict[str, Dict[str, Any]] = {
    "operating_systems": {
        "domain_key": "operating_systems",
        "subject_name": "Computer Science",
        "subject_slug": "computer-science",
        "subject_id": "a1000000-0000-0000-0000-000000000007",
        "topic_slug": "operating_systems",
        "topic_title": "Operating Systems: Deadlocks, Virtual Memory & Concurrency",
        "syllabus_topic_id": "d1000000-0000-0005-0000-000000000001",
        "exam_slug": "fpsc-lecturer-cs-2026",
        "exam_id": "e1000000-0000-0000-0000-000000000005",
        "exam_title": "Lecturer Computer Science (BS-17)",
        "likely_exams": ["Lecturer Computer Science (BS-17)", "Computer Programmer (BS-17)"],
        "keywords": [
            "operating system", "operating systems", "deadlock", "coffman",
            "virtual memory", "paging", "page fault", "page replacement",
            "concurrency", "semaphore", "mutex", "critical section",
            "banker's algorithm", "process scheduling", "round robin",
            "context switch", "thrashing", "tlb", "kernel", "fork", "thread",
            "inter-process communication", "ipc", "cpu scheduling"
        ],
        "filename_patterns": [r"operating[-_ ]system", r"\bos\b", r"deadlock", r"virtual[-_ ]memory", r"paging"]
    },
    "dbms": {
        "domain_key": "dbms",
        "subject_name": "Computer Science",
        "subject_slug": "computer-science",
        "subject_id": "a1000000-0000-0000-0000-000000000007",
        "topic_slug": "dbms",
        "topic_title": "Database Systems: Normalization, BCNF & ACID Transactions",
        "syllabus_topic_id": "d1000000-0000-0005-0000-000000000002",
        "exam_slug": "fpsc-lecturer-cs-2026",
        "exam_id": "e1000000-0000-0000-0000-000000000005",
        "exam_title": "Lecturer Computer Science (BS-17)",
        "likely_exams": ["Lecturer Computer Science (BS-17)", "Computer Programmer (BS-17)"],
        "keywords": [
            "database", "databases", "dbms", "rdbms", "sql", "relational database",
            "normalization", "1nf", "2nf", "3nf", "bcnf", "acid", "atomicity",
            "consistency", "isolation", "durability", "transaction",
            "serializability", "two-phase locking", "2pl", "b-tree", "b+ tree",
            "relational algebra", "foreign key", "primary key", "indexing", "er diagram"
        ],
        "filename_patterns": [r"dbms", r"database", r"sql", r"normalization", r"bcnf"]
    },
    "dsa": {
        "domain_key": "dsa",
        "subject_name": "Computer Science",
        "subject_slug": "computer-science",
        "subject_id": "a1000000-0000-0000-0000-000000000007",
        "topic_slug": "algorithms_and_data_structures",
        "topic_title": "Data Structures & Algorithms: Trees, Graphs & Complexity",
        "syllabus_topic_id": "d1000000-0000-0005-0000-000000000003",
        "exam_slug": "fpsc-lecturer-cs-2026",
        "exam_id": "e1000000-0000-0000-0000-000000000005",
        "exam_title": "Lecturer Computer Science (BS-17)",
        "likely_exams": ["Lecturer Computer Science (BS-17)", "Computer Programmer (BS-17)"],
        "keywords": [
            "data structure", "data structures", "algorithm", "algorithms",
            "complexity", "big o", "asymptotic", "binary search tree", "bst",
            "avl tree", "red-black tree", "graph", "graphs", "dijkstra", "bfs", "dfs",
            "breadth first search", "depth first search", "dynamic programming",
            "sorting", "quicksort", "mergesort", "heap", "stack", "queue",
            "linked list", "hash table", "divide and conquer"
        ],
        "filename_patterns": [r"dsa", r"data[-_ ]structure", r"algorithm", r"tree", r"graph", r"complexity"]
    },
    "computer_networks": {
        "domain_key": "computer_networks",
        "subject_name": "Computer Science",
        "subject_slug": "computer-science",
        "subject_id": "a1000000-0000-0000-0000-000000000007",
        "topic_slug": "computer_architecture_and_networks",
        "topic_title": "Computer Architecture, Networks & Formal Languages",
        "syllabus_topic_id": "d1000000-0000-0005-0000-000000000004",
        "exam_slug": "fpsc-lecturer-cs-2026",
        "exam_id": "e1000000-0000-0000-0000-000000000005",
        "exam_title": "Lecturer Computer Science (BS-17)",
        "likely_exams": ["Lecturer Computer Science (BS-17)", "Computer Programmer (BS-17)"],
        "keywords": [
            "computer network", "computer networks", "computer architecture",
            "osi model", "tcp/ip", "tcp", "udp", "ip addressing", "routing",
            "subnetting", "cidr", "pipelining", "cache memory", "instruction set",
            "risc", "cisc", "hazard", "automata", "dfa", "nfa", "turing machine",
            "regular expression", "formal languages", "transport layer"
        ],
        "filename_patterns": [r"network", r"networking", r"architecture", r"osi", r"tcp", r"pipelining"]
    },
    "software_engineering": {
        "domain_key": "software_engineering",
        "subject_name": "Computer Science",
        "subject_slug": "computer-science",
        "subject_id": "a1000000-0000-0000-0000-000000000007",
        "topic_slug": "software_engineering",
        "topic_title": "Software Engineering & Teaching Methodology",
        "syllabus_topic_id": "d1000000-0000-0005-0000-000000000005",
        "exam_slug": "fpsc-lecturer-cs-2026",
        "exam_id": "e1000000-0000-0000-0000-000000000005",
        "exam_title": "Lecturer Computer Science (BS-17)",
        "likely_exams": ["Lecturer Computer Science (BS-17)", "Computer Programmer (BS-17)"],
        "keywords": [
            "software engineering", "sdlc", "agile", "scrum", "waterfall",
            "design pattern", "solid principles", "refactoring", "unit testing",
            "integration testing", "oop", "object oriented", "coupling", "cohesion",
            "uml", "clean code", "devops", "git", "ci/cd"
        ],
        "filename_patterns": [r"software[-_ ]engineering", r"\bse\b", r"sdlc", r"agile", r"design[-_ ]pattern"]
    },
    "pedagogy": {
        "domain_key": "pedagogy",
        "subject_name": "Computer Science",
        "subject_slug": "computer-science",
        "subject_id": "a1000000-0000-0000-0000-000000000007",
        "topic_slug": "software_engineering",
        "topic_title": "Software Engineering & Teaching Methodology",
        "syllabus_topic_id": "d1000000-0000-0005-0000-000000000005",
        "exam_slug": "fpsc-lecturer-cs-2026",
        "exam_id": "e1000000-0000-0000-0000-000000000005",
        "exam_title": "Lecturer Computer Science (BS-17)",
        "likely_exams": ["Lecturer Computer Science (BS-17)"],
        "keywords": [
            "pedagogy", "teaching methodology", "teaching methods", "bloom's taxonomy",
            "cognitive domain", "affective domain", "psychomotor domain",
            "lesson plan", "lesson planning", "formative assessment",
            "summative assessment", "curriculum development", "andragogy",
            "instructional design", "classroom management", "didactics",
            "rubric", "educational psychology", "student centered learning"
        ],
        "filename_patterns": [r"pedagogy", r"teaching[-_ ]methodology", r"lesson[-_ ]plan", r"bloom", r"education"]
    },
    "english_grammar": {
        "domain_key": "english_grammar",
        "subject_name": "English & Grammar",
        "subject_slug": "english-grammar",
        "subject_id": "a1000000-0000-0000-0000-000000000003",
        "topic_slug": "english_grammar",
        "topic_title": "English Grammar, Syntax & Vocabulary",
        "syllabus_topic_id": "d1000000-0000-0005-0000-000000000006",
        "exam_slug": "fpsc-lecturer-cs-2026",
        "exam_id": "e1000000-0000-0000-0000-000000000005",
        "exam_title": "Lecturer Computer Science (BS-17)",
        "likely_exams": [
            "Lecturer Computer Science (BS-17)",
            "Assistant Director FIA (BS-17)",
            "Inspector Customs / Intelligence Officer (BS-16)",
            "Computer Programmer (BS-17)"
        ],
        "keywords": [
            "english", "grammar", "vocabulary", "preposition", "prepositions",
            "idiom", "idioms", "syntax", "sentence correction", "synonym",
            "synonyms", "antonym", "antonyms", "parts of speech", "subject verb agreement",
            "active passive", "direct indirect", "clause", "phrase", "tenses", "narration"
        ],
        "filename_patterns": [r"english", r"grammar", r"vocabulary", r"preposition", r"idiom", r"syntax"]
    },
    "pakistan_affairs": {
        "domain_key": "pakistan_affairs",
        "subject_name": "Pakistan Affairs",
        "subject_slug": "pakistan-affairs",
        "subject_id": "a1000000-0000-0000-0000-000000000001",
        "topic_slug": "pakistan_affairs",
        "topic_title": "Pakistan Affairs & 1973 Constitution",
        "syllabus_topic_id": "d1000000-0000-0003-0000-000000000003",
        "exam_slug": "fpsc-ad-fia-2026",
        "exam_id": "e1000000-0000-0000-0000-000000000003",
        "exam_title": "Assistant Director FIA (BS-17)",
        "likely_exams": ["Assistant Director FIA (BS-17)", "Inspector Customs / Intelligence Officer (BS-16)"],
        "keywords": [
            "pakistan affairs", "1973 constitution", "fundamental rights",
            "quaid-e-azam", "muhammad ali jinnah", "allama iqbal", "lahore resolution",
            "simla deputation", "nehru report", "14 points", "cpec", "kashmir dispute",
            "governance", "national assembly", "senate", "prime minister", "supreme court",
            "amendments", "radcliffe award", "pakistan movement"
        ],
        "filename_patterns": [r"pakistan[-_ ]affairs", r"constitution", r"pak[-_ ]study", r"pakistan", r"fia[-_ ]act"]
    },
    "islamic_studies": {
        "domain_key": "islamic_studies",
        "subject_name": "Islamic Studies",
        "subject_slug": "islamic-studies",
        "subject_id": "a1000000-0000-0000-0000-000000000002",
        "topic_slug": "islamic_studies",
        "topic_title": "Islamic Studies & Current Events",
        "syllabus_topic_id": "d1000000-0000-0001-0000-000000000007",
        "exam_slug": "fpsc-inspector-customs-2026",
        "exam_id": "e1000000-0000-0000-0000-000000000001",
        "exam_title": "Inspector Customs / Intelligence Officer (BS-16)",
        "likely_exams": ["Inspector Customs / Intelligence Officer (BS-16)", "Assistant Director FIA (BS-17)"],
        "keywords": [
            "islamic studies", "islamiat", "quran", "hadith", "seerah",
            "prophet muhammad", "battle of badr", "treaty of hudaybiyyah",
            "caliphate", "khulafa", "zakat", "hajj", "fasting", "namaz",
            "pillars of islam", "surah", "revelation", "fiqh", "sahaba"
        ],
        "filename_patterns": [r"islamic[-_ ]studies", r"islamiat", r"quran", r"seerah", r"islam"]
    },
    "everyday_science": {
        "domain_key": "everyday_science",
        "subject_name": "Everyday Science",
        "subject_slug": "everyday-science",
        "subject_id": "a1000000-0000-0000-0000-000000000005",
        "topic_slug": "everyday_science",
        "topic_title": "Everyday Science & General Knowledge",
        "syllabus_topic_id": "d1000000-0000-0003-0000-000000000006",
        "exam_slug": "fpsc-ad-fia-2026",
        "exam_id": "e1000000-0000-0000-0000-000000000003",
        "exam_title": "Assistant Director FIA (BS-17)",
        "likely_exams": ["Assistant Director FIA (BS-17)", "Inspector Customs / Intelligence Officer (BS-16)"],
        "keywords": [
            "everyday science", "general knowledge", "physics", "chemistry", "biology",
            "atmosphere", "ozone layer", "greenhouse effect", "renewable energy",
            "solar system", "planets", "human physiology", "vitamins", "diseases",
            "si units", "ecosystem", "environmental science", "blood groups"
        ],
        "filename_patterns": [r"everyday[-_ ]science", r"general[-_ ]knowledge", r"\bgk\b", r"science"]
    },
    "basic_mathematics": {
        "domain_key": "basic_mathematics",
        "subject_name": "Basic Mathematics",
        "subject_slug": "basic-mathematics",
        "subject_id": "a1000000-0000-0000-0000-000000000006",
        "topic_slug": "basic_arithmetic",
        "topic_title": "Basic Arithmetic & Quantitative Ability",
        "syllabus_topic_id": "d1000000-0000-0003-0000-000000000005",
        "exam_slug": "fpsc-ad-fia-2026",
        "exam_id": "e1000000-0000-0000-0000-000000000003",
        "exam_title": "Assistant Director FIA (BS-17)",
        "likely_exams": ["Assistant Director FIA (BS-17)", "Inspector Customs / Intelligence Officer (BS-16)"],
        "keywords": [
            "mathematics", "math", "arithmetic", "percentage", "percentages",
            "ratio", "ratios", "proportion", "algebra", "speed time distance",
            "averages", "quantitative ability", "geometry", "probability", "numbers"
        ],
        "filename_patterns": [r"math", r"mathematics", r"arithmetic", r"quantitative"]
    }
}


# ==============================================================================
# 2. ENVIRONMENT & CONFIGURATION LOADER
# ==============================================================================
def load_env_vars(workspace_dir: Optional[Path] = None) -> Dict[str, str]:
    """
    Loads environment variables from .env.local and .env without leaking secrets.
    """
    if workspace_dir is None:
        workspace_dir = Path.cwd()

    env_vars: Dict[str, str] = {}
    for filename in [".env.local", ".env"]:
        env_path = workspace_dir / filename
        if env_path.is_file():
            try:
                with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k and k not in env_vars:
                            env_vars[k] = v
            except Exception as e:
                print(f"[Warning] Could not parse {filename}: {e}", file=sys.stderr)

    # Merge OS process environment
    for k, v in os.environ.items():
        if k not in env_vars:
            env_vars[k] = v

    return env_vars


def get_gemini_api_key(env_vars: Dict[str, str]) -> Tuple[Optional[str], str]:
    """
    Returns (api_key, status_description).
    Detects missing or placeholder API keys safely.
    """
    key = env_vars.get("GEMINI_API_KEY") or env_vars.get("GOOGLE_GENAI_API_KEY") or ""
    key = key.strip()

    if not key:
        return None, "MISSING (Neither GEMINI_API_KEY nor GOOGLE_GENAI_API_KEY found in .env.local or .env)"

    low = key.lower()
    if "your_" in low or "placeholder" in low or "fake" in low or key == "AIzaSy_fake_invalid_test_key_xyz987":
        return None, f"PLACEHOLDER (Found placeholder '{key[:6]}...'. A valid Google AI Studio key is required)"

    if not key.startswith("AIza"):
        return key, "CONFIGURED (Custom format)"

    return key, "CONFIGURED_AND_VALID_PREFIX"


# ==============================================================================
# 3. DIRECTORY SCANNER & FILE DISCOVERY
# ==============================================================================
class DirectoryScanner:
    """
    Recursively discovers eligible PDF documents within an explicitly selected folder.
    Guarantees strict isolation: never scans outside input_dir and skips temporary or virtual environment folders.
    """
    EXCLUDED_DIR_NAMES: Set[str] = {
        ".venv", "venv", "node_modules", ".git", "__pycache__",
        "generated_mcqs", "sample_notes", "dist", "build", ".next",
        "temp", "tmp", ".gemini", ".idea", ".vscode"
    }

    @classmethod
    def discover_pdfs(cls, input_dir: Path) -> List[Path]:
        if not input_dir.exists():
            raise FileNotFoundError(f"Selected directory does not exist: {input_dir}")
        if not input_dir.is_dir():
            raise ValueError(f"Selected path is not a directory: {input_dir}")

        resolved_input = input_dir.resolve()
        discovered: List[Path] = []

        for root, dirs, files in os.walk(str(resolved_input)):
            # Prune excluded or hidden directories in-place
            dirs[:] = [
                d for d in dirs
                if not d.startswith(".") and d.lower() not in cls.EXCLUDED_DIR_NAMES
            ]

            for file in files:
                # Skip temp files, hidden files, or office lock files
                if file.startswith(".") or file.startswith("~") or file.endswith(".tmp"):
                    continue
                if file.lower().endswith(".pdf"):
                    pdf_path = Path(root) / file
                    try:
                        # Ensure path is safely within input_dir boundary
                        pdf_path.resolve().relative_to(resolved_input)
                        discovered.append(pdf_path)
                    except ValueError:
                        # Path points outside root (e.g. symlink traversal)
                        continue

        # Sort deterministically
        discovered.sort(key=lambda p: str(p.relative_to(resolved_input)).lower())
        return discovered


# ==============================================================================
# 4. FILE HASHER & DUPLICATE FILE DETECTION
# ==============================================================================
class FileHasher:
    """
    Computes cryptographic SHA-256 hashes of PDF files to detect identical source files.
    """
    @staticmethod
    def compute_sha256(file_path: Path) -> str:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()

    @classmethod
    def detect_batch_duplicates(
        cls,
        pdf_paths: List[Path]
    ) -> Tuple[Dict[str, Path], Dict[Path, str]]:
        """
        Returns:
            first_seen: hash -> first Path where this hash was encountered
            duplicate_map: Path -> path_of_original_duplicate (if duplicate)
        """
        first_seen: Dict[str, Path] = {}
        duplicate_map: Dict[Path, str] = {}

        for p in pdf_paths:
            try:
                f_hash = cls.compute_sha256(p)
                if f_hash in first_seen:
                    duplicate_map[p] = str(first_seen[f_hash])
                else:
                    first_seen[f_hash] = p
            except Exception:
                continue

        return first_seen, duplicate_map


# ==============================================================================
# 5. PDF EXTRACTION & OCR DETECTION
# ==============================================================================
class ExtractedPage:
    def __init__(self, page_num: int, text: str, ocr_applied: bool = False):
        self.page_num = page_num
        self.text = text
        self.char_count = len(text)
        self.word_count = len(text.split())
        self.ocr_applied = ocr_applied

    def to_dict(self) -> Dict[str, Any]:
        return {
            "page_num": self.page_num,
            "char_count": self.char_count,
            "word_count": self.word_count,
            "ocr_applied": self.ocr_applied,
            "preview": self.text[:120].replace("\n", " ").strip()
        }


class PDFExtractor:
    """
    Extracts text from local PDFs and scanned images, tracks original page numbers,
    detects scanned pages requiring OCR, seamlessly falls back to Tesseract OCR when
    no text stream is present on a page, and handles document metadata with robust error recovery.
    """
    OCR_CHARS_PER_PAGE_THRESHOLD = 50
    SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"}

    @classmethod
    def is_tesseract_available(cls) -> bool:
        """
        Checks if pytesseract and Tesseract OCR engine are available on this environment.
        """
        if pytesseract is None or Image is None:
            return False
        return configure_tesseract() is not None

    @classmethod
    def _ocr_image_bytes(cls, image_bytes: bytes) -> str:
        """
        Performs Tesseract OCR on raw image bytes using Pillow and pytesseract.
        Safely catches execution errors and returns an empty string on failure.
        """
        if not image_bytes or pytesseract is None or Image is None:
            return ""

        configure_tesseract()

        try:
            with Image.open(io.BytesIO(image_bytes)) as pil_img:
                if pil_img.mode not in ("RGB", "L"):
                    pil_img = pil_img.convert("RGB")
                text = pytesseract.image_to_string(pil_img)
                return text or ""
        except Exception as e:
            print(f"[Warning] Tesseract OCR execution failed: {e}", file=sys.stderr)
            return ""

    @classmethod
    def ocr_image_file(cls, image_path: Path) -> str:
        """
        Runs Tesseract OCR on a local image file.
        """
        if not image_path.exists() or pytesseract is None or Image is None:
            return ""

        configure_tesseract()

        try:
            with Image.open(image_path) as pil_img:
                if pil_img.mode not in ("RGB", "L"):
                    pil_img = pil_img.convert("RGB")
                text = pytesseract.image_to_string(pil_img)
                return text or ""
        except Exception as e:
            print(f"[Warning] Tesseract OCR execution failed on {image_path}: {e}", file=sys.stderr)
            return ""

    @classmethod
    def _ocr_page(cls, page: Any, page_num: int = 1) -> str:
        """
        Attempts Tesseract OCR on images embedded within a PDF page when text extraction returns empty.
        Extracts images from page.images, passes each to Tesseract, and joins the results.
        """
        if pytesseract is None or Image is None:
            return ""

        extracted_texts: List[str] = []

        try:
            images = getattr(page, "images", None)
            if images:
                for img_obj in images:
                    try:
                        img_data = getattr(img_obj, "data", None)
                        if img_data:
                            txt = cls._ocr_image_bytes(img_data)
                            if txt and txt.strip():
                                extracted_texts.append(txt.strip())
                    except Exception as ie:
                        print(f"[Warning] Error extracting image for OCR on page {page_num}: {ie}", file=sys.stderr)
        except Exception as e:
            print(f"[Warning] Failed to inspect page {page_num} images for OCR: {e}", file=sys.stderr)

        return "\n\n".join(extracted_texts)

    @classmethod
    def _extract_from_image_file(cls, image_path: Path) -> Dict[str, Any]:
        """
        Extracts text from a standalone image file using Tesseract OCR,
        treating it as a single-page document (page 1) compatible with the RAG pipeline.
        """
        file_size = image_path.stat().st_size if image_path.exists() else 0
        raw_text = cls.ocr_image_file(image_path)
        clean_text = cls._clean_text(raw_text)

        extracted = ExtractedPage(page_num=1, text=clean_text, ocr_applied=True)
        total_chars = extracted.char_count
        ocr_needed = total_chars < cls.OCR_CHARS_PER_PAGE_THRESHOLD

        return {
            "success": True,
            "file_name": image_path.name,
            "file_path": str(image_path.resolve()),
            "file_size_bytes": file_size,
            "total_pages": 1,
            "empty_pages_count": 0 if total_chars > 0 else 1,
            "total_chars": total_chars,
            "avg_chars_per_page": float(total_chars),
            "ocr_needed": ocr_needed,
            "ocr_pages_count": 1,
            "ocr_warning": (
                "Scanned or image file with minimal OCR extractable text "
                f"({total_chars} chars). High-resolution scan recommended."
            ) if ocr_needed else None,
            "extraction_status": "OCR_REQUIRED" if ocr_needed else "SUCCESS",
            "metadata": {"source_format": "image"},
            "pages": [extracted]
        }

    @classmethod
    def extract(cls, pdf_path: Path) -> Dict[str, Any]:
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF file does not exist at: {pdf_path}")
        if not pdf_path.is_file():
            raise ValueError(f"Target path is not a file: {pdf_path}")

        # Check for standalone scanned image support
        if pdf_path.suffix.lower() in cls.SUPPORTED_IMAGE_EXTENSIONS:
            return cls._extract_from_image_file(pdf_path)

        if pdf_path.suffix.lower() != ".pdf":
            raise ValueError(f"Target path is not a valid PDF file: {pdf_path}")

        if PdfReader is None:
            raise RuntimeError("pypdf is not installed. Please run: pip install pypdf")

        try:
            reader = PdfReader(str(pdf_path))
        except Exception as e:
            return {
                "success": False,
                "file_name": pdf_path.name,
                "file_path": str(pdf_path.resolve()),
                "file_size_bytes": pdf_path.stat().st_size if pdf_path.exists() else 0,
                "total_pages": 0,
                "empty_pages_count": 0,
                "total_chars": 0,
                "avg_chars_per_page": 0.0,
                "ocr_needed": False,
                "ocr_warning": None,
                "extraction_status": "CORRUPTED",
                "error": f"Failed to open/parse PDF document: {e}",
                "pages": [],
                "metadata": {}
            }

        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                return {
                    "success": False,
                    "file_name": pdf_path.name,
                    "file_path": str(pdf_path.resolve()),
                    "file_size_bytes": pdf_path.stat().st_size,
                    "total_pages": len(reader.pages) if hasattr(reader, "pages") else 0,
                    "empty_pages_count": 0,
                    "total_chars": 0,
                    "avg_chars_per_page": 0.0,
                    "ocr_needed": False,
                    "ocr_warning": None,
                    "extraction_status": "ENCRYPTED",
                    "error": "PDF is password-protected and could not be decrypted.",
                    "pages": [],
                    "metadata": {}
                }

        total_pages = len(reader.pages)
        if total_pages == 0:
            return {
                "success": False,
                "file_name": pdf_path.name,
                "file_path": str(pdf_path.resolve()),
                "file_size_bytes": pdf_path.stat().st_size,
                "total_pages": 0,
                "empty_pages_count": 0,
                "total_chars": 0,
                "avg_chars_per_page": 0.0,
                "ocr_needed": False,
                "ocr_warning": None,
                "extraction_status": "EMPTY",
                "error": "The PDF has 0 pages.",
                "pages": [],
                "metadata": {}
            }

        extracted_pages: List[ExtractedPage] = []
        total_chars = 0
        empty_pages_count = 0

        for idx, page in enumerate(reader.pages, start=1):
            try:
                page_text = page.extract_text() or ""
            except Exception as pe:
                print(f"[Warning] Failed to extract text from page {idx} in {pdf_path.name}: {pe}", file=sys.stderr)
                page_text = ""

            clean_text = cls._clean_text(page_text)
            ocr_applied = False

            # If a PDF page has no extractable text, use OCR fallback
            if not clean_text or len(clean_text.strip()) == 0:
                ocr_text = cls._ocr_page(page, page_num=idx)
                if ocr_text and ocr_text.strip():
                    clean_text = cls._clean_text(ocr_text)
                    ocr_applied = True

            extracted = ExtractedPage(page_num=idx, text=clean_text, ocr_applied=ocr_applied)
            extracted_pages.append(extracted)

            total_chars += extracted.char_count
            if extracted.char_count == 0:
                empty_pages_count += 1

        avg_chars_per_page = total_chars / total_pages if total_pages > 0 else 0
        ocr_needed = (avg_chars_per_page < cls.OCR_CHARS_PER_PAGE_THRESHOLD) or (empty_pages_count / total_pages >= 0.8)

        # Count how many pages had OCR applied
        ocr_pages_count = sum(1 for p in extracted_pages if getattr(p, "ocr_applied", False))

        metadata = {}
        try:
            if reader.metadata:
                metadata = {
                    "title": reader.metadata.title or "",
                    "author": reader.metadata.author or "",
                    "creator": reader.metadata.creator or "",
                }
        except Exception:
            pass

        if ocr_pages_count > 0:
            metadata["ocr_pages_count"] = ocr_pages_count

        return {
            "success": True,
            "file_name": pdf_path.name,
            "file_path": str(pdf_path.resolve()),
            "file_size_bytes": pdf_path.stat().st_size,
            "total_pages": total_pages,
            "empty_pages_count": empty_pages_count,
            "total_chars": total_chars,
            "avg_chars_per_page": round(avg_chars_per_page, 2),
            "ocr_needed": ocr_needed,
            "ocr_pages_count": ocr_pages_count,
            "ocr_warning": (
                "Scanned or image-based PDF detected with minimal extractable text "
                f"(average {avg_chars_per_page:.1f} chars/page). OCR preprocessing is required."
            ) if ocr_needed else None,
            "extraction_status": "OCR_REQUIRED" if ocr_needed else "SUCCESS",
            "metadata": metadata,
            "pages": extracted_pages
        }

    @staticmethod
    def _clean_text(text: str) -> str:
        if not text:
            return ""
        text = text.replace("\x00", "")
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


# ==============================================================================
# 6. SUBJECT & TOPIC CLASSIFIER WITH CONFIDENCE SCORING
# ==============================================================================
class SubjectTopicClassifier:
    """
    Independently classifies PDF documents into subjects, topics, and likely exam profiles
    using filename cues, metadata, headings, and extracted text.
    Computes a numerical classification confidence (0-100%).
    Flags uncertain classifications (<40% or ambiguous) for manual review.
    """
    CONFIDENCE_THRESHOLD = 40.0
    MIN_SIGNAL_SCORE = 15

    @classmethod
    def score_text_for_domain(cls, text: str, domain: Dict[str, Any]) -> int:
        score = 0
        text_lower = text.lower()

        # Exact topic title match
        if domain["topic_title"].lower() in text_lower:
            score += 25

        for kw in domain["keywords"]:
            kw_lower = kw.lower()
            # Whole word / boundary matches
            occurrences = len(re.findall(r"\b" + re.escape(kw_lower) + r"\b", text_lower))
            score += min(occurrences * 3, 30)

        return score

    @classmethod
    def classify_pdf(
        cls,
        extract_result: Dict[str, Any],
        file_name: str
    ) -> Dict[str, Any]:
        file_name_lower = file_name.lower()
        metadata_title = (extract_result.get("metadata", {}).get("title") or "").lower()

        # Combine text from first 5 pages for classification sample
        pages: List[ExtractedPage] = extract_result.get("pages", [])
        sample_pages = pages[:5]
        sample_text = " ".join([p.text for p in sample_pages])
        sample_text_lower = sample_text.lower()

        scores: List[Tuple[Dict[str, Any], int]] = []

        for domain in DOMAINS_TAXONOMY.values():
            domain_score = 0

            # 1. Filename pattern check (highest priority indicator)
            for pattern in domain.get("filename_patterns", []):
                if re.search(pattern, file_name_lower):
                    domain_score += 45
                    break

            # 2. Filename keyword checks
            for kw in domain["keywords"]:
                if kw.lower() in file_name_lower:
                    domain_score += 15
                    break

            # 3. PDF metadata title check
            if metadata_title:
                for kw in domain["keywords"]:
                    if kw.lower() in metadata_title:
                        domain_score += 15
                        break

            # 4. Sample text scoring
            if sample_text:
                domain_score += cls.score_text_for_domain(sample_text[:6000], domain)

            scores.append((domain, domain_score))

        # Sort by score descending
        scores.sort(key=lambda x: x[1], reverse=True)
        top_domain, top_score = scores[0]
        second_score = scores[1][1] if len(scores) > 1 else 0

        # Detect multiple relevant topics across pages (for merged documents)
        detected_topics: List[str] = []
        for dom, sc in scores:
            if sc >= cls.MIN_SIGNAL_SCORE and sc >= (top_score * 0.4):
                if dom["topic_title"] not in detected_topics:
                    detected_topics.append(dom["topic_title"])

        # Confidence calculation
        is_uncertain = False
        confidence = 0.0

        if top_score < cls.MIN_SIGNAL_SCORE or len(sample_text.strip()) < 40:
            is_uncertain = True
            raw_c = (top_score / max(cls.MIN_SIGNAL_SCORE, 1)) * 35.0
            confidence = round(min(35.0, max(5.0, raw_c)), 1)
            status = "NEEDS_REVIEW"
            recommended_action = "confirm_topic_manually"
            detected_subject = "Uncertain / Unclassified"
            detected_subject_id = None
            primary_topic = "Unclassified Topic"
            primary_syllabus_topic_id = None
            primary_exam_slug = None
            primary_exam_id = None
            likely_exams = []
        else:
            # Margin between top and second candidate
            margin = (top_score - second_score) / max(top_score, 1)
            calculated_conf = 50.0 + (margin * 35.0) + min(15.0, top_score / 5.0)
            calculated_conf = min(99.0, max(20.0, calculated_conf))

            if calculated_conf < cls.CONFIDENCE_THRESHOLD or (top_score < 25 and margin < 0.15):
                is_uncertain = True
                confidence = round(calculated_conf, 1)
                status = "NEEDS_REVIEW"
                recommended_action = "confirm_topic_manually"
                detected_subject = "Uncertain / Unclassified"
                detected_subject_id = None
                primary_topic = "Unclassified Topic"
                primary_syllabus_topic_id = None
                primary_exam_slug = None
                primary_exam_id = None
                likely_exams = []
            else:
                is_uncertain = False
                confidence = round(calculated_conf, 1)
                status = "CONFIRMED"
                recommended_action = "ready_for_generation"
                detected_subject = top_domain["subject_name"]
                detected_subject_id = top_domain["subject_id"]
                primary_topic = top_domain["topic_title"]
                primary_syllabus_topic_id = top_domain["syllabus_topic_id"]
                primary_exam_slug = top_domain["exam_slug"]
                primary_exam_id = top_domain["exam_id"]
                likely_exams = top_domain.get("likely_exams", [top_domain["exam_title"]])

        if not detected_topics:
            detected_topics = [primary_topic] if not is_uncertain else ["Needs Manual Identification"]

        return {
            "domain_key": top_domain["domain_key"] if not is_uncertain else None,
            "detected_subject": detected_subject,
            "detected_subject_id": detected_subject_id,
            "detected_topics": detected_topics,
            "primary_topic": primary_topic,
            "primary_syllabus_topic_id": primary_syllabus_topic_id,
            "likely_exam_profiles": likely_exams,
            "primary_exam_slug": primary_exam_slug,
            "primary_exam_id": primary_exam_id,
            "raw_score": top_score,
            "confidence_score": confidence,
            "classification_status": status,
            "is_uncertain": is_uncertain,
            "recommended_action": recommended_action
        }


# ==============================================================================
# 7. TOPIC CHUNKER & DOCUMENT PARTITIONER
# ==============================================================================
class DocumentChunk:
    def __init__(
        self,
        chunk_id: str,
        topic_info: Dict[str, Any],
        text: str,
        start_page: int,
        end_page: int,
        doc_title: str
    ):
        self.chunk_id = chunk_id
        self.topic_info = topic_info
        self.text = text
        self.start_page = start_page
        self.end_page = end_page
        self.doc_title = doc_title

    @property
    def page_reference(self) -> str:
        if self.start_page == self.end_page:
            return f"Page {self.start_page}"
        return f"Pages {self.start_page}-{self.end_page}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "topic_slug": self.topic_info.get("slug", "topic"),
            "topic_title": self.topic_info.get("title", "Topic"),
            "start_page": self.start_page,
            "end_page": self.end_page,
            "page_reference": self.page_reference,
            "char_count": len(self.text),
            "word_count": len(self.text.split()),
            "preview": self.text[:150].replace("\n", " ").strip()
        }


class TopicChunker:
    """
    Maps PDF text to syllabus topics and partitions documents into focused batches
    so requests to the Gemini API are compact, structured, and manageable.
    Preserves original source page numbers and divides merged documents by topic boundaries.
    """
    DEFAULT_MAX_CHUNK_WORDS = 1800
    DEFAULT_MIN_CHUNK_WORDS = 200

    def __init__(
        self,
        exam_slug: str = "fpsc-lecturer-cs-2026",
        topics: Optional[List[Dict[str, Any]]] = None
    ):
        self.exam_slug = exam_slug
        if topics:
            self.topics = topics
        else:
            self.exam_config = SYLLABUS_CATALOG.get(exam_slug)
            if not self.exam_config:
                # Default to CS lecturer if unknown
                self.exam_config = SYLLABUS_CATALOG["fpsc-lecturer-cs-2026"]
            self.topics = self.exam_config["topics"]

    def score_text_for_topic(self, text: str, topic: Dict[str, Any]) -> int:
        score = 0
        text_lower = text.lower()

        title_lower = topic.get("title", "").lower()
        if title_lower and title_lower in text_lower:
            score += 25

        for kw in topic.get("keywords", []):
            kw_lower = kw.lower()
            occurrences = len(re.findall(r"\b" + re.escape(kw_lower) + r"\b", text_lower))
            score += occurrences * 3

        return score

    def identify_topic_from_metadata(self, filename: str, sample_text: str) -> Optional[Dict[str, Any]]:
        filename_lower = filename.lower()
        best_topic = None
        best_score = -1

        for topic in self.topics:
            score = 0
            slug_terms = topic.get("slug", "").split("_")
            for term in slug_terms:
                if term and term in filename_lower:
                    score += 15

            for kw in topic.get("keywords", []):
                if kw.lower() in filename_lower:
                    score += 20

            score += self.score_text_for_topic(sample_text[:4000], topic)

            if score > best_score:
                best_score = score
                best_topic = topic

        if best_score >= 10:
            return best_topic
        return None

    def chunk_individual_pdf(
        self,
        extracted_data: Dict[str, Any],
        forced_topic_slug: Optional[str] = None
    ) -> List[DocumentChunk]:
        pages: List[ExtractedPage] = extracted_data.get("pages", [])
        file_name = extracted_data.get("file_name", "document.pdf")

        if forced_topic_slug:
            topic_info = next((t for t in self.topics if t.get("slug") == forced_topic_slug), None)
            if not topic_info:
                # Build synthetic topic if not in pre-configured list
                topic_info = {
                    "slug": forced_topic_slug,
                    "title": forced_topic_slug.replace("_", " ").title(),
                    "subject": "General",
                    "subject_id": None,
                    "id": None
                }
        else:
            sample_text = " ".join([p.text for p in pages[:5]])
            topic_info = self.identify_topic_from_metadata(file_name, sample_text)
            if not topic_info:
                topic_info = self.topics[0] if self.topics else {
                    "slug": "general_topic",
                    "title": "General Topic",
                    "subject": "General",
                    "subject_id": None,
                    "id": None
                }

        chunks: List[DocumentChunk] = []
        current_chunk_pages: List[ExtractedPage] = []
        current_word_count = 0
        chunk_idx = 1

        for page in pages:
            if page.char_count == 0:
                continue

            current_chunk_pages.append(page)
            current_word_count += page.word_count

            if current_word_count >= self.DEFAULT_MAX_CHUNK_WORDS:
                chunk_text = "\n\n".join([f"--- [Page {p.page_num}] ---\n{p.text}" for p in current_chunk_pages])
                chunks.append(DocumentChunk(
                    chunk_id=f"{topic_info.get('slug', 'top')}_chk_{chunk_idx}",
                    topic_info=topic_info,
                    text=chunk_text,
                    start_page=current_chunk_pages[0].page_num,
                    end_page=current_chunk_pages[-1].page_num,
                    doc_title=file_name
                ))
                chunk_idx += 1
                current_chunk_pages = []
                current_word_count = 0

        if current_chunk_pages:
            chunk_text = "\n\n".join([f"--- [Page {p.page_num}] ---\n{p.text}" for p in current_chunk_pages])
            chunks.append(DocumentChunk(
                chunk_id=f"{topic_info.get('slug', 'top')}_chk_{chunk_idx}",
                topic_info=topic_info,
                text=chunk_text,
                start_page=current_chunk_pages[0].page_num,
                end_page=current_chunk_pages[-1].page_num,
                doc_title=file_name
            ))

        return chunks

    def chunk_merged_pdf(
        self,
        extracted_data: Dict[str, Any],
        filter_topic_slug: Optional[str] = None
    ) -> List[DocumentChunk]:
        pages: List[ExtractedPage] = extracted_data.get("pages", [])
        file_name = extracted_data.get("file_name", "document.pdf")

        page_topic_map: List[Tuple[ExtractedPage, Dict[str, Any]]] = []
        default_topic = self.topics[0] if self.topics else {
            "slug": "general", "title": "General", "subject": "General", "subject_id": None, "id": None
        }
        last_known_topic = default_topic

        for page in pages:
            if page.char_count == 0:
                continue

            scores = [(topic, self.score_text_for_topic(page.text, topic)) for topic in self.topics]
            scores.sort(key=lambda x: x[1], reverse=True)
            top_topic, top_score = scores[0] if scores else (default_topic, 0)

            if top_score >= 8:
                assigned_topic = top_topic
                last_known_topic = top_topic
            else:
                assigned_topic = last_known_topic

            page_topic_map.append((page, assigned_topic))

        chunks: List[DocumentChunk] = []
        if not page_topic_map:
            return chunks

        current_topic = page_topic_map[0][1]
        current_pages: List[ExtractedPage] = []
        current_words = 0
        chunk_idx = 1

        def flush_chunk():
            nonlocal chunk_idx, current_pages, current_words
            if not current_pages:
                return
            if filter_topic_slug and current_topic.get("slug") != filter_topic_slug:
                current_pages = []
                current_words = 0
                return

            chunk_text = "\n\n".join([f"--- [Page {p.page_num}] ---\n{p.text}" for p in current_pages])
            chunks.append(DocumentChunk(
                chunk_id=f"{current_topic.get('slug', 'top')}_merged_{chunk_idx}",
                topic_info=current_topic,
                text=chunk_text,
                start_page=current_pages[0].page_num,
                end_page=current_pages[-1].page_num,
                doc_title=file_name
            ))
            chunk_idx += 1
            current_pages = []
            current_words = 0

        for page, topic in page_topic_map:
            if topic.get("slug") != current_topic.get("slug"):
                flush_chunk()
                current_topic = topic

            current_pages.append(page)
            current_words += page.word_count

            if current_words >= self.DEFAULT_MAX_CHUNK_WORDS:
                flush_chunk()

        flush_chunk()
        return chunks


# ==============================================================================
# 8. GEMINI API MCQ GENERATION CLIENT
# ==============================================================================
class GeminiMCQClient:
    """
    Communicates securely with the Google Gemini API to generate structured,
    syllabus-grounded MCQs from text chunks.
    Ensures that source notes text is transmitted securely over HTTPS and API keys remain unexposed.
    """
    FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"]

    def __init__(
        self,
        api_key: Optional[str],
        model: str = "gemini-3.5-flash-lite",
        temperature: float = 0.2
    ):
        self.api_key = api_key
        self.model = model
        self.temperature = temperature

    def is_available(self) -> bool:
        return bool(self.api_key and not self.api_key.startswith("your_") and requests is not None)

    def generate_mcqs_for_chunk(
        self,
        chunk: DocumentChunk,
        exam_title: str,
        target_count: int = 10,
        difficulty: str = "Moderate"
    ) -> List[Dict[str, Any]]:
        if not self.is_available():
            raise RuntimeError(
                "Gemini API is not configured or requests library is missing.\n"
                "Please configure GEMINI_API_KEY in .env or .env.local to generate live MCQs."
            )

        prompt = self._build_prompt(chunk, exam_title, target_count, difficulty)
        candidate_models = [self.model] + [m for m in self.FALLBACK_MODELS if m != self.model]

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key
        }

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": self.temperature,
                "responseMimeType": "application/json"
            }
        }

        last_error = None
        resp_data = None

        for model_name in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.api_key}"
            try:
                resp = requests.post(url, headers=headers, json=payload, timeout=60)
                if resp.status_code == 200:
                    resp_data = resp.json()
                    break
                elif resp.status_code in (404, 503):
                    print(f"[Notice] Model {model_name} returned HTTP {resp.status_code}. Retrying with next available model...")
                    last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    continue
                else:
                    error_details = resp.text[:300]
                    if resp.status_code in (400, 403):
                        raise RuntimeError(
                            f"Gemini API Authentication/Quota Error ({resp.status_code}): {error_details}\n"
                            "Please verify GEMINI_API_KEY in .env."
                        )
                    raise RuntimeError(f"Gemini API error (HTTP {resp.status_code}): {error_details}")
            except requests.exceptions.Timeout:
                print(f"[Notice] Model {model_name} timed out. Retrying with next available model...")
                last_error = "Timeout connecting to Gemini API"
                continue
            except Exception as e:
                last_error = str(e)
                break

        if resp_data is None:
            raise RuntimeError(f"Failed to generate MCQs across available models. Last error: {last_error}")

        try:
            candidates = resp_data.get("candidates", [])
            if not candidates:
                raise ValueError("Gemini returned empty candidate list.")
            part_text = candidates[0]["content"]["parts"][0]["text"]
            parsed_questions = json.loads(part_text)
            if not isinstance(parsed_questions, list):
                if isinstance(parsed_questions, dict) and "questions" in parsed_questions:
                    parsed_questions = parsed_questions["questions"]
                else:
                    raise ValueError("Gemini response is not a JSON array of questions.")
            return parsed_questions
        except Exception as pe:
            raise ValueError(f"Failed to parse structured JSON from Gemini: {pe}")

    def _build_prompt(
        self,
        chunk: DocumentChunk,
        exam_title: str,
        target_count: int,
        difficulty: str
    ) -> str:
        return f"""You are a Senior Question Author and Subject Matter Expert for competitive civil service and lecturer examinations in Pakistan (FPSC / PPSC).

TASK:
Generate exactly {target_count} ORIGINAL, high-quality Multiple Choice Questions (MCQs) strictly grounded in the provided notes.

EXAM PROFILE: {exam_title}
SUBJECT: {chunk.topic_info.get('subject', 'General')}
SYLLABUS TOPIC: {chunk.topic_info.get('title', 'Syllabus Topic')}
SOURCE DOCUMENT: {chunk.doc_title} ({chunk.page_reference})
TARGET DIFFICULTY: {difficulty}

--- SOURCE NOTES TEXT (FROM PAGES {chunk.start_page} TO {chunk.end_page}) ---
{chunk.text}
--- END SOURCE NOTES ---

STRICT EVIDENCE & QUALITY GENERATION RULES:
1. Academic Concept: Every question must test an actual, fundamental academic concept relevant to the syllabus topic above.
2. Grounded Evidence: For every question, you MUST extract and provide `supporting_evidence`: an exact 1-2 sentence verbatim or near-verbatim excerpt from the source notes text demonstrating why the correct answer is factually correct.
3. No Hallucinated / Fake Citations: DO NOT invent official notices, advertisement numbers, case numbers, regulations, gazette references, or arbitrary codes (e.g. NEVER generate "Notice Ref: 1792829945416", "Advt No: 04/2026", or "Case No: 1234") unless that exact reference explicitly exists in the source text.
4. No Vague Questions: DO NOT ask vague or ambiguous questions such as "Which standard applies to Systems?", "Which of the following is true?", or "What is the standard procedure?" where the question stem fails to specify the actual technical or academic concept.
5. Distinct, Meaningful Options: Every question must have EXACTLY 4 distinct, plausible options (option_a, option_b, option_c, option_d). Strictly avoid "all of the above", "none of the above", "both A and B", "neither A nor B", "option A", "cannot be determined", or generic placeholder options.
6. Exactly One Correct Answer: Exactly one option must be unambiguously correct.
7. correct_option must be an integer index: 0 for option_a, 1 for option_b, 2 for option_c, 3 for option_d.
8. correct_answer_text must match the text of the option indicated by correct_option.
9. Comprehensive Explanation: Provide a clear, conceptual explanation of why the correct option is right and the other 3 distractors are incorrect based on the subject matter.
10. Source Page: source_page must be the specific page reference (e.g. "{chunk.page_reference}").
11. Practice Label: Questions are original AI-generated practice questions. DO NOT claim that questions appeared in past official FPSC papers, and do NOT use phrases like "according to the official syllabus" without explicit textual proof.
12. Clean Academic Question Text: The question_text must contain ONLY clean, clear, academic question text. NEVER include test prefixes (e.g. 'Test Review Flow Candidate', 'Test Candidate', 'Test Stage 1'), internal IDs, timestamps, or debugging labels.

OUTPUT FORMAT:
Return a valid JSON array of objects conforming exactly to this schema:
[
  {{
    "question_text": "Which condition is required for...",
    "option_a": "First meaningful distinct option",
    "option_b": "Second meaningful distinct option",
    "option_c": "Third meaningful distinct option",
    "option_d": "Fourth meaningful distinct option",
    "correct_option": 0,
    "correct_answer_text": "First meaningful distinct option",
    "explanation": "Clear, conceptual explanation grounded in the text...",
    "difficulty": "{difficulty}",
    "source_page": "{chunk.page_reference}",
    "supporting_evidence": "Verbatim 1-2 sentence excerpt from the source text supporting this question."
  }}
]
"""

    def review_candidate_questions(
        self,
        candidate_questions: List[Dict[str, Any]],
        chunk: DocumentChunk,
        exam_title: str
    ) -> List[Dict[str, Any]]:
        """
        Applies a second-pass AI quality review on candidate questions in manageable batches
        to verify that the correct answer is factually supported, distractors are distinct,
        and no hallucinated citations or vague questions exist.
        Returns a list of review verdict objects:
        [{"index": 0, "approved": True/False, "rejection_reason": "..."}]
        """
        if not self.is_available() or not candidate_questions or requests is None:
            return [{"index": i, "approved": True, "rejection_reason": None} for i in range(len(candidate_questions))]

        # Compact representation for manageable token size
        review_items = []
        for idx, q in enumerate(candidate_questions):
            review_items.append({
                "index": idx,
                "question_text": q.get("question_text"),
                "options": [q.get("option_a"), q.get("option_b"), q.get("option_c"), q.get("option_d")],
                "correct_option": q.get("correct_option"),
                "correct_answer_text": q.get("correct_answer_text"),
                "explanation": q.get("explanation"),
                "supporting_evidence": q.get("supporting_evidence", "")
            })

        review_prompt = f"""You are a Strict Senior Academic Quality Auditor for competitive exam questions (FPSC / PPSC).

Review these candidate MCQs generated from the provided text excerpt.

SOURCE TEXT EXCERPT (FROM {chunk.doc_title}):
{chunk.text[:3500]}

CANDIDATE QUESTIONS TO AUDIT:
{json.dumps(review_items, indent=2)}

AUDIT CRITERIA (REJECT ANY QUESTION THAT FAILS):
1. Unsupported Answer: The correct answer is not supported by the supporting evidence or source text.
2. Ambiguous / Multiple Answers: More than one option could be correct or the question stem is ambiguous.
3. Vague Stem: Questions like "Which standard applies to Systems?" or questions lacking academic context.
4. Fake Citations: Hallucinated notice numbers, advertisement numbers, or case references (e.g. "Notice Ref: 1792829945416").
5. Generic / Flawed Options: Generic options like "all of the above", "none of the above", duplicate options, or absurd distractors.
6. Wrong Subject/Topic: The question is unrelated to the subject '{chunk.topic_info.get('subject')}' or topic '{chunk.topic_info.get('title')}'.

OUTPUT FORMAT:
Return a valid JSON array of objects:
[
  {{
    "index": 0,
    "approved": true,
    "quality_score": 5,
    "rejection_reason": null
  }},
  {{
    "index": 1,
    "approved": false,
    "quality_score": 1,
    "rejection_reason": "Correct answer is not supported by the source text; distractors are generic."
  }}
]
"""
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key
        }
        payload = {
            "contents": [{"parts": [{"text": review_prompt}]}],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
        }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=45)
            if resp.status_code == 200:
                resp_json = resp.json()
                part_text = resp_json["candidates"][0]["content"]["parts"][0]["text"]
                verdicts = json.loads(part_text)
                if isinstance(verdicts, dict) and "verdicts" in verdicts:
                    verdicts = verdicts["verdicts"]
                return verdicts if isinstance(verdicts, list) else []
            else:
                print(f"[Notice] Second-pass AI reviewer returned HTTP {resp.status_code}. Falling back to deterministic validation.")
        except Exception as rev_err:
            print(f"[Notice] Second-pass AI reviewer skipped due to network/parsing: {rev_err}")

        # Fallback if AI reviewer fails or is unavailable
        return [{"index": i, "approved": True, "rejection_reason": None} for i in range(len(candidate_questions))]



# ==============================================================================
# 9. QUESTION VALIDATION & DEDUPLICATION ENGINE
# ==============================================================================
class ValidationResult:
    def __init__(self):
        self.accepted: List[Dict[str, Any]] = []
        self.duplicates: List[Dict[str, Any]] = []
        self.rejected: List[Dict[str, Any]] = []

    @property
    def total_processed(self) -> int:
        return len(self.accepted) + len(self.duplicates) + len(self.rejected)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_processed": self.total_processed,
            "accepted_count": len(self.accepted),
            "duplicate_count": len(self.duplicates),
            "rejected_count": len(self.rejected),
            "rejections": self.rejected,
            "duplicates": self.duplicates
        }


class MCQValidator:
    """
    Validates MCQ schema constraints, calculates stable SHA-256 deduplication hashes,
    and detects duplicate and ambiguous questions across batches and existing question banks.
    """
    DISALLOWED_OPTION_PHRASES: Set[str] = {
        "all of the above", "none of the above", "all of these", "none of these",
        "both a and b", "both b and c", "both a and c", "both a & b", "both b & c",
        "neither a nor b", "option a", "option b", "option c", "option d",
        "cannot be determined", "not applicable", "n/a", "both", "neither"
    }

    FAKE_CITATION_REGEX = re.compile(
        r"(?i)\b(notice\s*(?:ref|reference|no)?|advt\s*no|advertisement\s*no|case\s*no|notification\s*no|sro\s*\d+|gazette\s*notification)[:\s#]*[A-Z0-9\/-]{4,}\b"
    )

    VAGUE_STEM_REGEX = re.compile(
        r"(?i)^(which|what)\s+(standard|rule|procedure|process|system|method)\s+applies\s+to\s+(systems|it|this|that|all)\??$"
    )

    PREFIX_PATTERNS = [
        re.compile(r"^Test\s+Review\s+Flow\s+Candidate\s*\[[^\]]+\]\s*:\s*", re.I),
        re.compile(r"^Test\s+Candidate\s*\[[^\]]+\]\s*:\s*", re.I),
        re.compile(r"^Candidate\s*\[[^\]]+\]\s*:\s*", re.I),
        re.compile(r"^Automated\s+Bulk\s+Import\s+E2E\s+Test\s+Question(?:\s+\d+)?\s*:\s*", re.I),
        re.compile(r"^Bulk\s+Import\s+E2E\s+Test\s+Question(?:\s+\d+)?\s*:\s*", re.I),
        re.compile(r"^Test\s+Stage\s+\d+\s+Automated\s+Ingestion(?:\s+\d+)?\s*:\s*", re.I),
        re.compile(r"^Test\s+Stage\s+\d+(?:\s+\d+)?\s*:\s*", re.I),
        re.compile(r"^Test\s+Automated\s+Ingestion(?:\s+\d+)?\s*:\s*", re.I),
        re.compile(r"^Test\s+Ingestion(?:\s+\d+)?\s*:\s*", re.I),
        re.compile(r"^Idempotent\s+Test\s+Question(?:\s+\d+)?\s*:\s*", re.I),
        re.compile(r"^Automated\s+Ingestion\s+Test(?:\s+\d+)?\s*:\s*", re.I),
        re.compile(r"^(?:DEBUG|TEST|FIXTURE|SAMPLE_TEST)\s*:\s*", re.I),
        # Fake FPSC case number prefixes (e.g. F.4-123/2026-R)
        re.compile(r"^\s*F\.\s*(?:No\.?\s*)?\d+-\d+/\d{4}(?:-[A-Z]+)?\s*[,;:.\-]*\s*", re.I),
        # Standalone Q-ID or internal ID prefixes
        re.compile(r"^\s*Q[-_]?\d{3,}\s*:\s*", re.I),
        re.compile(r"^\s*ID\s*:\s*[a-f0-9-]{6,}\s*:\s*", re.I),
    ]

    TRAILING_REF_PATTERNS = [
        re.compile(r"\s*\(Ref:\s*[\d\w\s-]+\)\s*$", re.I),
        re.compile(r"\s*\(Notice Ref:\s*[\d\w\s-]+\)\s*$", re.I),
        re.compile(r"\s*\[Ref:\s*[\d\w\s-]+\]\s*$", re.I),
        re.compile(r"\s*\(Case\s+No\.?\s*[\d\w/-]+\)\s*$", re.I),
        re.compile(r"\s*\(Notification\s+No\.?\s*[\d\w/-]+\)\s*$", re.I),
        re.compile(r"\s*\(?\s*F\.\s*(?:No\.?\s*)?\d+-\d+/\d{4}(?:-[A-Z]+)?\s*\)?\s*$", re.I),
    ]

    @classmethod
    def clean_question_text(cls, raw_text: str) -> str:
        if not raw_text:
            return ""
        text = str(raw_text).strip()
        # HTML entity decoding
        text = text.replace("&#x20;", " ").replace("&#32;", " ").replace("&nbsp;", " ").replace("&#160;", " ")
        text = text.replace("&quot;", '"').replace("&#34;", '"').replace("&apos;", "'").replace("&#39;", "'").replace("&amp;", "&")

        for pat in cls.PREFIX_PATTERNS:
            text = pat.sub("", text)
        for pat in cls.TRAILING_REF_PATTERNS:
            text = pat.sub("", text)

        # Strip benchmark and variant timestamps
        text = re.sub(r"(?i)\s*(?:under\s+)?benchmark\s+\d{8,}\s*(\?|$)", r"\1", text)
        text = re.sub(r"(?i)\s*variant\s+\d{8,}\s*(\?|$)", r"\1", text)

        # Strip random generated architecture tokens
        text = re.sub(r"(?i)Under\s+virtual\s+memory\s+architecture\s+[a-z0-9]{8,14}\s*,?\s*", "In virtual memory architecture, ", text)
        text = re.sub(r"(?i)^Under\s+virtual\s+memory\s+architecture\s*,?\s*", "In virtual memory architecture, ", text)

        # Strip random test subsystem tokens
        text = re.sub(r"(?i)\s+subsystem\s+[a-z0-9]{8,14}\s*(\?|$)", r"?\1", text)

        # Clean spaces and ensure ending question mark
        text = re.sub(r"\s+", " ", text).replace(" ?", "?").strip()
        if re.search(r"(?i)^(what|which|why|how|where|when|in\s+virtual\s+memory)", text) and not text.endswith("?"):
            text += "?"

        return text

    def __init__(self, existing_hashes: Optional[set] = None):
        self.existing_hashes = existing_hashes if existing_hashes is not None else set()
        self.batch_hashes: set = set()
        self.batch_accepted_stems: List[str] = []

    @staticmethod
    def normalize_text(text: str) -> str:
        if not text:
            return ""
        text_clean = re.sub(r"[^\w\s]", "", text.lower())
        return " ".join(text_clean.split())

    @classmethod
    def calculate_hash(cls, subject_id: Optional[str], question_text: str) -> str:
        norm = cls.normalize_text(question_text)
        s_id = subject_id or "generic_subject"
        payload = f"{s_id}::{norm}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def validate_and_deduplicate(
        self,
        raw_questions: List[Dict[str, Any]],
        chunk: DocumentChunk,
        exam_id: Optional[str]
    ) -> ValidationResult:
        result = ValidationResult()

        for idx, raw in enumerate(raw_questions):
            errors = []
            raw_q_text = str(raw.get("question_text", "")).strip()
            q_text = self.clean_question_text(raw_q_text)

            # Check synthetic / fabricated notice template
            if re.search(r"(?i)According to official syllabus notice regarding.*which standard applies to", q_text):
                errors.append("Contains synthetic syllabus notice template with fabricated case/notice reference.")
            elif re.search(r"(?i)\b(?:applies to|standard for)\s+[A-Za-z]+:\s*\?", q_text):
                errors.append("Question stem ends with dangling malformed keyword before question mark.")
            elif re.search(r"(?i)^Regarding\s+.+,\s+which\s+principle\s+applies\s+to\s+", q_text):
                errors.append("Template-generated fallback question ('Regarding X, which principle applies to Y?').")
            elif re.search(r"(?i)^Under the curriculum syllabus for\s+\"", q_text):
                errors.append("Document ingestion template question ('Under the curriculum syllabus for...').")
            elif re.search(r"(?i)which\s+standard\s+applies\s+to\s+\w+\s*\?", q_text) and len(q_text) < 80:
                errors.append("Short formulaic template question with no real academic content.")
            elif re.search(r"(?i)F\.\s*(?:No\.?\s*)?\d+-\d+/\d{4}-[A-Z]+", q_text) and re.search(r"(?i)(?:official\s+(?:syllabus|notice|notification|gazette)|as\s+outlined\s+in)", q_text):
                errors.append("Contains fake FPSC case number with fabricated official notice reference or syllabus claim.")
            elif re.search(r"(?i)^Based on page\s+\d+,", q_text):
                errors.append("Unanchored page reference lacking standalone academic concept context ('Based on page...').")

            # 1. Question text length
            if len(q_text) < 10:
                errors.append(f"Question text is too short ({len(q_text)} chars). Min 10 chars required.")

            # 2. Vague stem rejection (e.g. "Which standard applies to Systems?")
            if self.VAGUE_STEM_REGEX.search(q_text):
                errors.append("Vague question stem: Question lacks specific academic concept context (e.g. 'Which standard applies to Systems?').")
            elif re.match(r"(?i)^(which|what)\s+of\s+the\s+following\s+is\s+(true|correct|false|valid|a\s+standard)\s*\??$", q_text):
                errors.append("Vague question stem: Question stem is incomplete and does not establish what is being asked.")

            # 3. Hallucinated official notice / advertisement / citation rejection
            combined_text = f"{q_text} {raw.get('explanation', '')} {raw.get('option_a', '')} {raw.get('option_b', '')} {raw.get('option_c', '')} {raw.get('option_d', '')}"
            for cite_match in self.FAKE_CITATION_REGEX.finditer(combined_text):
                matched_citation = cite_match.group(0).strip()
                if matched_citation.lower() not in chunk.text.lower():
                    errors.append(
                        f"Rejected: Invented official notice, advertisement, or citation reference ('{matched_citation}') not present in source text."
                    )
                    break

            # 4. "according to the official syllabus" unsupported claim rejection
            if "according to the official syllabus" in combined_text.lower() or "according to official syllabus" in combined_text.lower():
                if "according to the official syllabus" not in chunk.text.lower() and "official syllabus" not in chunk.text.lower():
                    errors.append("Unsupported claim: Uses 'according to official syllabus' without evidence in source text.")

            # 5. Options validation (exactly 4 non-empty, distinct, meaningful options)
            opts = [
                str(raw.get("option_a", "")).strip(),
                str(raw.get("option_b", "")).strip(),
                str(raw.get("option_c", "")).strip(),
                str(raw.get("option_d", "")).strip()
            ]

            if any(len(o) == 0 for o in opts):
                errors.append("One or more options are empty.")

            lower_opts = [o.lower() for o in opts if o]
            if len(set(lower_opts)) != len(lower_opts):
                errors.append("Question has duplicate/identical options.")

            # Reject generic or placeholder options ("all of the above", "none of the above", "both a and b")
            for o in opts:
                clean_opt = re.sub(r"[^\w\s]", "", o.lower()).strip()
                if clean_opt in self.DISALLOWED_OPTION_PHRASES or clean_opt.startswith("both a and") or clean_opt.startswith("neither a nor"):
                    errors.append(f"Question contains disallowed or generic option: '{o}'. Meaningful, distinct domain options required.")
                    break

            # 6. Correct option index
            corr_opt = raw.get("correct_option")
            if corr_opt is None or not isinstance(corr_opt, int) or corr_opt not in [0, 1, 2, 3]:
                try:
                    corr_opt = int(corr_opt)
                    if corr_opt not in [0, 1, 2, 3]:
                        errors.append(f"Invalid correct_option index '{corr_opt}'. Must be 0, 1, 2, or 3.")
                except Exception:
                    errors.append(f"correct_option must be an integer index (0-3). Found '{corr_opt}'.")

            # 7. Correct answer text verification
            corr_text = str(raw.get("correct_answer_text", "")).strip()
            if isinstance(corr_opt, int) and 0 <= corr_opt < len(opts):
                expected_opt_text = opts[corr_opt]
                if not corr_text:
                    corr_text = expected_opt_text
                elif corr_text.lower() != expected_opt_text.lower():
                    errors.append(
                        f"correct_answer_text ('{corr_text}') does not match option index {corr_opt} ('{expected_opt_text}')."
                    )

            # 8. Explanation validation
            expl = str(raw.get("explanation", "")).strip()
            if len(expl) < 5:
                errors.append("Explanation is missing or too short (min 5 chars).")

            # 9. Difficulty
            diff = str(raw.get("difficulty", "Moderate")).capitalize()
            if diff not in ["Easy", "Moderate", "Advanced"]:
                diff = "Moderate"

            # 10. Supporting evidence grounding check
            supporting_evidence = str(raw.get("supporting_evidence", "")).strip()
            if supporting_evidence:
                norm_ev_tokens = set(self.normalize_text(supporting_evidence).split())
                norm_chunk_tokens = set(self.normalize_text(chunk.text).split())
                if norm_ev_tokens and len(norm_ev_tokens.intersection(norm_chunk_tokens)) / len(norm_ev_tokens) < 0.4:
                    errors.append("Supporting evidence excerpt could not be verified against the source text.")
            else:
                # Extract fallback evidence excerpt from chunk text
                chunk_sentences = [s.strip() for s in re.split(r"[.\n]", chunk.text) if len(s.strip()) > 20]
                matching_sentence = next(
                    (s for s in chunk_sentences if any(tok in s.lower() for tok in self.normalize_text(q_text).split() if len(tok) > 4)),
                    chunk_sentences[0] if chunk_sentences else chunk.text[:150].replace("\n", " ").strip()
                )
                supporting_evidence = matching_sentence

            if errors:
                result.rejected.append({
                    "raw_index": idx,
                    "question_text": q_text[:80],
                    "errors": errors,
                    "raw_data": raw
                })
                continue

            # 11. Deduplication Check (Exact normalized SHA-256 hash)
            subject_id = chunk.topic_info.get("subject_id") or ""
            q_hash = self.calculate_hash(subject_id, q_text)

            if q_hash in self.batch_hashes:
                result.duplicates.append({
                    "raw_index": idx,
                    "question_text": q_text[:80],
                    "reason": "Duplicate within current generation session",
                    "hash": q_hash
                })
                continue

            if q_hash in self.existing_hashes:
                result.duplicates.append({
                    "raw_index": idx,
                    "question_text": q_text[:80],
                    "reason": "Duplicate matching existing question bank database record",
                    "hash": q_hash
                })
                continue

            # 12. Near-duplicate stem check using Jaccard token similarity
            q_tokens = set(self.normalize_text(q_text).split())
            is_near_dup = False
            for accepted_stem in self.batch_accepted_stems:
                prev_tokens = set(self.normalize_text(accepted_stem).split())
                if q_tokens and prev_tokens:
                    overlap = len(q_tokens.intersection(prev_tokens))
                    union = len(q_tokens.union(prev_tokens))
                    jaccard = overlap / union if union > 0 else 0
                    if jaccard >= 0.75:
                        is_near_dup = True
                        break

            if is_near_dup:
                result.duplicates.append({
                    "raw_index": idx,
                    "question_text": q_text[:80],
                    "reason": "Near-duplicate question repeating an existing question with minor wording changes",
                    "hash": q_hash
                })
                continue

            self.batch_hashes.add(q_hash)
            self.batch_accepted_stems.append(q_text)

            # 13. Build canonical record matching questionIngestionService schema
            assigned_exam_slug = chunk.topic_info.get("exam") or "fpsc-lecturer-cs-2026"
            assigned_exam_id = chunk.topic_info.get("exam_id") or exam_id

            canonical_record = {
                "question_text": q_text,
                "option_a": opts[0],
                "option_b": opts[1],
                "option_c": opts[2],
                "option_d": opts[3],
                "correct_option": corr_opt,
                "correct_answer_text": corr_text,
                "difficulty": diff,
                "subject": chunk.topic_info.get("subject", "General"),
                "subject_id": chunk.topic_info.get("subject_id"),
                "exam": assigned_exam_slug,
                "exam_id": assigned_exam_id,
                "topic": chunk.topic_info.get("title", "Topic"),
                "syllabus_topic_id": chunk.topic_info.get("id"),
                "explanation": expl,
                "source_title": chunk.doc_title,
                "source_page": raw.get("source_page") or chunk.page_reference,
                "source_url": "",
                "supporting_evidence": supporting_evidence,
                "question_origin": "ai_generated_practice",
                "verification_status": "practice_exercise",
                "is_published": False,
                "dedup_hash": q_hash
            }

            result.accepted.append(canonical_record)

        return result



# ==============================================================================
# 10. MANIFEST BUILDER & EXPORTER
# ==============================================================================
class ManifestBuilder:
    """
    Builds and exports comprehensive processing manifests in JSON and CSV format.
    Provides complete visibility into discovered files, hashes, classifications, OCR needs, and duplicates.
    """
    MANIFEST_CSV_HEADERS = [
        "file_name",
        "relative_path",
        "file_hash",
        "file_size_bytes",
        "total_pages",
        "total_chars",
        "avg_chars_per_page",
        "extraction_status",
        "ocr_needed",
        "is_duplicate_file",
        "duplicate_of",
        "detected_subject",
        "detected_subject_id",
        "detected_topics",
        "primary_topic",
        "primary_syllabus_topic_id",
        "likely_exam_profiles",
        "primary_exam_slug",
        "primary_exam_id",
        "classification_confidence",
        "classification_status",
        "recommended_action"
    ]

    @classmethod
    def export_manifest(
        cls,
        manifest_entries: List[Dict[str, Any]],
        output_dir: Path
    ) -> Tuple[Path, Path]:
        output_dir.mkdir(parents=True, exist_ok=True)
        json_path = output_dir / "processing_manifest.json"
        csv_path = output_dir / "processing_manifest.csv"

        # 1. JSON Export
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(manifest_entries, f, indent=2, ensure_ascii=False)

        # 2. CSV Export
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            writer.writerow(cls.MANIFEST_CSV_HEADERS)
            for entry in manifest_entries:
                row = [
                    entry.get("file_name", ""),
                    entry.get("relative_path", ""),
                    entry.get("file_hash", ""),
                    entry.get("file_size_bytes", 0),
                    entry.get("total_pages", 0),
                    entry.get("total_chars", 0),
                    entry.get("avg_chars_per_page", 0.0),
                    entry.get("extraction_status", "UNKNOWN"),
                    "true" if entry.get("ocr_needed") else "false",
                    "true" if entry.get("is_duplicate_file") else "false",
                    entry.get("duplicate_of") or "",
                    entry.get("detected_subject") or "",
                    entry.get("detected_subject_id") or "",
                    " | ".join(entry.get("detected_topics", [])),
                    entry.get("primary_topic") or "",
                    entry.get("primary_syllabus_topic_id") or "",
                    " | ".join(entry.get("likely_exam_profiles", [])),
                    entry.get("primary_exam_slug") or "",
                    entry.get("primary_exam_id") or "",
                    entry.get("classification_confidence", 0.0),
                    entry.get("classification_status", "NEEDS_REVIEW"),
                    entry.get("recommended_action", "")
                ]
                writer.writerow(row)

        return json_path, csv_path


# ==============================================================================
# 11. CSV EXPORTER & BATCH AUDIT REPORTING
# ==============================================================================
class CSVExporter:
    """
    Exports valid, reviewed draft questions into RFC 4180 CSV files
    compatible with ExamSathi AI's Supabase ingestion utility.
    Guarantees overwrite protection to safeguard previously generated question files.
    """
    CSV_HEADERS = [
        "question_text",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "correct_option",
        "correct_answer_text",
        "difficulty",
        "subject",
        "subject_id",
        "exam",
        "exam_id",
        "topic",
        "syllabus_topic_id",
        "explanation",
        "source_title",
        "source_page",
        "source_url",
        "question_origin",
        "verification_status",
        "is_published"
    ]

    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _sanitize_slug(text: str) -> str:
        s = re.sub(r"[^\w\s-]", "", text.lower())
        return re.sub(r"[-\s]+", "_", s).strip("_")

    def export_topic_csv(
        self,
        topic_slug: str,
        questions: List[Dict[str, Any]],
        source_stem: Optional[str] = None,
        overwrite: bool = False
    ) -> Path:
        """
        Exports questions for a specific topic into a UTF-8 CSV with overwrite protection.
        """
        clean_topic = self._sanitize_slug(topic_slug)

        # Standard default naming matching existing pipeline
        default_filename = f"computer_science_lecturer_{clean_topic}.csv"
        file_path = self.output_dir / default_filename

        if file_path.exists() and not overwrite:
            # Overwrite protection: preserve existing file and create safe suffixed file
            stem_tag = f"_{self._sanitize_slug(source_stem)}" if source_stem else ""
            candidate_name = f"computer_science_lecturer_{clean_topic}{stem_tag}.csv"
            file_path = self.output_dir / candidate_name

            counter = 1
            while file_path.exists():
                file_path = self.output_dir / f"computer_science_lecturer_{clean_topic}{stem_tag}_{counter}.csv"
                counter += 1

            print(
                f"[Notice] Preserved existing '{default_filename}' (overwrite disabled). "
                f"Exporting new questions to '{file_path.name}'."
            )

        with open(file_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            writer.writerow(self.CSV_HEADERS)

            for q in questions:
                row = [
                    q["question_text"],
                    q["option_a"],
                    q["option_b"],
                    q["option_c"],
                    q["option_d"],
                    q["correct_option"],
                    q["correct_answer_text"],
                    q["difficulty"],
                    q["subject"],
                    q["subject_id"] or "",
                    q["exam"],
                    q["exam_id"] or "",
                    q["topic"],
                    q["syllabus_topic_id"] or "",
                    q["explanation"],
                    q["source_title"],
                    q["source_page"],
                    q["source_url"] or "",
                    q["question_origin"],
                    q["verification_status"],
                    "false"
                ]
                writer.writerow(row)

        return file_path

    def write_generation_report(self, report_data: Dict[str, Any]) -> Path:
        report_path = self.output_dir / "generation_report.json"
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        return report_path

    def write_batch_report(self, report_data: Dict[str, Any]) -> Tuple[Path, Path]:
        json_path = self.output_dir / "batch_generation_report.json"
        csv_path = self.output_dir / "batch_generation_report.csv"

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)

        headers = [
            "file_name", "file_hash", "subject", "topic", "status",
            "accepted_count", "duplicate_count", "rejected_count", "error"
        ]
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            writer.writerow(headers)
            for item in report_data.get("per_file_results", []):
                writer.writerow([
                    item.get("file_name", ""),
                    item.get("file_hash", ""),
                    item.get("subject", ""),
                    item.get("topic", ""),
                    item.get("status", ""),
                    item.get("accepted_count", 0),
                    item.get("duplicate_count", 0),
                    item.get("rejected_count", 0),
                    item.get("error", "")
                ])

        return json_path, csv_path


# ==============================================================================
# 12. MASTER ORCHESTRATOR & BATCH PIPELINE
# ==============================================================================
class PDFMCQGenerator:
    """
    Main controller coordinating PDF extraction, subject/topic classification,
    manifest generation, topic chunking, Gemini MCQ generation, deduplication,
    validation, and CSV export.
    Supports single PDF files as well as recursive folder batch processing.
    """
    def __init__(
        self,
        exam_slug: str = "fpsc-lecturer-cs-2026",
        output_dir: str = "generated_mcqs",
        model: str = "gemini-3.5-flash-lite",
        custom_env: Optional[Dict[str, str]] = None
    ):
        self.exam_slug = exam_slug
        self.exam_config = SYLLABUS_CATALOG.get(exam_slug)
        if not self.exam_config:
            self.exam_config = SYLLABUS_CATALOG["fpsc-lecturer-cs-2026"]

        self.output_dir = Path(output_dir)
        self.env_vars = custom_env or load_env_vars()
        self.gemini_key, self.key_status = get_gemini_api_key(self.env_vars)
        self.model = model

        self.chunker = TopicChunker(exam_slug=self.exam_slug)
        self.exporter = CSVExporter(output_dir=self.output_dir)
        self.gemini_client = GeminiMCQClient(api_key=self.gemini_key, model=self.model)

    def load_existing_db_hashes(self) -> set:
        hashes = set()
        sb_url = self.env_vars.get("VITE_SUPABASE_URL")
        sb_key = self.env_vars.get("VITE_SUPABASE_PUBLISHABLE_KEY")

        if not sb_url or not sb_key or requests is None:
            return hashes

        try:
            headers = {
                "apikey": sb_key,
                "Authorization": f"Bearer {sb_key}"
            }
            url = f"{sb_url.rstrip('/')}/rest/v1/questions?select=question_text,subject_id&exam_id=eq.{self.exam_config['exam_id']}"
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                data = r.json()
                for item in data:
                    s_id = item.get("subject_id") or ""
                    q_t = item.get("question_text") or ""
                    if q_t:
                        hashes.add(MCQValidator.calculate_hash(s_id, q_t))
                print(f"[Info] Loaded {len(hashes)} existing question hashes from Supabase for deduplication.")
        except Exception as e:
            print(f"[Warning] Could not fetch existing DB question hashes: {e}", file=sys.stderr)

        return hashes

    def process_directory(
        self,
        input_dir: Path,
        manifest_only: bool = False,
        dry_run: bool = False,
        overwrite: bool = False,
        batch_size: int = 10,
        mode: str = "auto"
    ) -> Dict[str, Any]:
        """
        Processes all eligible PDFs inside input_dir recursively.
        Creates a processing manifest, reports unreadable/scanned/duplicate files,
        partitions valid documents, and generates MCQs with failure isolation.
        """
        print(f"\n========================================================")
        print(f"ExamSathi AI - Batch Processing Directory: {input_dir.resolve()}")
        print(f"Output Directory: {self.output_dir.resolve()}")
        print(f"Gemini Key Status: {self.key_status}")
        print(f"Mode: {'Manifest-Only' if manifest_only else ('Dry-Run' if dry_run else 'Live Generation')}")
        print(f"Overwrite Output CSVs: {overwrite}")
        print(f"========================================================\n")

        # 1. Discover PDFs recursively within input_dir
        discovered_paths = DirectoryScanner.discover_pdfs(input_dir)
        print(f"Discovered {len(discovered_paths)} PDF file(s) inside {input_dir.name}.")

        if not discovered_paths:
            print("[Notice] No PDF files discovered in the selected folder.")
            empty_report = {
                "input_dir": str(input_dir.resolve()),
                "total_discovered": 0,
                "manifest_only": manifest_only,
                "dry_run": dry_run
            }
            return empty_report

        # 2. Hash files and detect duplicates across batch
        first_seen_hashes, duplicate_map = FileHasher.detect_batch_duplicates(discovered_paths)

        # 3. Analyze, extract, and classify each document
        manifest_entries: List[Dict[str, Any]] = []
        extracted_data_map: Dict[Path, Dict[str, Any]] = []
        classification_map: Dict[Path, Dict[str, Any]] = {}
        extracted_map: Dict[Path, Dict[str, Any]] = {}

        resolved_input_dir = input_dir.resolve()
        for p in discovered_paths:
            f_hash = FileHasher.compute_sha256(p)
            is_dup = p in duplicate_map
            dup_of = duplicate_map.get(p)

            # Extract text metrics
            extract_res = PDFExtractor.extract(p)
            extracted_map[p] = extract_res

            # Classify
            classif = SubjectTopicClassifier.classify_pdf(extract_res, p.name)
            classification_map[p] = classif

            # Determine action
            if not extract_res["success"]:
                action = "file_unreadable"
            elif is_dup:
                action = "skip_duplicate"
            elif extract_res["ocr_needed"]:
                action = "ocr_preprocessing_required"
            elif classif["is_uncertain"]:
                action = "confirm_topic_manually"
            else:
                action = "ready_for_generation"

            entry = {
                "file_name": p.name,
                "relative_path": str(p.resolve().relative_to(resolved_input_dir)),
                "absolute_path": str(p.resolve()),
                "file_hash": f_hash,
                "file_size_bytes": extract_res["file_size_bytes"],
                "total_pages": extract_res["total_pages"],
                "total_chars": extract_res["total_chars"],
                "avg_chars_per_page": extract_res["avg_chars_per_page"],
                "extraction_status": extract_res["extraction_status"],
                "ocr_needed": extract_res["ocr_needed"],
                "ocr_warning": extract_res.get("ocr_warning"),
                "is_duplicate_file": is_dup,
                "duplicate_of": dup_of,
                "detected_subject": classif["detected_subject"],
                "detected_subject_id": classif["detected_subject_id"],
                "detected_topics": classif["detected_topics"],
                "primary_topic": classif["primary_topic"],
                "primary_syllabus_topic_id": classif["primary_syllabus_topic_id"],
                "likely_exam_profiles": classif["likely_exam_profiles"],
                "primary_exam_slug": classif["primary_exam_slug"],
                "primary_exam_id": classif["primary_exam_id"],
                "classification_confidence": classif["confidence_score"],
                "classification_status": classif["classification_status"],
                "recommended_action": action
            }
            manifest_entries.append(entry)

        # 4. Export Manifest (always generated for review)
        manifest_json, manifest_csv = ManifestBuilder.export_manifest(manifest_entries, self.output_dir)
        print(f"Processing Manifest exported to:")
        print(f"  - JSON: {manifest_json}")
        print(f"  - CSV:  {manifest_csv}\n")

        print("=== BATCH CLASSIFICATION SUMMARY ===")
        for entry in manifest_entries:
            flag = "[!]" if entry["recommended_action"] != "ready_for_generation" else "[OK]"
            line_str = (
                f"{flag} {entry['file_name']}: {entry['detected_subject']} -> {entry['primary_topic']} "
                f"({entry['classification_confidence']}% conf, Action: {entry['recommended_action']})"
            )
            try:
                print(line_str)
            except Exception:
                safe_str = line_str.encode("ascii", errors="replace").decode("ascii")
                print(safe_str)
        print("====================================\n")

        # If --manifest-only, stop here
        if manifest_only:
            print("[Manifest-Only Mode] Manifest created successfully. No Gemini API calls or CSV generation performed.")
            return {
                "manifest_json": str(manifest_json),
                "manifest_csv": str(manifest_csv),
                "total_discovered": len(discovered_paths),
                "manifest_entries": manifest_entries
            }

        # 5. Filter eligible PDFs for processing
        eligible_entries = [
            e for e in manifest_entries
            if e["recommended_action"] == "ready_for_generation"
        ]
        print(f"Eligible PDFs ready for question generation: {len(eligible_entries)} of {len(manifest_entries)}")

        # Deduplication and validator setup
        existing_hashes = self.load_existing_db_hashes()
        validator = MCQValidator(existing_hashes=existing_hashes)

        # 6. Dry Run / Generation Loop
        per_file_results: List[Dict[str, Any]] = []
        all_exported_csvs: List[str] = []
        total_accepted = 0
        total_duplicates = 0
        total_rejected = 0

        is_live = (not dry_run) and self.gemini_client.is_available()

        if is_live:
            print("\n[Privacy Notice] Extracted notes text is transmitted securely over HTTPS to the configured Google Gemini API for MCQ generation.")
            print("Original PDF files remain strictly local on your machine and are never uploaded to Supabase or third-party servers.\n")
        elif not dry_run:
            print(f"\n[Notice] Gemini API Key is {self.key_status}. Falling back to Dry-Run / Preview mode.")
            dry_run = True

        for entry in manifest_entries:
            file_path = Path(entry["absolute_path"])
            file_name = entry["file_name"]
            f_hash = entry["file_hash"]

            if entry["recommended_action"] != "ready_for_generation":
                per_file_results.append({
                    "file_name": file_name,
                    "file_hash": f_hash,
                    "subject": entry["detected_subject"],
                    "topic": entry["primary_topic"],
                    "status": f"SKIPPED ({entry['recommended_action']})",
                    "accepted_count": 0,
                    "duplicate_count": 0,
                    "rejected_count": 0,
                    "error": entry.get("ocr_warning") or f"Action: {entry['recommended_action']}"
                })
                continue

            # Process eligible file independently with error isolation
            print(f"\nProcessing [{file_name}]...")
            extract_data = extracted_map[file_path]
            classif = classification_map[file_path]

            try:
                # Determine chunking mode
                doc_mode = mode
                if doc_mode == "auto":
                    doc_mode = "merged" if extract_data["total_pages"] > 20 else "single"

                # Setup topic chunker for this document
                domain_key = classif.get("domain_key")
                domain_cfg = DOMAINS_TAXONOMY.get(domain_key) if domain_key else None

                doc_topics = []
                if domain_cfg:
                    doc_topics.append({
                        "slug": domain_cfg["topic_slug"],
                        "title": domain_cfg["topic_title"],
                        "subject": domain_cfg["subject_name"],
                        "subject_id": domain_cfg["subject_id"],
                        "exam": domain_cfg["exam_slug"],
                        "exam_id": domain_cfg["exam_id"],
                        "id": domain_cfg["syllabus_topic_id"],
                        "keywords": domain_cfg["keywords"]
                    })
                # Fallback to general topics
                if not doc_topics:
                    doc_topics = self.chunker.topics

                doc_chunker = TopicChunker(topics=doc_topics)

                if doc_mode == "merged":
                    chunks = doc_chunker.chunk_merged_pdf(extract_data)
                else:
                    chunks = doc_chunker.chunk_individual_pdf(extract_data)

                print(f"Partitioned into {len(chunks)} chunk(s).")

                if dry_run:
                    print(f"[Dry-Run] Verified chunking and schema for {file_name}. (0 API calls made).")
                    per_file_results.append({
                        "file_name": file_name,
                        "file_hash": f_hash,
                        "subject": entry["detected_subject"],
                        "topic": entry["primary_topic"],
                        "status": "PREVIEW_OK",
                        "accepted_count": 0,
                        "duplicate_count": 0,
                        "rejected_count": 0,
                        "error": ""
                    })
                    continue

                # Live Generation for this file
                file_accepted: List[Dict[str, Any]] = []
                file_dups = 0
                file_rejs = 0

                for chk in chunks:
                    print(f"Generating questions for {chk.chunk_id} ({chk.page_reference})...")
                    raw_mcqs = self.gemini_client.generate_mcqs_for_chunk(
                        chunk=chk,
                        exam_title=entry.get("likely_exam_profiles", ["Civil Service Exam"])[0],
                        target_count=batch_size,
                        difficulty="Moderate"
                    )

                    val_res = validator.validate_and_deduplicate(
                        raw_questions=raw_mcqs,
                        chunk=chk,
                        exam_id=entry.get("primary_exam_id")
                    )

                    # Second-pass AI Quality Audit for accepted questions
                    if is_live and val_res.accepted:
                        print(f"Applying second-pass AI quality audit on {len(val_res.accepted)} candidate question(s)...")
                        verdicts = self.gemini_client.review_candidate_questions(
                            candidate_questions=val_res.accepted,
                            chunk=chk,
                            exam_title=entry.get("likely_exam_profiles", ["Civil Service Exam"])[0]
                        )
                        passed_accepted = []
                        verdict_map = {v.get("index"): v for v in verdicts if isinstance(v, dict)}
                        for q_idx, candidate in enumerate(val_res.accepted):
                            verdict = verdict_map.get(q_idx)
                            if verdict and not verdict.get("approved", True):
                                reason = verdict.get("rejection_reason") or "Failed second-pass AI quality audit."
                                print(f"  [AI Audit Rejected] {candidate['question_text'][:50]}...: {reason}")
                                val_res.rejected.append({
                                    "raw_index": q_idx,
                                    "question_text": candidate["question_text"][:80],
                                    "errors": [f"AI Quality Audit: {reason}"],
                                    "raw_data": candidate
                                })
                            else:
                                passed_accepted.append(candidate)
                        val_res.accepted = passed_accepted

                    file_accepted.extend(val_res.accepted)
                    file_dups += len(val_res.duplicates)
                    file_rejs += len(val_res.rejected)

                # Export CSV for this file / topic
                if file_accepted:
                    topic_slug = domain_cfg["topic_slug"] if domain_cfg else "general"
                    csv_path = self.exporter.export_topic_csv(
                        topic_slug=topic_slug,
                        questions=file_accepted,
                        source_stem=file_path.stem,
                        overwrite=overwrite
                    )
                    all_exported_csvs.append(str(csv_path))
                    print(f"Successfully exported {len(file_accepted)} questions to {csv_path.name}")

                total_accepted += len(file_accepted)
                total_duplicates += file_dups
                total_rejected += file_rejs

                per_file_results.append({
                    "file_name": file_name,
                    "file_hash": f_hash,
                    "subject": entry["detected_subject"],
                    "topic": entry["primary_topic"],
                    "status": "COMPLETED",
                    "accepted_count": len(file_accepted),
                    "duplicate_count": file_dups,
                    "rejected_count": file_rejs,
                    "error": ""
                })

            except Exception as file_err:
                # FAILURE ISOLATION: Log error and proceed with remaining files
                print(f"[Error] Failed to process {file_name}: {file_err}", file=sys.stderr)
                per_file_results.append({
                    "file_name": file_name,
                    "file_hash": f_hash,
                    "subject": entry["detected_subject"],
                    "topic": entry["primary_topic"],
                    "status": "FAILED",
                    "accepted_count": 0,
                    "duplicate_count": 0,
                    "rejected_count": 0,
                    "error": str(file_err)
                })

        # 7. Write Batch Generation Report
        batch_report = {
            "input_directory": str(input_dir.resolve()),
            "output_directory": str(self.output_dir.resolve()),
            "mode": "dry_run" if dry_run else "live_generation",
            "summary": {
                "total_discovered_pdfs": len(discovered_paths),
                "eligible_pdfs": len(eligible_entries),
                "duplicate_pdfs": len(duplicate_map),
                "ocr_required_pdfs": sum(1 for e in manifest_entries if e["ocr_needed"]),
                "uncertain_pdfs": sum(1 for e in manifest_entries if e["classification_status"] == "NEEDS_REVIEW"),
                "total_accepted_questions": total_accepted,
                "total_duplicate_questions": total_duplicates,
                "total_rejected_questions": total_rejected
            },
            "exported_csv_files": all_exported_csvs,
            "per_file_results": per_file_results
        }
        report_json, report_csv = self.exporter.write_batch_report(batch_report)
        print(f"\nBatch Generation Report written to:")
        print(f"  - JSON: {report_json}")
        print(f"  - CSV:  {report_csv}\n")

        return batch_report

    def process_pdf(
        self,
        pdf_path: Path,
        mode: str = "auto",
        filter_topic: Optional[str] = None,
        batch_size: int = 10,
        dry_run: bool = False,
        overwrite: bool = False
    ) -> Dict[str, Any]:
        """
        Executes end-to-end processing of a single local PDF document.
        Maintains complete backwards compatibility.
        """
        print(f"\n========================================================")
        print(f"ExamSathi AI - Processing Local PDF: {pdf_path.name}")
        print(f"Exam Profile: {self.exam_config['exam_title']} ({self.exam_slug})")
        print(f"Output Directory: {self.output_dir.resolve()}")
        print(f"Gemini Key Status: {self.key_status}")
        print(f"Mode: {mode} | Dry Run: {dry_run} | Overwrite: {overwrite}")
        print(f"========================================================\n")

        # 1. Extract PDF
        extract_result = PDFExtractor.extract(pdf_path)
        if not extract_result["success"]:
            raise RuntimeError(f"Extraction failed: {extract_result.get('error')}")

        print(f"Extracted {extract_result['total_pages']} pages, {extract_result['total_chars']} characters.")
        print(f"Average characters/page: {extract_result['avg_chars_per_page']}")

        if extract_result["ocr_needed"]:
            print(f"\n[!] WARNING: {extract_result['ocr_warning']}\n")

        # 2. Topic Chunker
        if mode == "auto":
            if extract_result["total_pages"] > 20:
                mode = "merged"
            else:
                mode = "single"

        if mode == "merged":
            chunks = self.chunker.chunk_merged_pdf(extract_result, filter_topic_slug=filter_topic)
        else:
            chunks = self.chunker.chunk_individual_pdf(extract_result, forced_topic_slug=filter_topic)

        print(f"Identified {len(chunks)} topic-based chunk(s) across document.")
        for chk in chunks:
            print(f"  - [{chk.topic_info.get('slug')}] {chk.chunk_id}: {chk.page_reference} ({chk.to_dict()['word_count']} words)")

        # 3. Deduplication setup
        existing_hashes = self.load_existing_db_hashes()
        validator = MCQValidator(existing_hashes=existing_hashes)

        # 4. Generate & Validate
        grouped_accepted: Dict[str, List[Dict[str, Any]]] = {}
        all_validation_results = ValidationResult()

        if dry_run or not self.gemini_client.is_available():
            if not dry_run:
                print(f"\n[Notice] Gemini API Key is {self.key_status}. Running in Dry-Run / Preview mode.")
            else:
                print("\n[Dry-Run Mode] Skipping AI API requests. Inspecting chunks and schema.")

            report = {
                "timestamp": sys.platform,
                "file_name": extract_result["file_name"],
                "total_pages": extract_result["total_pages"],
                "total_chars": extract_result["total_chars"],
                "ocr_needed": extract_result["ocr_needed"],
                "ocr_warning": extract_result["ocr_warning"],
                "chunks_count": len(chunks),
                "chunks": [c.to_dict() for c in chunks],
                "dry_run": True,
                "gemini_status": self.key_status
            }
            report_path = self.exporter.write_generation_report(report)
            print(f"\nReport written to: {report_path}")
            return report

        # Live Gemini Generation
        print("\n[Privacy Notice] Extracted notes text is transmitted securely over HTTPS to Google Gemini API.")
        print("Original PDF remains strictly local on your machine.\n")

        for chk in chunks:
            topic_slug = chk.topic_info.get("slug", "topic")
            print(f"\nGenerating batch for topic: '{chk.topic_info.get('title')}' ({chk.page_reference})...")
            try:
                raw_mcqs = self.gemini_client.generate_mcqs_for_chunk(
                    chunk=chk,
                    exam_title=self.exam_config["exam_title"],
                    target_count=batch_size,
                    difficulty="Moderate"
                )
                print(f"Received {len(raw_mcqs)} candidate questions from Gemini.")
            except Exception as ge:
                print(f"[Error] Failed to generate for chunk {chk.chunk_id}: {ge}", file=sys.stderr)
                continue

            val_res = validator.validate_and_deduplicate(
                raw_questions=raw_mcqs,
                chunk=chk,
                exam_id=self.exam_config["exam_id"]
            )

            # Second-pass AI Quality Audit for accepted questions
            if self.gemini_client.is_available() and val_res.accepted:
                print(f"Applying second-pass AI quality audit on {len(val_res.accepted)} candidate question(s)...")
                verdicts = self.gemini_client.review_candidate_questions(
                    candidate_questions=val_res.accepted,
                    chunk=chk,
                    exam_title=self.exam_config["exam_title"]
                )
                passed_accepted = []
                verdict_map = {v.get("index"): v for v in verdicts if isinstance(v, dict)}
                for q_idx, candidate in enumerate(val_res.accepted):
                    verdict = verdict_map.get(q_idx)
                    if verdict and not verdict.get("approved", True):
                        reason = verdict.get("rejection_reason") or "Failed second-pass AI quality audit."
                        print(f"  [AI Audit Rejected] {candidate['question_text'][:50]}...: {reason}")
                        val_res.rejected.append({
                            "raw_index": q_idx,
                            "question_text": candidate["question_text"][:80],
                            "errors": [f"AI Quality Audit: {reason}"],
                            "raw_data": candidate
                        })
                    else:
                        passed_accepted.append(candidate)
                val_res.accepted = passed_accepted

            all_validation_results.accepted.extend(val_res.accepted)
            all_validation_results.duplicates.extend(val_res.duplicates)
            all_validation_results.rejected.extend(val_res.rejected)

            if topic_slug not in grouped_accepted:
                grouped_accepted[topic_slug] = []
            grouped_accepted[topic_slug].extend(val_res.accepted)

            print(f"Validation: {len(val_res.accepted)} Accepted, {len(val_res.duplicates)} Duplicates, {len(val_res.rejected)} Rejected.")

        # 5. Export CSV files with overwrite protection
        exported_files = []
        for slug, questions in grouped_accepted.items():
            if questions:
                csv_path = self.exporter.export_topic_csv(
                    topic_slug=slug,
                    questions=questions,
                    source_stem=pdf_path.stem,
                    overwrite=overwrite
                )
                exported_files.append(str(csv_path))
                print(f"Exported {len(questions)} questions to CSV: {csv_path.name}")

        # 6. Write final audit report
        final_report = {
            "file_name": extract_result["file_name"],
            "total_pages": extract_result["total_pages"],
            "total_chars": extract_result["total_chars"],
            "ocr_needed": extract_result["ocr_needed"],
            "ocr_warning": extract_result["ocr_warning"],
            "chunks_count": len(chunks),
            "summary": {
                "total_candidate_questions": all_validation_results.total_processed,
                "accepted_count": len(all_validation_results.accepted),
                "duplicate_count": len(all_validation_results.duplicates),
                "rejected_count": len(all_validation_results.rejected)
            },
            "exported_files": exported_files,
            "rejections": all_validation_results.rejected,
            "duplicates": all_validation_results.duplicates
        }
        report_path = self.exporter.write_generation_report(final_report)
        print(f"\nFinal Generation Report saved at: {report_path}")

        return final_report


# ==============================================================================
# 13. CLI ENTRYPOINT
# ==============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="ExamSathi AI - Local PDF-to-CSV MCQ Generator & Batch Processor"
    )
    parser.add_argument(
        "--input-dir",
        type=str,
        default=None,
        help="Path to folder containing PDF notes for recursive batch processing"
    )
    parser.add_argument(
        "--pdf",
        type=str,
        default=None,
        help="Path to a single local PDF file (individual topic or merged)"
    )
    parser.add_argument(
        "--manifest-only",
        action="store_true",
        help="Extract metrics, classify subjects, detect OCR/duplicates and create manifest without calling Gemini or exporting CSVs"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview extraction, classification, chunking, and validation checks without calling Gemini API"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Explicitly enable overwriting existing CSV output files in output directory"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="generated_mcqs",
        help="Directory to save exported CSVs, manifests, and reports (default: 'generated_mcqs')"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="Number of questions to generate per topic chunk (default: 10, range: 5-25)"
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["auto", "single", "merged"],
        default="auto",
        help="PDF processing mode (single topic vs merged multi-topic document)"
    )
    parser.add_argument(
        "--topic",
        type=str,
        default=None,
        help="Filter or force specific topic slug (e.g. 'operating_systems', 'dbms')"
    )
    parser.add_argument(
        "--exam",
        type=str,
        default="fpsc-lecturer-cs-2026",
        help="Exam slug from syllabus catalog (default: 'fpsc-lecturer-cs-2026')"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="gemini-3.5-flash-lite",
        help="Gemini model name (default: 'gemini-3.5-flash-lite')"
    )

    args = parser.parse_args()

    generator = PDFMCQGenerator(
        exam_slug=args.exam,
        output_dir=args.output_dir,
        model=args.model
    )

    # 1. Directory Batch Mode
    if args.input_dir:
        input_path = Path(args.input_dir.strip().strip('"').strip("'"))
        if not input_path.exists() or not input_path.is_dir():
            print(f"Error: Target directory does not exist or is not a directory: '{input_path}'", file=sys.stderr)
            sys.exit(1)

        try:
            generator.process_directory(
                input_dir=input_path,
                manifest_only=args.manifest_only,
                dry_run=args.dry_run,
                overwrite=args.overwrite,
                batch_size=args.batch_size,
                mode=args.mode
            )
        except Exception as err:
            print(f"\n[Fatal Batch Error] {err}", file=sys.stderr)
            sys.exit(1)
        return

    # 2. Single PDF Mode
    pdf_path_str = args.pdf
    if not pdf_path_str:
        print("\n=== ExamSathi AI: Local PDF-to-CSV MCQ Generator ===")
        print("Please enter either:")
        print("  1. A directory path containing multiple notes PDFs (e.g. C:\\Users\\noor\\Downloads\\LecturerNotes)")
        print("  2. A single PDF file path (e.g. C:\\Users\\noor\\Downloads\\OS.pdf)")
        try:
            user_input = input("Target Path: ").strip().strip('"').strip("'")
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            sys.exit(0)

        if not user_input:
            print("Error: No path provided. Run with --help for usage.", file=sys.stderr)
            sys.exit(1)

        input_target = Path(user_input)
        if input_target.is_dir():
            generator.process_directory(
                input_dir=input_target,
                manifest_only=args.manifest_only,
                dry_run=args.dry_run,
                overwrite=args.overwrite,
                batch_size=args.batch_size,
                mode=args.mode
            )
            return
        elif input_target.is_file():
            pdf_path = input_target
        else:
            print(f"Error: Path not found: '{input_target}'", file=sys.stderr)
            sys.exit(1)
    else:
        pdf_path = Path(pdf_path_str.strip().strip('"').strip("'"))
        if not pdf_path.is_file():
            print(f"Error: File not found at '{pdf_path}'. Please check the path.", file=sys.stderr)
            sys.exit(1)

    try:
        generator.process_pdf(
            pdf_path=pdf_path,
            mode=args.mode,
            filter_topic=args.topic,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            overwrite=args.overwrite
        )
    except Exception as err:
        print(f"\n[Fatal Error] {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

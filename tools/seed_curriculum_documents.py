"""
ExamSathi AI - Curriculum Sample PDF Generator
==============================================
Generates multi-page, realistic academic curriculum notes PDFs
specifically tailored for testing Stage 1 & Stage 2 RAG retrieval:
1. Exact technical terminology (Belady's Anomaly, Two-Phase Locking 2PL, BCNF)
2. Abbreviations (PCB, MMU, LRU, FIFO, ACID, FCFS, CCI, NFC)
3. Conceptual questions (Paging vs Segmentation, Deadlock conditions)
4. Varied phrasing for conceptual semantic search
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tests.test_rag_ingestion_pipeline import create_test_pdf


def generate_curriculum_pdfs():
    out_dir = Path("sample_notes")
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Operating Systems Comprehensive Notes (3 Pages)
    os_pdf = out_dir / "Operating_Systems_Curriculum_Guide.pdf"
    os_pages = [
        # Page 1: Process Management & CPU Scheduling
        (
            "Operating Systems Lecture Notes: Process Management and CPU Scheduling. "
            "A process is a program in execution containing program code, current activity, program counter, and stack. "
            "Processes transition across lifecycle states: New, Ready, Running, Waiting, and Terminated. "
            "Context switching is the low-level kernel mechanism where the operating system saves the state of an active process "
            "inside its Process Control Block (PCB) and loads the saved context of another thread. "
            "The Process Control Block (PCB) maintains process state, CPU registers, CPU scheduling priority, memory-management information, "
            "and I/O status information. Context switch time is pure computational overhead because the CPU does no useful work while switching. "
            "CPU scheduling algorithms determine process execution sequence to maximize throughput and minimize turnaround time: "
            "First-Come First-Served (FCFS) which suffers from the convoy effect; Shortest Job First (SJF) which is provably optimal for minimizing average waiting time; "
            "Round Robin (RR) with predefined time slice quantum for preemptive multitasking; and Multi-Level Feedback Queue (MLFQ) scheduling. "
        ) * 2,

        # Page 2: Virtual Memory, Paging Architecture & Belady's Anomaly
        (
            "Virtual Memory and Paging Architecture. "
            "Virtual memory separates user logical memory from physical physical RAM, allowing execution of processes that require more memory than physically installed. "
            "Logical address spaces are partitioned into fixed-sized blocks called pages, while physical memory is divided into blocks of identical size termed frames. "
            "The hardware Memory Management Unit (MMU) dynamically translates logical page numbers into physical frame numbers through a dedicated page table structure. "
            "A page fault occurs when a process attempts to access a memory page marked invalid in the page table, triggering an operating system trap to fetch the page from secondary disk storage into RAM. "
            "Page replacement algorithms determine which victim page to evict when all physical frames are occupied: "
            "The Optimal page replacement algorithm (OPT) replaces the page that will not be used for the longest period of time; "
            "Least Recently Used (LRU) replaces the page that has not been used for the longest period of time using counters or stacks; "
            "and First-In First-Out (FIFO) which can exhibit Belady's Anomaly where increasing the number of allocated physical frames results in an increased number of page faults. "
            "Thrashing describes a catastrophic high-paging state where the system spends significantly more time moving pages in and out of swap disk than executing user instructions."
        ) * 2,

        # Page 3: Deadlocks, Coffman Conditions & Synchronization
        (
            "Concurrency, Synchronization and Deadlock Characterization. "
            "A deadlock is a permanent stall condition where a set of concurrent processes are blocked because each process holds a resource and waits for another resource held by another process. "
            "According to Coffman conditions, four conditions must hold simultaneously for a deadlock to arise: "
            "1. Mutual Exclusion: At least one resource must be held in a non-shareable mode; "
            "2. Hold and Wait: A process must hold at least one resource while waiting to acquire additional resources held by other processes; "
            "3. No Preemption: Resources cannot be forcibly taken away from a process until the process voluntarily releases them; "
            "4. Circular Wait: A closed chain of processes exists where each process waits for a resource held by the next process in the cycle. "
            "Deadlock handling strategies include deadlock prevention by invalidating at least one Coffman condition; "
            "deadlock avoidance via Dijkstra's Banker's Algorithm which evaluates safe states and unsafe resource allocation trajectories; "
            "and deadlock detection with recovery via process termination or resource preemption. "
            "Process synchronization primitives include binary Semaphores and Mutexes to protect critical sections against race conditions."
        ) * 2,
    ]
    create_test_pdf(os_pages, os_pdf)
    print(f"[OK] Generated: {os_pdf}")

    # 2. Database Systems Comprehensive Notes (3 Pages)
    db_pdf = out_dir / "Database_Systems_Curriculum_Guide.pdf"
    db_pages = [
        # Page 1: Relational Schema & Normalization up to BCNF
        (
            "Database Management Systems: Relational Schema Design and Normalization Theory. "
            "Relational database design organizes structured data into tables consisting of tuples and attributes to minimize redundancy and eliminate insertion, update, and deletion anomalies. "
            "A functional dependency X -> Y states that if two tuples agree on attribute set X, they must also agree on attribute set Y. "
            "Normalization progressively decomposes relations based on functional dependencies: "
            "First Normal Form (1NF) requires all attribute domains to be atomic, disallowing repeating groups or multi-valued attributes; "
            "Second Normal Form (2NF) enforces 1NF and requires that all non-prime attributes are fully functionally dependent on the entire primary key, eliminating partial functional dependencies; "
            "Third Normal Form (3NF) requires 2NF and prohibits transitive functional dependencies where a non-prime attribute determines another non-prime attribute; "
            "Boyce-Codd Normal Form (BCNF) is a stricter variant of 3NF requiring that for every non-trivial functional dependency X -> Y, X must be a superkey. "
            "Every BCNF schema guarantees absence of redundancy from functional dependencies and supports lossless join decomposition."
        ) * 2,

        # Page 2: Transactions, ACID Properties & Concurrency Control
        (
            "Transaction Processing, ACID Properties and Concurrency Control Protocols. "
            "A database transaction is a logical unit of work that accesses and modifies data items. "
            "Transactions must guarantee four fundamental ACID properties: "
            "Atomicity ensures all transaction operations succeed completely or the transaction is fully rolled back to its initial state; "
            "Consistency guarantees that transaction execution preserves database integrity constraints from one valid state to another; "
            "Isolation ensures concurrent transactions execute without interfering with one another, appearing as if executed serially; "
            "Durability guarantees that once a transaction commits, its updates persist permanently in secondary storage even during system crashes. "
            "Concurrency control protocols preserve conflict serializability in multi-user environments: "
            "Two-Phase Locking (2PL) governs locking through a growing phase where locks are acquired and a shrinking phase where locks are released without acquiring new ones; "
            "Strict Two-Phase Locking (Strict 2PL) holds all exclusive locks until transaction commit or abort to prevent cascading rollbacks."
        ) * 2,

        # Page 3: Indexing, B-Trees and Query Optimization
        (
            "Database Indexing Structures and Physical Storage Management. "
            "Indexes provide fast associative access to database tuples without requiring exhaustive linear table scans. "
            "B-Trees and B+ Trees represent balanced multi-way search tree data structures designed for block-oriented disk storage. "
            "In a B+ Tree, internal routing nodes contain only search keys and child page pointers, while all actual data record pointers or records reside exclusively in leaf nodes. "
            "Leaf nodes in a B+ Tree are linked sequentially in a doubly-linked list, enabling exceptionally high performance for range queries and sequential scans. "
            "Clustered indexes dictate the physical sorting order of rows on disk storage, meaning a table can possess only one clustered index, whereas multiple non-clustered secondary indexes can be created with pointers back to clustered table rows."
        ) * 2,
    ]
    create_test_pdf(db_pages, db_pdf)
    print(f"[OK] Generated: {db_pdf}")

    # 3. Pakistan Affairs & 1973 Constitution (3 Pages)
    pa_pdf = out_dir / "Pakistan_Affairs_1973_Constitution.pdf"
    pa_pages = [
        # Page 1: Constitutional History and Adoption of 1973 Constitution
        (
            "Pakistan Affairs: Constitutional History and Framework of the 1973 Constitution. "
            "The constitutional evolution of Pakistan originated from the Government of India Act 1935 as modified by the Pakistan Provisional Constitution Order 1947. "
            "The initial constituent assemblies promulgated the 1956 Constitution (establishing an Islamic Republic with a unicameral legislature) and the 1962 Constitution (establishing a presidential system). "
            "The Constitution of the Islamic Republic of Pakistan 1973 was drafted by a representative parliamentary committee headed by Abdul Hafeez Pirzada and unanimously adopted on April 10, 1973, taking effect on August 14, 1973. "
            "The 1973 Constitution established a federal parliamentary system with an executive Prime Minister responsible to the legislature and a ceremonial constitutional President as Head of State. "
            "The federal parliament (Majlis-e-Shoora) is bicameral, comprising the National Assembly representing population distribution and the Senate providing equal representation to all federating provinces."
        ) * 2,

        # Page 2: Fundamental Rights & Islamic Provisions
        (
            "Fundamental Rights and Islamic Character under the 1973 Constitution. "
            "Part II Chapter 1 (Articles 8 through 28) guarantees enforceable Fundamental Rights to all citizens: "
            "Article 9 protects security of person; Article 10 provides safeguards as to arrest and detention; Article 10A guarantees the right to a fair trial and due process; "
            "Article 14 establishes the inviolability of dignity of man; Article 19 protects freedom of speech and expression; "
            "Article 19A guarantees the right to information; and Article 25 ensures equality of all citizens before the law without gender discrimination. "
            "Any law inconsistent with or in derogation of Fundamental Rights is void ab initio under Article 8. "
            "The Islamic provisions declare Islam as the state religion (Article 2), mandate that all existing laws be brought into conformity with the Injunctions of Islam (Article 227), "
            "and establish the Council of Islamic Ideology (CII) and Federal Shariat Court to examine statutory legislation."
        ) * 2,

        # Page 3: Federal Structure, CCI, NFC and 18th Amendment
        (
            "Inter-Provincial Coordination, Financial Distribution and the 18th Constitutional Amendment. "
            "The 1973 Constitution created constitutional institutions to harmonize federal-provincial relations and safeguard provincial autonomy. "
            "The Council of Common Interests (CCI), established under Article 153 and headed by the Prime Minister alongside provincial Chief Ministers, formulates policies regarding natural resources, electricity, water, and federal institutions. "
            "The National Finance Commission (NFC) Award, governed by Article 160, distributes financial revenues between the federal center and the four federating provinces from the divisible revenue pool based on population, poverty, revenue generation, and inverse population density. "
            "The historic 18th Constitutional Amendment enacted in April 2010 abolished the Concurrent Legislative List, devolving seventeen federal ministries including education, healthcare, and agriculture directly to the provinces, enhancing provincial legislative autonomy and fiscal decentralization."
        ) * 2,
    ]
    create_test_pdf(pa_pages, pa_pdf)
    print(f"[OK] Generated: {pa_pdf}")


if __name__ == "__main__":
    generate_curriculum_pdfs()

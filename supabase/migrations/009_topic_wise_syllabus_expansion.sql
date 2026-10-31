-- ====================================================================
-- ExamSathi AI — Stage 2 Database Schema Migration
-- Migration 009: Topic-Wise Syllabus Hierarchy & Granular Question Mapping
-- Description: Adds granular syllabus topics for the 4 target exam profiles
--              (CS Lecturer, Computer Programmer, FIA AD, Customs Inspector),
--              maps existing questions to their topics, removes temporary test items,
--              and provides get_exam_syllabus_breakdown RPC for topic-level practice.
-- ====================================================================

-- 1. Remove temporary automated review test items to restore pristine 84-question baseline
DELETE FROM public.questions
WHERE question_text ILIKE 'Review Workflow Test%'
   OR question_text ILIKE 'Idempotent Test Question%'
   OR question_text ILIKE 'Test Stage 1 Automated Ingestion%';

-- 2. Admin Question Delete RPC (for test cleanup and administrative maintenance)
CREATE OR REPLACE FUNCTION public.admin_delete_question(
  p_question_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
BEGIN
  DELETE FROM public.questions WHERE id = p_question_id;
  RETURN jsonb_build_object('success', true, 'question_id', p_question_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_question(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_question(UUID) TO anon, authenticated;

-- 3. Granular Syllabus Topics for CS Lecturer (BS-17)
INSERT INTO public.syllabus_topics (id, exam_id, subject_id, section_title, topic_title, description, source_title, verification_status, display_order)
VALUES
  (
    'd1000000-0000-0005-0000-000000000001',
    'e1000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Professional Computer Science (80 Marks)',
    'Operating Systems: Deadlocks, Virtual Memory & Concurrency',
    'Coffman deadlock conditions, page replacement algorithms, process scheduling, virtual memory thrashing, and concurrency anomalies.',
    'Official FPSC Computer Science Scheme',
    'reviewed_syllabus',
    1
  ),
  (
    'd1000000-0000-0005-0000-000000000002',
    'e1000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Professional Computer Science (80 Marks)',
    'Database Systems: Normalization, BCNF & ACID Transactions',
    'Relational database design, Boyce-Codd Normal Form, functional dependencies, SQL integrity constraints, and transaction durability.',
    'Official FPSC Computer Science Scheme',
    'reviewed_syllabus',
    2
  ),
  (
    'd1000000-0000-0005-0000-000000000003',
    'e1000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Professional Computer Science (80 Marks)',
    'Data Structures & Algorithms: Trees, Graphs & Complexity',
    'QuickSort worst-case analysis, AVL tree self-balancing, Dijkstra shortest path, comparison sorting lower bounds, and asymptotic notations.',
    'Official FPSC Computer Science Scheme',
    'reviewed_syllabus',
    3
  ),
  (
    'd1000000-0000-0005-0000-000000000004',
    'e1000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Professional Computer Science (80 Marks)',
    'Computer Architecture, Networks & Formal Languages',
    'Processor instruction pipelining, compiler parsing phases, OSI transport layer, IPv4 subnetting, and Deterministic Finite Automata.',
    'Official FPSC Computer Science Scheme',
    'reviewed_syllabus',
    4
  ),
  (
    'd1000000-0000-0005-0000-000000000005',
    'e1000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Professional Computer Science (80 Marks)',
    'Software Engineering & Teaching Methodology',
    'SOLID object-oriented design, unit testing isolation with mocks, and Bloom Revised Taxonomy for higher education instruction.',
    'Official FPSC Computer Science Scheme',
    'reviewed_syllabus',
    5
  ),
  (
    'd1000000-0000-0005-0000-000000000006',
    'e1000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000003',
    'Part-I: English (20 Marks)',
    'English Grammar, Syntax & Vocabulary',
    'Grammatical sentence syntax, participial phrases, vocabulary, and contextual usage for academic lecturers.',
    'Official FPSC Scheme',
    'reviewed_syllabus',
    6
  )
ON CONFLICT (id) DO UPDATE SET
  topic_title = EXCLUDED.topic_title,
  section_title = EXCLUDED.section_title,
  description = EXCLUDED.description;

-- 4. Granular Syllabus Topics for Computer Programmer (BS-17)
INSERT INTO public.syllabus_topics (id, exam_id, subject_id, section_title, topic_title, description, source_title, verification_status, display_order)
VALUES
  (
    'd1000000-0000-0006-0000-000000000001',
    'e1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Technical & Programming (80 Marks)',
    'Object-Oriented Design & GoF Patterns',
    'Gang of Four design patterns (Singleton, Factory, Observer), composition vs inheritance, and class lifecycle relationships.',
    'Official FPSC Computer Programmer Scheme',
    'reviewed_syllabus',
    1
  ),
  (
    'd1000000-0000-0006-0000-000000000002',
    'e1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Technical & Programming (80 Marks)',
    'Relational Databases & SQL Optimization',
    'Clustered vs nonclustered indexing, hash join vs nested loop algorithms, query optimization, and referential integrity.',
    'Official FPSC Computer Programmer Scheme',
    'reviewed_syllabus',
    2
  ),
  (
    'd1000000-0000-0006-0000-000000000003',
    'e1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Technical & Programming (80 Marks)',
    'Web Architecture, REST APIs & OWASP Security',
    'Idempotent HTTP methods (PUT vs POST), Same-Origin Policy (SOP), SQL Injection prevention via prepared statements, and status codes.',
    'Official FPSC Computer Programmer Scheme',
    'reviewed_syllabus',
    3
  ),
  (
    'd1000000-0000-0006-0000-000000000004',
    'e1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Technical & Programming (80 Marks)',
    'Data Structures, Algorithms & Binary Systems',
    'Hash Table lookup complexity, recursive Depth-First Search space bounds, and decimal to binary number conversions.',
    'Official FPSC Computer Programmer Scheme',
    'reviewed_syllabus',
    4
  ),
  (
    'd1000000-0000-0006-0000-000000000005',
    'e1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Technical & Programming (80 Marks)',
    'DevOps, Containerization & Agile Scrum',
    'Linux cgroups container isolation, Git rebase vs merge, automated smoke testing in CI/CD pipelines, and Scrum sprint planning.',
    'Official FPSC Computer Programmer Scheme',
    'reviewed_syllabus',
    5
  ),
  (
    'd1000000-0000-0006-0000-000000000006',
    'e1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Technical & Programming (80 Marks)',
    'Networking Protocols & System Contracts',
    'TCP 3-way handshake (SYN, SYN-ACK, ACK), Service Level Agreements (SLA), and microservices API Gateway architecture.',
    'Official FPSC Computer Programmer Scheme',
    'reviewed_syllabus',
    6
  ),
  (
    'd1000000-0000-0006-0000-000000000007',
    'e1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000003',
    'Part-I: English (20 Marks)',
    'Technical English & Spellings',
    'Professional spelling accuracy, technical vocabulary, and formal documentation grammar.',
    'Official FPSC Scheme',
    'reviewed_syllabus',
    7
  )
ON CONFLICT (id) DO UPDATE SET
  topic_title = EXCLUDED.topic_title,
  section_title = EXCLUDED.section_title,
  description = EXCLUDED.description;

-- 5. Granular Syllabus Topics for Assistant Director FIA (BS-17)
INSERT INTO public.syllabus_topics (id, exam_id, subject_id, section_title, topic_title, description, source_title, verification_status, display_order)
VALUES
  (
    'd1000000-0000-0003-0000-000000000001',
    'e1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001',
    'Part-II: Professional Investigation (80 Marks)',
    'FIA Act 1974: Structure, Powers & Jurisdiction',
    'Constitution of agency Section 3, superintendence Section 4, police officer powers Section 5, arrest powers Section 5A, and schedule of offenses.',
    'Federal Investigation Agency Act, 1974',
    'reviewed_syllabus',
    1
  ),
  (
    'd1000000-0000-0003-0000-000000000002',
    'e1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Professional Investigation (80 Marks)',
    'Cybercrime & PECA 2016 Mandates',
    'Prevention of Electronic Crimes Act (PECA) 2016 provisions, unauthorized access, cyber-terrorism, electronic evidence, and FIA Cyber Crime Wing.',
    'PECA Act, 2016',
    'reviewed_syllabus',
    2
  ),
  (
    'd1000000-0000-0003-0000-000000000003',
    'e1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001',
    'Part-II: General Intelligence & Law (80 Marks)',
    'Pakistan Affairs & 1973 Constitution',
    'Constitutional history, Fundamental Rights (Articles 8-28), writ jurisdiction, and administrative governance framework.',
    'Constitution of Pakistan, 1973',
    'reviewed_syllabus',
    3
  ),
  (
    'd1000000-0000-0003-0000-000000000004',
    'e1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000003',
    'Part-I: English (20 Marks)',
    'English Grammar, Synonyms & Prepositions',
    'Preposition usage, sentence correction, synonyms, antonyms, and syntax structure.',
    'Official FPSC Scheme',
    'reviewed_syllabus',
    4
  ),
  (
    'd1000000-0000-0003-0000-000000000005',
    'e1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000006',
    'Part-II: General Intelligence (80 Marks)',
    'Basic Arithmetic & Quantitative Ability',
    'Percentages, ratios, arithmetic progression, algebra basics, and speed-time-distance calculations.',
    'Official FPSC Scheme',
    'reviewed_syllabus',
    5
  ),
  (
    'd1000000-0000-0003-0000-000000000006',
    'e1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000005',
    'Part-II: General Intelligence (80 Marks)',
    'Everyday Science & General Knowledge',
    'Atmospheric layers, environmental sciences, units of physical quantities, and world geography.',
    'Official FPSC Scheme',
    'reviewed_syllabus',
    6
  )
ON CONFLICT (id) DO UPDATE SET
  topic_title = EXCLUDED.topic_title,
  section_title = EXCLUDED.section_title,
  description = EXCLUDED.description;

-- 6. Granular Syllabus Topics for Inspector Customs / Intelligence Officer (BS-16)
INSERT INTO public.syllabus_topics (id, exam_id, subject_id, section_title, topic_title, description, source_title, verification_status, display_order)
VALUES
  (
    'd1000000-0000-0001-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'Part-II: Professional (80 Marks)',
    'Customs Act 1969: Search, Seizure & Arrest Powers',
    'Powers of customs officers Sections 158-161, seizure of goods Section 168, confiscation notice Section 171, and adjudication thresholds Section 179.',
    'Customs Act, 1969 (Act IV of 1969)',
    'reviewed_syllabus',
    1
  ),
  (
    'd1000000-0000-0001-0000-000000000002',
    'e1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'Part-II: Professional (80 Marks)',
    'Customs Valuation & Electronic Clearance (WeBOC)',
    'Transaction value assessment Section 25, misdeclaration fraud Section 32, WeBOC system, and bonded warehousing regulations.',
    'Customs Act, 1969 & FBR Regulations',
    'reviewed_syllabus',
    2
  ),
  (
    'd1000000-0000-0001-0000-000000000003',
    'e1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'Part-II: General Intelligence (80 Marks)',
    'Pakistan Affairs & Constitutional History',
    'Constitutional developments, 1973 Constitution fundamentals, geography, trade corridors, and demography.',
    'Official FPSC Scheme',
    'reviewed_syllabus',
    3
  ),
  (
    'd1000000-0000-0001-0000-000000000004',
    'e1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000003',
    'Part-I: English (20 Marks)',
    'English Grammar, Prepositions & Vocabulary',
    'Preposition rules (absolve from, comply with), sentence structuring, grammar syntax, and vocabulary antonyms/synonyms.',
    'Official FPSC Scheme',
    'reviewed_syllabus',
    4
  ),
  (
    'd1000000-0000-0001-0000-000000000005',
    'e1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000005',
    'Part-II: General Intelligence (80 Marks)',
    'Everyday Science & Environmental Physics',
    'Atmospheric gases (Nitrogen, Oxygen), ozone layer, SI units, renewable energy, and biological systems.',
    'Official FPSC Scheme',
    'reviewed_syllabus',
    5
  ),
  (
    'd1000000-0000-0001-0000-000000000006',
    'e1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000006',
    'Part-II: General Intelligence (80 Marks)',
    'Basic Arithmetic & Quantitative Problem Solving',
    'Percentage increases/decreases, expenditure neutrality, ratios, averages, and basic algebra.',
    'Official FPSC Scheme',
    'reviewed_syllabus',
    6
  ),
  (
    'd1000000-0000-0001-0000-000000000007',
    'e1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    'Part-II: General Intelligence (80 Marks)',
    'Islamic Studies & Current Events',
    'Compilation of the Holy Quran, Treaty of Hudaybiyyah, early Caliphate history, and key national affairs.',
    'Official FPSC Scheme',
    'reviewed_syllabus',
    7
  )
ON CONFLICT (id) DO UPDATE SET
  topic_title = EXCLUDED.topic_title,
  section_title = EXCLUDED.section_title,
  description = EXCLUDED.description;

-- 7. Map CS Lecturer Questions to Granular Topics
-- Operating Systems
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0005-0000-000000000001'
WHERE id IN (
  'f1000000-0000-0000-0003-000000000002', -- Coffman conditions
  'f1000000-0000-0000-0003-000000000010', -- Thrashing
  'f1000000-0000-0000-0003-000000000019'  -- Race conditions & context switch
);

-- Database Systems
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0005-0000-000000000002'
WHERE id IN (
  'f1000000-0000-0000-0003-000000000003', -- BCNF
  'f1000000-0000-0000-0003-000000000011', -- SQL constraint unique & not null
  'f1000000-0000-0000-0003-000000000018'  -- Durability ACID
);

-- Data Structures & Algorithms
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0005-0000-000000000003'
WHERE id IN (
  'f1000000-0000-0000-0003-000000000001', -- QuickSort worst case
  'f1000000-0000-0000-0003-000000000005', -- AVL Tree
  'f1000000-0000-0000-0003-000000000008', -- Dijkstra algorithm
  'f1000000-0000-0000-0003-000000000014', -- Asymptotic Theta notation
  'f1000000-0000-0000-0003-000000000020'  -- Comparison sort lower bound
);

-- Computer Architecture, Networks & Automata
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0005-0000-000000000004'
WHERE id IN (
  'f1000000-0000-0000-0003-000000000004', -- OSI transport layer
  'f1000000-0000-0000-0003-000000000006', -- Compiler parsing
  'f1000000-0000-0000-0003-000000000007', -- Pipelining
  'f1000000-0000-0000-0003-000000000013', -- Class B subnet mask
  'f1000000-0000-0000-0003-000000000015'  -- DFA regular language
);

-- Software Engineering & Pedagogy
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0005-0000-000000000005'
WHERE id IN (
  'f1000000-0000-0000-0003-000000000009', -- Liskov substitution
  'f1000000-0000-0000-0003-000000000012', -- Unit testing
  'f1000000-0000-0000-0003-000000000016'  -- Bloom's taxonomy
);

-- English
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0005-0000-000000000006'
WHERE id IN (
  'f1000000-0000-0000-0003-000000000017'  -- Participial phrase
);

-- 8. Map Computer Programmer Questions to Granular Topics
-- OOP & Design Patterns
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0006-0000-000000000001'
WHERE id IN (
  'f1000000-0000-0000-0004-000000000002', -- Singleton pattern
  'f1000000-0000-0000-0004-000000000014'  -- Composition lifecycle
);

-- Relational Databases & SQL
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0006-0000-000000000002'
WHERE id IN (
  'f1000000-0000-0000-0004-000000000001', -- Clustered vs nonclustered
  'f1000000-0000-0000-0004-000000000007'  -- Hash join algorithm
);

-- Web Security & REST APIs
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0006-0000-000000000003'
WHERE id IN (
  'f1000000-0000-0000-0004-000000000003', -- Idempotent PUT
  'f1000000-0000-0000-0004-000000000004', -- Parameterized queries SQLi
  'f1000000-0000-0000-0004-000000000008', -- Same-Origin Policy
  'f1000000-0000-0000-0004-000000000012'  -- HTTP 201 Created
);

-- Algorithms & Data Structures
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0006-0000-000000000004'
WHERE id IN (
  'f1000000-0000-0000-0004-000000000005', -- Hash Table O(1)
  'f1000000-0000-0000-0004-000000000015', -- Recursive DFS space O(H)
  'f1000000-0000-0000-0004-000000000019'  -- Decimal 156 to binary
);

-- DevOps, Git & Agile
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0006-0000-000000000005'
WHERE id IN (
  'f1000000-0000-0000-0004-000000000006', -- Git rebase
  'f1000000-0000-0000-0004-000000000009', -- Scrum sprint duration
  'f1000000-0000-0000-0004-000000000010', -- Node.js event loop
  'f1000000-0000-0000-0004-000000000013', -- Linux cgroups
  'f1000000-0000-0000-0004-000000000017'  -- Smoke testing
);

-- Networking & System Contracts
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0006-0000-000000000006'
WHERE id IN (
  'f1000000-0000-0000-0004-000000000011', -- API gateway pattern
  'f1000000-0000-0000-0004-000000000018', -- TCP SYN handshake
  'f1000000-0000-0000-0004-000000000020'  -- SLA
);

-- English
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0006-0000-000000000007'
WHERE id IN (
  'f1000000-0000-0000-0004-000000000016'  -- Spellings
);

-- 9. Map FIA AD Questions to Granular Topics
-- FIA Law Sections 1-10
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0003-0000-000000000001'
WHERE id IN (
  'f1000000-0000-0000-0001-000000000001', -- Section 3
  'f1000000-0000-0000-0001-000000000002', -- Section 4
  'f1000000-0000-0000-0001-000000000003', -- Section 5
  'f1000000-0000-0000-0001-000000000004', -- Section 5A
  'f1000000-0000-0000-0001-000000000005'  -- Section 6
);

-- Cybercrime & PECA 2016
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0003-0000-000000000002'
WHERE id IN (
  'f1000000-0000-0000-0001-000000000006', -- PECA Sec 3
  'f1000000-0000-0000-0001-000000000007', -- PECA Sec 10
  'f1000000-0000-0000-0001-000000000008', -- PECA Sec 11
  'f1000000-0000-0000-0001-000000000009', -- PECA Sec 32
  'f1000000-0000-0000-0001-000000000010'  -- Electronic evidence
);

-- English
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0003-0000-000000000004'
WHERE id IN (
  'f1000000-0000-0000-0001-000000000011',
  'f1000000-0000-0000-0001-000000000012',
  'f1000000-0000-0000-0001-000000000013',
  'f1000000-0000-0000-0001-000000000014'
);

-- Mathematics
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0003-0000-000000000005'
WHERE id IN (
  'f1000000-0000-0000-0001-000000000015',
  'f1000000-0000-0000-0001-000000000016',
  'f1000000-0000-0000-0001-000000000017'
);

-- General Knowledge / Science / Islamiyat
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0003-0000-000000000006'
WHERE id IN (
  'f1000000-0000-0000-0001-000000000018',
  'f1000000-0000-0000-0001-000000000019',
  'f1000000-0000-0000-0001-000000000020'
);

-- 10. Map Customs Questions to Granular Topics
-- Customs Act 1969 Sections 158-171
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0001-0000-000000000001'
WHERE id IN (
  'f1000000-0000-0000-0002-000000000001',
  'f1000000-0000-0000-0002-000000000002',
  'f1000000-0000-0000-0002-000000000003',
  'f1000000-0000-0000-0002-000000000004',
  'f1000000-0000-0000-0002-000000000005'
);

-- Valuation & WeBOC
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0001-0000-000000000002'
WHERE id IN (
  'f1000000-0000-0000-0002-000000000006',
  'f1000000-0000-0000-0002-000000000007',
  'f1000000-0000-0000-0002-000000000008',
  'f1000000-0000-0000-0002-000000000009',
  'f1000000-0000-0000-0002-000000000010'
);

-- English
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0001-0000-000000000004'
WHERE id IN (
  'f1000000-0000-0000-0000-000000000004',
  'f1000000-0000-0000-0002-000000000011',
  'f1000000-0000-0000-0002-000000000012',
  'f1000000-0000-0000-0002-000000000013',
  'f1000000-0000-0000-0002-000000000014'
);

-- Everyday Science
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0001-0000-000000000005'
WHERE id IN (
  'f1000000-0000-0000-0002-000000000015',
  'f1000000-0000-0000-0002-000000000016',
  'f1000000-0000-0000-0002-000000000017',
  'f1000000-0000-0000-0002-000000000020'
);

-- Mathematics
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0001-0000-000000000006'
WHERE id IN (
  'f1000000-0000-0000-0002-000000000018',
  'f1000000-0000-0000-0002-000000000019'
);

-- Islamic Studies & Constitution (Seed items)
UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0001-0000-000000000003'
WHERE id = 'f1000000-0000-0000-0000-000000000001'; -- Objective Resolution

UPDATE public.questions
SET syllabus_topic_id = 'd1000000-0000-0001-0000-000000000007'
WHERE id IN (
  'f1000000-0000-0000-0000-000000000002', -- Treaty of Hudaybiyyah
  'f1000000-0000-0000-0000-000000000003'  -- 6 AH
);

-- 11. RPC: Retrieve Exam Syllabus Hierarchy with Real Question Counts
CREATE OR REPLACE FUNCTION public.get_exam_syllabus_breakdown(
  p_exam_slug TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_exam RECORD;
  v_result JSONB;
BEGIN
  -- Validate exam existence
  SELECT id, title, slug, department, scale, format, negative_marking, description
  INTO v_exam
  FROM public.exams
  WHERE slug = p_exam_slug AND is_published = true;

  IF v_exam.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', format('Exam profile "%s" not found', p_exam_slug));
  END IF;

  -- Build structured syllabus hierarchy grouped by subject and section
  SELECT jsonb_build_object(
    'success', true,
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'title', v_exam.title,
      'slug', v_exam.slug,
      'department', v_exam.department,
      'scale', v_exam.scale,
      'format', v_exam.format,
      'negative_marking', v_exam.negative_marking,
      'description', v_exam.description
    ),
    'sections', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'section_title', sec.section_title,
          'subject_name', sec.subject_name,
          'subject_slug', sec.subject_slug,
          'topics', sec.topics
        ) ORDER BY sec.min_display_order
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM (
    SELECT
      t.section_title,
      s.name as subject_name,
      s.slug as subject_slug,
      min(t.display_order) as min_display_order,
      jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'topic_title', t.topic_title,
          'description', t.description,
          'source_title', t.source_title,
          'display_order', t.display_order,
          'question_count', (
            SELECT count(*)
            FROM public.questions q
            WHERE q.syllabus_topic_id = t.id
              AND q.is_published = true
          ),
          'easy_count', (
            SELECT count(*)
            FROM public.questions q
            WHERE q.syllabus_topic_id = t.id
              AND q.difficulty = 'Easy'
              AND q.is_published = true
          ),
          'moderate_count', (
            SELECT count(*)
            FROM public.questions q
            WHERE q.syllabus_topic_id = t.id
              AND q.difficulty = 'Moderate'
              AND q.is_published = true
          ),
          'advanced_count', (
            SELECT count(*)
            FROM public.questions q
            WHERE q.syllabus_topic_id = t.id
              AND q.difficulty = 'Advanced'
              AND q.is_published = true
          )
        ) ORDER BY t.display_order
      ) as topics
    FROM public.syllabus_topics t
    JOIN public.subjects s ON s.id = t.subject_id
    WHERE t.exam_id = v_exam.id
    GROUP BY t.section_title, s.name, s.slug
  ) sec;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_exam_syllabus_breakdown(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_syllabus_breakdown(TEXT) TO anon, authenticated;

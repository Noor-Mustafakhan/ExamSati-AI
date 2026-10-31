-- ====================================================================
-- ExamSathi AI — Stage 2 Database Seed Script
-- File: 004_seed_demo_data.sql
-- Description: Inserts verified sample commissions, exams, syllabus topics,
--              subjects, sample questions, and protected answer keys.
-- ====================================================================

-- 1. Commissions (Real Pakistani Testing Agencies)
INSERT INTO public.commissions (id, code, name, slug, province, description, is_active)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'FPSC', 'Federal Public Service Commission', 'fpsc', 'Federal (Islamabad)', 'Conducts recruitment for CSS and BS-16 to BS-22 Federal ministries and departments.', true),
  ('c1000000-0000-0000-0000-000000000002', 'PPSC', 'Punjab Public Service Commission', 'ppsc', 'Punjab (Lahore)', 'Premier recruitment body for PMS, Tehsildar, Sub-Inspectors, and Punjab provincial administrative posts.', true),
  ('c1000000-0000-0000-0000-000000000003', 'KPPSC', 'Khyber Pakhtunkhwa Public Service Commission', 'kppsc', 'Khyber Pakhtunkhwa (Peshawar)', 'Recruitment for PMS KP, Assistant Commissioners, and provincial departments.', true),
  ('c1000000-0000-0000-0000-000000000004', 'SPSC', 'Sindh Public Service Commission', 'spsc', 'Sindh (Hyderabad / Karachi)', 'Recruitment for CCE Sindh, Town Officers, and Sindh civil posts.', true),
  ('c1000000-0000-0000-0000-000000000005', 'BPSC', 'Balochistan Public Service Commission', 'bpsc', 'Balochistan (Quetta)', 'Recruitment for Balochistan Civil Service (BCS) and departmental posts.', true),
  ('c1000000-0000-0000-0000-000000000006', 'AJKPSC', 'AJK Public Service Commission', 'ajkpsc', 'Azad Jammu & Kashmir (Muzaffarabad)', 'Recruits for AJK Administrative Service and provincial departments.', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Subjects
INSERT INTO public.subjects (id, name, slug, description, display_order)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Pakistan Affairs', 'pakistan-affairs', 'Constitutional history, 1973 Constitution, political events, and geography.', 1),
  ('a1000000-0000-0000-0000-000000000002', 'Islamic Studies', 'islamic-studies', 'Quranic knowledge, Seerah of the Holy Prophet, Islamic jurisprudence, and Islamic history.', 2),
  ('a1000000-0000-0000-0000-000000000003', 'English & Grammar', 'english-grammar', 'Vocabulary, idioms, sentence structuring, syntax, and preposition rules.', 3),
  ('a1000000-0000-0000-0000-000000000004', 'Current Affairs', 'current-affairs', 'National and global political, economic, and regional developments over the past two years.', 4),
  ('a1000000-0000-0000-0000-000000000005', 'Everyday Science', 'everyday-science', 'Basic Physics, Chemistry, Biology, Environmental Sciences, and basic IT concepts.', 5),
  ('a1000000-0000-0000-0000-000000000006', 'Basic Mathematics', 'basic-mathematics', 'Arithmetic, percentages, ratios, algebra, speed-time-distance, and basic geometry.', 6)
ON CONFLICT (name) DO NOTHING;

-- 3. Exams (Sample Outlines)
INSERT INTO public.exams (id, commission_id, title, slug, department, category, scale, format, negative_marking, description, content_status, is_published)
VALUES
  (
    'e1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'Inspector Customs / Intelligence Officer (BS-16)',
    'fpsc-inspector-customs-2026',
    'Federal Board of Revenue (FBR)',
    'General Recruitment',
    'BS-16',
    'One-Paper MCQ Screening (100 Marks / 100 Minutes)',
    '0.25 marks penalty per incorrect attempt',
    'Recruitment examination for Field Intelligence Officers and Customs Inspectors under Revenue Division, Government of Pakistan.',
    'sample_outline',
    true
  ),
  (
    'e1000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000002',
    'Tehsildar / Naib Tehsildar (BS-16)',
    'ppsc-tehsildar-2026',
    'Punjab Revenue Department',
    'Revenue & Administration',
    'BS-16',
    'Two Written MCQ Papers (Paper 1: English & Urdu, Paper 2: Revenue Laws & GK)',
    '0.25 marks penalty per incorrect attempt',
    'Executive land administration and revenue judicial officer posts under Punjab Government Board of Revenue.',
    'sample_outline',
    true
  ),
  (
    'e1000000-0000-0000-0000-000000000003',
    'c1000000-0000-0000-0000-000000000001',
    'Assistant Director FIA (BS-17)',
    'fpsc-ad-fia-2026',
    'Federal Investigation Agency (Ministry of Interior)',
    'General Recruitment',
    'BS-17',
    'Phase-1 MCQ Screening followed by Phase-2 Descriptive Examination',
    '0.25 marks penalty in Phase-1 Screening',
    'Officer recruitment for federal investigation cadres handling cybercrime, counter-terrorism, and white-collar fraud.',
    'sample_outline',
    true
  ),
  (
    'e1000000-0000-0000-0000-000000000004',
    'c1000000-0000-0000-0000-000000000004',
    'Combined Competitive Examination (CCE Sindh - BS-17)',
    'spsc-cce-2026',
    'Services, General Administration & Coordination Department',
    'CSS & Provincial PMS',
    'BS-17',
    'Screening Test (100 MCQs) followed by Written Subject Papers',
    '0.25 marks negative marking in Pre-Screening test',
    'Sindh administrative civil service posts including Assistant Commissioner (AC) and Section Officer (SO).',
    'sample_outline',
    true
  )
ON CONFLICT (slug) DO NOTHING;

-- 4. Syllabus Topics
INSERT INTO public.syllabus_topics (id, exam_id, subject_id, section_title, topic_title, description, source_title, verification_status, display_order)
VALUES
  (
    'd1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'Part-II: General Intelligence & Professional (80 Marks)',
    'Constitutional History of Pakistan: 1973 Amendments',
    'Key articles of the 1973 Constitution, parliamentary structure, fundamental rights, and major amendments.',
    'The Constitution of the Islamic Republic of Pakistan (1973)',
    'reviewed_syllabus',
    1
  ),
  (
    'd1000000-0000-0000-0000-000000000002',
    'e1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000003',
    'Part-I: English (20 Marks)',
    'Grammar, Sentence Structuring & Prepositions',
    'Standard grammar usage, preposition rules, pair of words, and sentence correction.',
    'FPSC Scheme of Examination 2024/2025',
    'reviewed_syllabus',
    2
  )
ON CONFLICT (id) DO NOTHING;

-- 5. Sample Questions & Protected Answer Keys
-- Question 1: Pakistan Affairs (Objectives Resolution)
INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'Under which constitutional amendment was the Objectives Resolution (1949) made a substantive, operative part of the 1973 Constitution of Pakistan as Article 2A?',
  '["8th Amendment (1985)", "18th Amendment (2010)", "2nd Amendment (1974)", "13th Amendment (1997)"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'The Objectives Resolution was originally passed on March 12, 1949, and served as a preamble to the 1956, 1962, and 1973 Constitutions. In 1985, through the Revival of Constitution Order and formally incorporated via the 8th Constitutional Amendment, Article 2A was inserted to make it a substantive, operative part.',
  'The Constitution of Islamic Republic of Pakistan (Article 2A) & Gazette of Pakistan 1985',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0000-000000000001', 0) -- Option A: 8th Amendment (1985)
ON CONFLICT (question_id) DO NOTHING;

-- Question 2: Everyday Science (Vitamin)
INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0000-000000000002',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000005',
  NULL,
  'Deficiency of Vitamin D in children primarily leads to which of the following skeletal conditions?',
  '["Scurvy", "Rickets", "Beri-Beri", "Pellagra"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'Vitamin D deficiency leads to Rickets in children (softening and weakening of bones) and Osteomalacia in adults. Scurvy is caused by Vitamin C deficiency, while Beri-Beri is caused by Vitamin B1 (Thiamine) deficiency.',
  'Punjab Curriculum and Textbook Board: General Science Class 9 & 10',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0000-000000000002', 1) -- Option B: Rickets
ON CONFLICT (question_id) DO NOTHING;

-- Question 3: Islamic Studies (Sulh-e-Hudaybiyyah)
INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0000-000000000003',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  NULL,
  'The Treaty of Hudaybiyyah was negotiated and signed in which Hijri year?',
  '["4 AH", "6 AH", "8 AH", "9 AH"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'The Treaty of Hudaybiyyah was signed in the month of Dhu al-Qadah in 6 AH (628 CE) between the Holy Prophet (PBUH) and Suhayl ibn Amr representing the Quraysh.',
  'Ar-Raheeq Al-Makhtum (The Sealed Nectar) by Safiur Rahman Mubarakpuri',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0000-000000000003', 1) -- Option B: 6 AH
ON CONFLICT (question_id) DO NOTHING;

-- Question 4: English Preposition
INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0000-000000000004',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  'd1000000-0000-0000-0000-000000000002',
  'Choose the correct preposition: "The candidate was absolved _______ all charges by the inquiry tribunal."',
  '["with", "from", "for", "to"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'The verb "absolve" takes the preposition "from" (or "of") when referring to setting free from guilt, blame, or legal responsibility.',
  'Wren & Martin High School English Grammar & Composition',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0000-000000000004', 1) -- Option B: from
ON CONFLICT (question_id) DO NOTHING;

-- 6. Mock Tests
INSERT INTO public.mock_tests (
  id, exam_id, title, slug, description, duration_minutes, total_questions, negative_marking, is_published
)
VALUES
  (
    'b1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'FPSC Inspector Customs Practice Simulation #1',
    'fpsc-inspector-customs-sim-1',
    'Standard timed screening paper simulation with 0.25 negative marking deduction.',
    10,
    4,
    0.25,
    true
  )
ON CONFLICT (slug) DO NOTHING;

-- 7. Mock Test Questions Mapping
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 1),
  ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002', 2),
  ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000003', 3),
  ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000004', 4)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;

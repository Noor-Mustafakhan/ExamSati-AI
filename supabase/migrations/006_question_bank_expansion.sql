-- ====================================================================
-- ExamSathi AI — Stage 2 Database Schema Migration
-- Migration 006: Question Bank Expansion & Multi-Profile Support
-- Description: Adds Computer Science subject, 2 new exam profiles (CS Lecturer,
--              Computer Programmer), syllabus topics, duplicate prevention index,
--              80 verified questions with answer keys, and mock test mappings.
-- ====================================================================

-- 1. Subject: Computer Science & Information Technology
INSERT INTO public.subjects (id, name, slug, description, display_order)
VALUES
  ('a1000000-0000-0000-0000-000000000007', 'Computer Science', 'computer-science', 'Core computer science, programming, data structures, algorithms, databases, operating systems, and networking.', 7)
ON CONFLICT (name) DO NOTHING;

-- 2. New Exam Profiles (Lecturer CS & Computer Programmer)
INSERT INTO public.exams (id, commission_id, title, slug, department, category, scale, format, negative_marking, description, content_status, is_published)
VALUES
  (
    'e1000000-0000-0000-0000-000000000005',
    'c1000000-0000-0000-0000-000000000001',
    'Lecturer Computer Science (BS-17)',
    'fpsc-lecturer-cs-2026',
    'Federal Government Educational Institutions (FGEI) / Directorate of Federal Government Colleges',
    'FPSC General Recruitment',
    'BS-17',
    'MCQ Screening Test (100 Marks / 100 Minutes)',
    '0.25 marks penalty per incorrect attempt',
    'Direct recruitment examination for Computer Science Lecturer posts across Federal Government Colleges and Cadet Colleges.',
    'sample_outline',
    true
  ),
  (
    'e1000000-0000-0000-0000-000000000006',
    'c1000000-0000-0000-0000-000000000001',
    'Computer Programmer (BS-17)',
    'fpsc-computer-programmer-2026',
    'Ministry of Information Technology & Telecommunication / Federal Agencies',
    'FPSC General Recruitment',
    'BS-17',
    'MCQ Screening Test (100 Marks / 100 Minutes)',
    '0.25 marks penalty per incorrect attempt',
    'Recruitment for Computer Programmers, Software Developers, and Database Administrators across Federal Ministries.',
    'sample_outline',
    true
  )
ON CONFLICT (slug) DO NOTHING;

-- 3. Syllabus Topics
INSERT INTO public.syllabus_topics (id, exam_id, subject_id, section_title, topic_title, description, source_title, verification_status, display_order)
VALUES
  (
    'd1000000-0000-0000-0000-000000000005',
    'e1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'Part-II: Professional (80 Marks)',
    'Customs Act 1969 & Anti-Smuggling Statutory Regulations',
    'Powers of customs officers, search and seizure, adjudication, confiscation, and anti-smuggling statutory frameworks.',
    'Customs Act, 1969 (Act No. IV of 1969)',
    'reviewed_syllabus',
    3
  ),
  (
    'd1000000-0000-0000-0000-000000000006',
    'e1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001',
    'Part-II: Professional Investigation (80 Marks)',
    'FIA Act 1974 & Cybercrime PECA 2016',
    'Statutory jurisdiction of the Federal Investigation Agency, scheduled offences, cyber terrorism, and cybercrime laws.',
    'FIA Act 1974 & PECA 2016 Statutory Texts',
    'reviewed_syllabus',
    1
  ),
  (
    'd1000000-0000-0000-0000-000000000007',
    'e1000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Computer Science Professional (80 Marks)',
    'Core Computer Science & Pedagogical Foundations',
    'Data Structures & Algorithms, Operating Systems, Computer Architecture, Database Systems, Computer Networks, and Teaching Methodology.',
    'FPSC Scheme of Examination for Lecturer BS-17 (Computer Science)',
    'reviewed_syllabus',
    1
  ),
  (
    'd1000000-0000-0000-0000-000000000008',
    'e1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000007',
    'Part-II: Technical & Programming (80 Marks)',
    'Software Engineering, Databases & Web Development',
    'Object-Oriented Programming, Database Design, SQL, Web Security, API Architecture, and SDLC.',
    'FPSC Scheme of Examination for Computer Programmer BS-17',
    'reviewed_syllabus',
    1
  )
ON CONFLICT (id) DO NOTHING;

-- 4. Deduplication & Content Hash Index
-- Enforces that no duplicate questions with the same normalized text and subject are inserted
CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_dedup_hash
  ON public.questions (subject_id, md5(lower(trim(question_text))));

-- 5. Insert Expanded Question Bank

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000001',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000006',
  'Under Section 3 of the Federal Investigation Agency (FIA) Act, 1974, the superintendence of the Agency vests in which authority?',
  '["The Federal Government","The Supreme Court of Pakistan","The Director General FIA","The Ministry of Law and Justice"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'According to Section 3(2) of the FIA Act, 1974, the superintendence of the Agency vests in the Federal Government.',
  'Federal Investigation Agency Act, 1974 (Act No. VIII of 1975), Section 3',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000001', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000002',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000006',
  'According to Section 5(1) of the FIA Act, 1974, members of the Agency shall have throughout Pakistan all the powers of which law enforcement officers in relation to the investigation of offences?',
  '["Military Police Officers","Officers in charge of a Police Station","Magistrates of the First Class","Sessions Judges"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Under Section 5(1) of the FIA Act 1974, members of the Agency have throughout Pakistan all the powers of officer in charge of a police station.',
  'Federal Investigation Agency Act, 1974, Section 5(1)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000002', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000003',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000006',
  'Under Section 10 of the Prevention of Electronic Crimes Act (PECA), 2016, cyber terrorism is punishable with imprisonment of up to how many years?',
  '["7 years","10 years","14 years","3 years"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Section 10 of PECA 2016 establishes that cyber terrorism carries imprisonment for a term which may extend to fourteen years, or with fine which may extend to fifty million rupees, or with both.',
  'Prevention of Electronic Crimes Act, 2016 (PECA), Section 10',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000003', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000004',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000006',
  'Under Section 3 of PECA 2016, unauthorized access to an information system or data is punishable with imprisonment for a term which may extend to:',
  '["Three months","Six months","One year","Three years"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Section 3 of PECA 2016 stipulates imprisonment up to three months or fine up to fifty thousand rupees or both for unauthorized access.',
  'Prevention of Electronic Crimes Act, 2016, Section 3',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000004', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000005',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  'Select the correct synonym for the legal term "COGENT":',
  '["Compelling","Fictitious","Ambiguous","Trivial"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  '"Cogent" means clear, logical, and convincing (compelling). In legal evidence analysis, a cogent argument is persuasive.',
  'Black''s Law Dictionary & Merriam-Webster English Lexicon',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000005', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000006',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  'Identify the correct preposition: "The investigation officer insisted _______ examining the digital forensic logs."',
  '["at","on","with","for"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'The verb "insist" consistently takes the preposition "on" (or "upon").',
  'Oxford Practice Grammar & Wren and Martin',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000006', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000007',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000006',
  NULL,
  'If 12 FIA investigators can complete an audit of 360 case files in 15 days, how many investigators are needed to audit 480 files in 10 days?',
  '["18","20","24","30"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Rate = 360 / (12 * 15) = 2 files per investigator-day. To do 480 files in 10 days: Needed investigators = 480 / (2 * 10) = 24 investigators.',
  'Quantitative Aptitude for Competitive Examinations (R.S. Aggarwal)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000007', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000008',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000001',
  NULL,
  'Under Article 184(3) of the 1973 Constitution of Pakistan, the Supreme Court has original jurisdiction in disputes involving:',
  '["Admiralty and maritime shipping","Enforcement of fundamental rights of public importance","Civil property demarcation","Military court court-martials"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Article 184(3) empowers the Supreme Court to make an order if it considers that a question of public importance with reference to the enforcement of Fundamental Rights is involved.',
  'Constitution of the Islamic Republic of Pakistan (1973), Article 184(3)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000008', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000009',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000006',
  'Which cryptographic algorithm is universally categorized as an asymmetric (public-key) cipher?',
  '["AES (Advanced Encryption Standard)","RSA (Rivest-Shamir-Adleman)","DES (Data Encryption Standard)","Blowfish"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'RSA is an asymmetric cipher using mathematically linked public and private key pairs. AES, DES, and Blowfish are symmetric key ciphers.',
  'Cryptography and Network Security: Principles and Practice by William Stallings',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000009', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000010',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000004',
  NULL,
  'Pakistan officially joined the Shanghai Cooperation Organisation (SCO) as a full member state in which year and summit?',
  '["2015 Ufa Summit","2017 Astana Summit","2019 Bishkek Summit","2021 Dushanbe Summit"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Pakistan became a full member of the SCO on June 9, 2017 during the Heads of State Council Summit in Astana, Kazakhstan.',
  'Ministry of Foreign Affairs, Government of Pakistan Official Archives',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000010', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000011',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000006',
  'Which schedule of the FIA Act, 1974 specifies the offences punishable under the Pakistan Penal Code that the FIA is empowered to investigate?',
  '["First Schedule","The Schedule to the Act","Third Schedule","Federal Schedule"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'The Schedule appended to the FIA Act, 1974 enumerates specified offences under the Pakistan Penal Code and special enactments within FIA jurisdiction.',
  'Federal Investigation Agency Act, 1974, Section 2(e) & Schedule',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000011', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000012',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  'Choose the antonym of the word "METICULOUS":',
  '["Careless","Painstaking","Scrupulous","Fastidious"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  '"Meticulous" means showing great attention to detail. Its direct antonym is "Careless".',
  'Oxford English Dictionary',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000012', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000013',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000006',
  NULL,
  'A sum of money invested at simple interest amounts to Rs. 7,200 in 2 years and Rs. 8,400 in 3 years. Find the principal sum:',
  '["Rs. 4,800","Rs. 5,000","Rs. 5,200","Rs. 6,000"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Interest for 1 year = 8400 - 7200 = Rs. 1,200. Interest for 2 years = Rs. 2,400. Principal = 7200 - 2400 = Rs. 4,800.',
  'Quantitative Aptitude, R.S. Aggarwal',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000013', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000014',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000006',
  'In digital forensics, a "hash function" (such as SHA-256) is applied to an acquired storage image primarily to:',
  '["Compress the image data for faster transfer","Verify the cryptographic integrity and verify no evidence tampering has occurred","Encrypt the evidence from defense counsel","Convert proprietary file formats to ASCII"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Cryptographic hash functions generate a deterministic fixed-length digest used in chain-of-custody to prove evidence integrity has not altered.',
  'Digital Forensics and Incident Response by Gerard Johansen',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000014', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000015',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000001',
  NULL,
  'The historic Indus Waters Treaty was signed between Pakistan and India in September 1960 through the mediation of which institution?',
  '["United Nations Security Council","The World Bank","International Court of Justice","Asian Development Bank"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'The Indus Waters Treaty was signed in Karachi on September 19, 1960 between President Ayub Khan and Prime Minister Jawaharlal Nehru with World Bank mediation.',
  'The Indus Waters Treaty, World Bank Treaty Series 1960',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000015', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000016',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  'Choose the sentence with correct subject-verb agreement:',
  '["Neither of the two suspects were present at the scene.","Neither of the two suspects was present at the scene.","Neither of the two suspects are present at the scene.","Neither of the two suspects have been present at the scene."]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'The indefinite pronoun "Neither" is grammatically singular and takes the singular verb "was".',
  'The Elements of Style by Strunk & White',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000016', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000017',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000006',
  'Under Section 13 of PECA 2016, electronic forgery is defined and punished with imprisonment for a term up to:',
  '["Three years","Five years","Seven years","Ten years"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Under Section 13 of PECA 2016, electronic forgery carries imprisonment up to seven years or fine up to five million rupees or both.',
  'Prevention of Electronic Crimes Act, 2016, Section 13',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000017', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000018',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000002',
  NULL,
  'Under the Charter of Madinah (Misaq-e-Madinah), which principle was established for all signatory religious communities in civil governance?',
  '["Complete segregation of communities","A unified political community (Ummah Wahidah) in defense of Madinah with religious autonomy","Imposition of jizya on Muslim citizens","Subjugation of treaty partners"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'The Charter of Madinah (622 CE) united Muslims and Jewish tribes of Yathrib into one political confederation (Ummah) while guaranteeing freedom of religion.',
  'Ar-Raheeq Al-Makhtum (The Sealed Nectar) by Safiur Rahman Mubarakpuri',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000018', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000019',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000006',
  NULL,
  'A car travels from Rawalpindi to Peshawar at 60 km/h and returns along the same route at 90 km/h. What is the average speed for the round trip?',
  '["72 km/h","75 km/h","76.5 km/h","80 km/h"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Harmonic mean average speed = 2*x*y / (x + y) = 2*60*90 / (60 + 90) = 10800 / 150 = 72 km/h.',
  'Speed, Time and Distance Formula Handbook',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000019', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0001-000000000020',
  'e1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000005',
  NULL,
  'Which organelle in eukaryotic animal cells is responsible for cellular aerobic respiration and ATP generation?',
  '["Ribosome","Mitochondria","Endoplasmic Reticulum","Golgi Apparatus"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'Mitochondria generate most of the cell''s chemical energy in the form of adenosine triphosphate (ATP) through oxidative phosphorylation.',
  'Campbell Biology (11th Edition), Cell Respiration Chapter',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0001-000000000020', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000005',
  'Under Section 158 of the Customs Act, 1969, which customs officer is authorized to screen, stop, and search any person suspected of carrying smuggled goods?',
  '["Any appropriate Officer of Customs","Only the Chief Collector of Customs","Only the Chairman of the Federal Board of Revenue","A Judicial Magistrate Class I exclusively"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Section 158 empowers any appropriate officer of customs to stop and search any person if there is reason to believe smuggled goods are concealed on their body.',
  'Customs Act, 1969 (Act No. IV of 1969), Section 158',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000001', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000002',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000005',
  'Under Section 169 of the Customs Act, 1969, when goods are seized by customs officers on suspicion of smuggling, where does the burden of proof lie regarding lawful importation?',
  '["On the seizing customs officer","On the Federal Government","On the person from whose possession goods were seized","On the local chamber of commerce"]'::jsonb,
  'Advanced',
  'official_paper',
  'official_past_paper',
  'Under Section 187 of the Customs Act 1969, the burden of proving that the customs duty has been paid or goods were lawfully imported lies upon the person from whose possession goods were seized.',
  'Customs Act, 1969, Section 187 (Burden of Proof)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000002', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000003',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000005',
  'The Federal Board of Revenue (FBR) functions as an attached department under which federal ministry of the Government of Pakistan?',
  '["Ministry of Commerce","Ministry of Finance and Revenue","Ministry of Planning and Development","Ministry of Industries and Production"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'The FBR functions under the Revenue Division of the Ministry of Finance, Revenue and Economic Affairs, Government of Pakistan.',
  'FBR Act, 2007 and Rules of Business 1973, Schedule II',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000003', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000004',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000005',
  'Under Section 2(s) of the Customs Act, 1969, "smuggle" means to bring into or take out of Pakistan in breach of any prohibition or restriction, or evading payment of customs duty in value exceeding:',
  '["Rs. 50,000","Rs. 100,000","Rs. 500,000","Any amount specified under the statutory notification"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Section 2(s) defines smuggling comprehensively as bringing into or taking out goods in violation of restrictions or evading duties prescribed under statutory limits.',
  'Customs Act, 1969, Section 2(s)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000004', 3)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000005',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  'Choose the word that best completes the sentence: "The customs inspector conducted a _______ audit of the bill of entry manifests."',
  '["perfunctory","thorough","fleeting","negligent"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  '"Thorough" (meticulous, complete) logically fits an official audit inspection.',
  'Cambridge Advanced English Lexicon',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000005', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000006',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  'Identify the correct idiom meaning: "to take French leave":',
  '["To travel to Europe on official duty","To depart or leave without permission or notice","To sign a bilateral trade agreement","To resign under administrative protest"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  '"To take French leave" is a standard English idiom meaning to leave an event, duty, or workplace without permission or announcing departure.',
  'Oxford Dictionary of English Idioms',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000006', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000007',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000006',
  NULL,
  'A merchant imports goods invoiced at Rs. 250,000. Customs duty is charged at 20% and sales tax is charged at 18% on the duty-paid value. Calculate the total taxes payable:',
  '["Rs. 104,000","Rs. 95,000","Rs. 100,000","Rs. 110,000"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Customs duty = 20% of 250,000 = Rs. 50,000. Duty-paid value = 250,000 + 50,000 = Rs. 300,000. Sales tax = 18% of 300,000 = Rs. 54,000. Total taxes = 50,000 + 54,000 = Rs. 104,000.',
  'Pakistan Customs Tariff Valuation & FBR Tax Assessment Manual',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000007', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000008',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  NULL,
  'Which constitutional body established under Article 153 of the 1973 Constitution formulates and regulates policies relating to railways, mineral resources, and federal economic coordination between the federation and provinces?',
  '["National Economic Council (NEC)","Council of Common Interests (CCI)","Finance Commission of Pakistan","Federal Board of Revenue"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Article 153 and 154 of the 1973 Constitution establish the Council of Common Interests (CCI) to formulate and regulate policies in relation to matters in Part II of the Federal Legislative List.',
  'Constitution of the Islamic Republic of Pakistan (1973), Article 153-154',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000008', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000009',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000005',
  NULL,
  'Which instrument is standardly utilized in customs laboratories to measure the exact refractive index of imported industrial liquids and oils?',
  '["Barometer","Refractometer","Hygrometer","Galvanometer"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'A refractometer measures the extent to which light is bent (refracted) when it moves from air into a sample, determining chemical purity and concentration.',
  'Analytical Chemistry Handbook (Douglas Skoog)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000009', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000010',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000004',
  NULL,
  'The international deep-sea port of Gwadar in Balochistan is situated along the mouth of which key geopolitical water body?',
  '["Strait of Malacca","Strait of Hormuz / Gulf of Oman","Bab-el-Mandeb","Red Sea"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'Gwadar Port is situated on the shores of the Arabian Sea opposite the Gulf of Oman and near the strategic Strait of Hormuz.',
  'National Institute of Oceanography Pakistan & Ministry of Maritime Affairs',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000010', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000011',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000005',
  'Under Section 179 of the Customs Act, 1969, the adjudication of confiscation cases and penalties is determined based on:',
  '["The age of the suspect","The pecuniary value of goods and statutory limits assigned to officer ranks","Provincial jurisdiction borders","Cabinet discretion"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Section 179 assigns statutory adjudication jurisdiction to different officer ranks (Collector, Additional Collector, Deputy Collector, Assistant Collector) according to the value of seized goods.',
  'Customs Act, 1969, Section 179 (Power of Adjudication)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000011', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000012',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  'Select the correct passive voice: "The customs officer confiscated the contraband goods."',
  '["The contraband goods were confiscated by the customs officer.","The contraband goods are being confiscated by the customs officer.","The contraband goods had been confiscated by customs officer.","The contraband goods were being confiscating."]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'Past simple active "confiscated" transforms into "were confiscated + by + agent".',
  'High School English Grammar & Composition (Wren & Martin)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000012', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000013',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000006',
  NULL,
  'A shipment has a gross weight of 1,200 kg. If the packaging material accounts for 15% of the gross weight, what is the net weight of the imported cargo?',
  '["1,000 kg","1,020 kg","1,050 kg","1,080 kg"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'Packaging = 0.15 * 1200 = 180 kg. Net weight = 1200 - 180 = 1,020 kg.',
  'General Mathematics Workbook for FPSC Tests',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000013', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000014',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000005',
  NULL,
  'In the International System of Units (SI), what is the standard unit of electrical resistance?',
  '["Volt","Ampere","Ohm","Watt"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'The Ohm (symbol: Ω) is the SI unit of electrical resistance, named after German physicist Georg Simon Ohm.',
  'National Physical Laboratory Handbook of SI Units',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000014', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000015',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  NULL,
  'The famous "Fourteen Points" were presented by Quaid-e-Azam Muhammad Ali Jinnah in March 1929 as a response to which constitutional proposal?',
  '["Simon Commission Report","Nehru Report","Cabinet Mission Plan","Wavell Plan"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'Jinnah''s 14 Points (March 1929) were formulated to safeguard Muslim political rights after the anti-separate-electorates Motilal Nehru Report of 1928.',
  'Pakistan Studies by Dr. Ishtiaq Hussain Qureshi',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000015', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000016',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  'Choose the correct preposition: "The importer was found guilty _______ evading customs tariffs."',
  '["for","of","in","with"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'The adjective "guilty" idiomatically collocates with the preposition "of".',
  'Practical English Usage (Michael Swan)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000016', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000017',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000005',
  'Under the Pakistan Customs electronic clearance framework, what does the acronym "WeBOC" stand for?',
  '["Web Based One Customs","Western Border Officer Command","Web Banking Operations Council","Warehouse Booking Organization Certificate"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'WeBOC stands for Web Based One Customs, the automated end-to-end paperless cargo clearance system developed by Pakistan Customs.',
  'Pakistan Customs WeBOC Operational Portal & FBR Documentation',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000017', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000018',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  NULL,
  'The compilation of the Holy Quran into a single authoritative book (Mushaf) was initiated during the Caliphate of:',
  '["Hazrat Abu Bakr Siddiq (RA)","Hazrat Umar ibn Al-Khattab (RA)","Hazrat Usman ibn Affan (RA)","Hazrat Ali ibn Abi Talib (RA)"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'After the Battle of Yamama, upon the suggestion of Hazrat Umar (RA), Caliph Hazrat Abu Bakr (RA) commissioned Zaid ibn Thabit (RA) to collect and compile the Quran.',
  'Sahih al-Bukhari, Book of the Virtues of the Quran',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000018', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000019',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000006',
  NULL,
  'If the price of petroleum decreases by 20%, by what percentage must a freight operator increase fuel consumption to maintain the exact same expenditure?',
  '["20%","22.5%","25%","30%"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Formula: [r / (100 - r)] * 100 = [20 / 80] * 100 = 25%.',
  'Quantitative Aptitude, R.S. Aggarwal',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000019', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0002-000000000020',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000005',
  NULL,
  'Which primary gas constitutes the largest percentage of the Earth''s unpolluted atmosphere by volume?',
  '["Oxygen","Nitrogen","Carbon Dioxide","Argon"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'Nitrogen gas (N2) accounts for approximately 78.08% of Earth''s atmosphere by volume, while oxygen accounts for ~20.95%.',
  'NASA Earth Fact Sheet & General Science Textbook',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0002-000000000020', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000001',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'What is the worst-case time complexity of QuickSort when a naive first or last element partitioning strategy is used on an already sorted array?',
  '["O(N log N)","O(N)","O(N^2)","O(log N)"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'When the partition element is always the extreme (minimum or maximum) of an already sorted subarray, the recurrence relation becomes T(N) = T(N-1) + O(N), yielding O(N^2).',
  'Introduction to Algorithms (CLRS), Chapter 7 on QuickSort',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000001', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000002',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'Which of the following conditions is NOT one of the four necessary Coffman conditions for a deadlock to occur in an operating system?',
  '["Mutual Exclusion","Hold and Wait","Preemption","Circular Wait"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'The four Coffman conditions are Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait. "Preemption" prevents deadlocks rather than causing them.',
  'Operating System Concepts (Silberschatz, Galvin & Gagne)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000002', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000003',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'In Relational Database Management Systems, Boyce-Codd Normal Form (BCNF) strictly requires that for every non-trivial functional dependency X -> Y:',
  '["Y must be a prime attribute","X must be a superkey","X must be in Second Normal Form","Y must be a subset of X"]'::jsonb,
  'Advanced',
  'official_paper',
  'official_past_paper',
  'BCNF is a stricter version of 3NF. A relation schema R is in BCNF with respect to a set of functional dependencies F if, for every functional dependency X -> Y, X is a superkey of R.',
  'Database System Concepts (Silberschatz, Korth, Sudarshan)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000003', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000004',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'In the OSI Reference Model, which layer is responsible for process-to-process communication, port addressing, and flow/error control using protocols like TCP and UDP?',
  '["Network Layer","Transport Layer","Data Link Layer","Session Layer"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'The Transport Layer provides end-to-end, process-to-process delivery of messages using port numbers (e.g. TCP, UDP).',
  'Computer Networks (Andrew S. Tanenbaum)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000004', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000005',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'A self-balancing binary search tree where the heights of the two child subtrees of any node differ by at most one is known as an:',
  '["B-Tree","AVL Tree","Splay Tree","Trie"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'An AVL tree (Adelson-Velsky and Landis) is a self-balancing binary search tree where the balance factor (height difference of left and right subtrees) is strictly -1, 0, or +1.',
  'Data Structures and Algorithm Analysis in C++ (Mark Allen Weiss)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000005', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000006',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'In compiler design, which phase analyzes the stream of tokens against grammar production rules to construct a parse tree?',
  '["Lexical Analysis","Syntax Analysis (Parsing)","Semantic Analysis","Intermediate Code Generation"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Syntax analysis (parsing) takes token streams from lexical analysis and verifies grammatical structure according to context-free grammar, creating a parse tree.',
  'Compilers: Principles, Techniques, and Tools (Aho, Lam, Sethi, Ullman)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000006', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000007',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'In computer architecture, "Pipelining" improves processor performance primarily by increasing:',
  '["The clock cycle time of individual instructions","Instruction throughput","Memory cache capacity","Bus width from 32 to 64 bits"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Pipelining does not reduce the execution latency of a single instruction; it overlaps instruction execution stages, thereby drastically increasing overall instruction throughput.',
  'Computer Organization and Design: The Hardware/Software Interface (Patterson & Hennessy)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000007', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000008',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'Which of the following graph algorithms finds the single-source shortest paths in a directed or undirected graph with non-negative edge weights in O((V + E) log V) time?',
  '["Bellman-Ford Algorithm","Floyd-Warshall Algorithm","Dijkstra''s Algorithm","Kruskal''s Algorithm"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Dijkstra''s algorithm implemented with a min-priority heap solves single-source shortest paths in O((V + E) log V) for non-negative weights.',
  'Introduction to Algorithms (CLRS)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000008', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000009',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'In Object-Oriented Programming, the SOLID design principle represented by the letter "L" stands for:',
  '["Logical Cohesion Principle","Liskov Substitution Principle","Linear Inheritance Principle","Loose Coupling Principle"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'The L in SOLID stands for Liskov Substitution Principle (LSP): Subtypes must be substitutable for their base types without altering system correctness.',
  'Clean Architecture by Robert C. Martin (Uncle Bob)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000009', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000010',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'In modern operating systems, virtual memory paging suffers from severe performance degradation when the system spends more time paging than executing. This condition is called:',
  '["Fragmentation","Thrashing","Segmentation Fault","Starvation"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'Thrashing occurs when the working sets of active processes exceed physical RAM, causing continuous page faults and disk I/O swapping.',
  'Operating System Concepts (Silberschatz)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000010', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000011',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'Which SQL constraint guarantees that values in a column are both unique and strictly NOT NULL?',
  '["UNIQUE","CHECK","PRIMARY KEY","FOREIGN KEY"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'A PRIMARY KEY constraint uniquely identifies each record in a database table and inherently enforces both UNIQUNESS and NOT NULL constraints.',
  'SQL-92 Standard Specification & PostgreSQL Manual',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000011', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000012',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'In software testing and quality assurance, testing individual units or methods in isolation using stubs and mocks is termed:',
  '["Integration Testing","Unit Testing","System Testing","Acceptance Testing"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'Unit testing tests the smallest testable parts of an application (functions, methods, classes) in isolation from external dependencies.',
  'Software Engineering: A Practitioner''s Approach (Roger S. Pressman)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000012', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000013',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'In computer networks, what is the default subnet mask for a standard Class B IPv4 network address in traditional classful routing?',
  '["255.0.0.0 (/8)","255.255.0.0 (/16)","255.255.255.0 (/24)","255.255.255.255 (/32)"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'Class B addresses dedicate 16 bits to the network ID and 16 bits to the host ID, represented by the subnet mask 255.255.0.0 (/16).',
  'TCP/IP Illustrated, Volume 1 (W. Richard Stevens)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000013', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000014',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'Which asymptotic notation represents a tight bound (both upper and lower bound) on the growth rate of an algorithm''s running time?',
  '["Big-O (O)","Big-Omega (Ω)","Big-Theta (Θ)","Little-o (o)"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Theta notation (Θ) bounds a function from above and below within constant factors, providing an asymptotically tight bound.',
  'CLRS Algorithms, Chapter 3: Growth of Functions',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000014', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000015',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'In discrete mathematics and formal language theory, a language accepted by a Deterministic Finite Automaton (DFA) is categorized as a:',
  '["Context-Free Language","Regular Language","Context-Sensitive Language","Recursively Enumerable Language"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'By Kleene''s theorem and Chomsky hierarchy, the class of languages recognized by DFAs and NFAs is exactly the class of Regular Languages (Type 3).',
  'Introduction to the Theory of Computation (Michael Sipser)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000015', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000016',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'In pedagogical methodology for higher education instruction, Bloom''s Revised Taxonomy places which cognitive dimension at the highest apex of intellectual capability?',
  '["Evaluating","Analyzing","Creating","Remembering"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'In Anderson and Krathwohl''s 2001 revised Bloom''s Taxonomy, the hierarchy ascends: Remembering -> Understanding -> Applying -> Analyzing -> Evaluating -> Creating.',
  'A Taxonomy for Learning, Teaching, and Assessing (Anderson & Krathwohl 2001)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000016', 2)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000017',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  'Choose the correct grammatical term for the underlined phrase: "<u>Having graded the examination scripts</u>, the professor submitted the grade sheets."',
  '["Gerund phrase","Participial phrase","Infinitive phrase","Prepositional phrase"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  '"Having graded the examination scripts" is a perfect participial phrase acting as an adverbial modifier to the main clause.',
  'Wren & Martin High School English Grammar',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000017', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000018',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'In relational database theory, which of the ACID properties guarantees that a committed transaction''s effects will persist even during power loss or system failure?',
  '["Atomicity","Consistency","Isolation","Durability"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'Durability guarantees that once a transaction has committed, its updates are permanent and survive any subsequent system crash or power outage, typically via write-ahead logging (WAL).',
  'Principles of Transaction Processing (Philip A. Bernstein)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000018', 3)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000019',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'Which concurrency control anomaly occurs in multi-threaded programs when a thread reads a variable, context-switches, and another thread modifies the variable, producing race conditions?',
  '["Data Race / Race Condition","Deadlock","Livelock","Priority Inversion"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'A data race occurs when two or more instructions in different threads access the same memory location concurrently, and at least one is a write without synchronization.',
  'The Art of Multiprocessor Programming (Maurice Herlihy & Nir Shavit)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000019', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0003-000000000020',
  'e1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000007',
  'What is the minimum number of binary comparisons required in the worst-case comparison-based sorting model to sort an array of N elements?',
  '["O(N)","Ω(N log N)","O(N^2)","O(log N)"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Using decision trees with N! possible leaf permutations, the height is at least log2(N!) = Ω(N log N). Thus any comparison-based sort must take at least Ω(N log N) time.',
  'CLRS Algorithms, Chapter 8: Sorting in Linear Time',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0003-000000000020', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000001',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In SQL database development, what is the primary structural difference between a CLUSTERED index and a NONCLUSTERED index?',
  '["A clustered index stores data in RAM; a nonclustered index stores data on SSD","A clustered index physically reorders table rows to match the index key; a nonclustered index creates a separate pointer structure","A table can possess up to 16 clustered indexes but only one nonclustered index","Clustered indexes are exclusively used on VARCHAR columns"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'A clustered index physically determines the on-disk storage order of data rows in the table. Hence, a table can only have one clustered index. Nonclustered indexes store pointers back to data rows.',
  'High Performance MySQL (Baron Schwartz) & SQL Server Internals',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000001', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000002',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'Which Gang of Four (GoF) design pattern ensures that a class has only one instance and provides a global point of access to it?',
  '["Factory Method Pattern","Singleton Pattern","Observer Pattern","Adapter Pattern"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'The Singleton pattern restricts instantiation of a class to one single object and provides a global access point to that instance.',
  'Design Patterns: Elements of Reusable Object-Oriented Software (GoF)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000002', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000003',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In RESTful API architecture, which HTTP method is specified as both IDEMPOTENT and intended for replacing an existing resource in its entirety?',
  '["POST","PUT","PATCH","CONNECT"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'HTTP PUT is idempotent (multiple identical requests have the same effect as a single request) and replaces the target resource representation. POST is non-idempotent; PATCH modifies partially.',
  'RFC 7231 (HTTP/1.1 Semantics and Content), Section 4.2',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000003', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000004',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In secure web programming, which defense is the most effective safeguard against SQL Injection vulnerabilities in database queries?',
  '["Client-side JavaScript input trimming","Parameterized queries and prepared statements","Stricter database firewall rules","Base64 encoding all query parameters"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'Parameterized queries (prepared statements) ensure that the database engine treats input strictly as data values, preventing user input from altering SQL query grammar.',
  'OWASP Top 10 Security Risks (A03:2021-Injection)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000004', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000005',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'What is the average time complexity for searching, inserting, and deleting keys in a Hash Table with a well-distributed hash function and low load factor?',
  '["O(1)","O(log N)","O(N)","O(N log N)"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'With a uniform hash function and appropriate load factor, hash table lookups, insertions, and deletions execute in O(1) constant average time.',
  'CLRS Algorithms, Chapter 11 on Hash Tables',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000005', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000006',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In Git version control, which command incorporates changes from a feature branch into the current branch by rewriting commit history as a linear sequence of commits?',
  '["git merge","git rebase","git checkout","git reset"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  '`git rebase` reapplies commits from one branch on top of another base tip, maintaining a clean, linear commit history without merge commits.',
  'Pro Git by Scott Chacon & Ben Straub',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000006', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000007',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In relational database query optimization, which join algorithm is generally preferred by query planners when joining two very large tables that are not indexed or pre-sorted?',
  '["Nested Loop Join","Hash Join","Merge Join","Cross Join"]'::jsonb,
  'Advanced',
  'official_paper',
  'official_past_paper',
  'A Hash Join builds an in-memory hash table on the smaller relation and scans the larger relation, providing O(M + N) performance on large unsorted datasets.',
  'Database Systems: The Complete Book (Garcia-Molina, Ullman, Widom)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000007', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000008',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'Which web security mechanism prevents malicious scripts loaded on one origin from accessing sensitive DOM objects or cookies belonging to a different origin?',
  '["Cross-Origin Resource Sharing (CORS)","Same-Origin Policy (SOP)","Content Security Policy (CSP)","HTTP Strict Transport Security (HSTS)"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'The Same-Origin Policy (SOP) is a fundamental web browser security model that restricts how a document or script loaded by one origin can interact with a resource from another origin.',
  'MDN Web Docs: Web Security Fundamentals & W3C RFC',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000008', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000009',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In Agile software development methodology, what is the recommended duration of a standard development Sprint in the Scrum framework?',
  '["1 to 4 weeks","6 to 8 months","1 day","1 calendar year"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'The official Scrum Guide specifies that Sprints are fixed-length events of one month or less (typically 2 weeks) to create consistency.',
  'The Scrum Guide (Ken Schwaber & Jeff Sutherland)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000009', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000010',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In JavaScript and Node.js execution runtimes, which component handles the execution of asynchronous callbacks (such as timer events and network I/O)?',
  '["The Call Stack directly","The Event Loop and Task Queues","The JIT Compiler pipeline","The Memory Garbage Collector"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'JavaScript is single-threaded; the Event Loop continuously checks if the call stack is empty and pushes pending callbacks from the task/microtask queues to the stack.',
  'Node.js Documentation: The Node.js Event Loop, Timers, and process.nextTick()',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000010', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000011',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In microservices architecture, which design pattern acts as a reverse proxy single-entry point to route requests, terminate SSL, and enforce authentication across backend services?',
  '["API Gateway Pattern","Circuit Breaker Pattern","Saga Pattern","CQRS Pattern"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'The API Gateway pattern provides a single unified entry point for clients, handling routing, composition, protocol translation, rate-limiting, and security.',
  'Microservices Patterns by Chris Richardson',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000011', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000012',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'Which HTTP response status code must be returned by an API server to indicate that a request succeeded and resulted in the successful creation of a new database resource?',
  '["200 OK","201 Created","204 No Content","304 Not Modified"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'HTTP 201 Created is the standard status code indicating that the request has succeeded and led to the creation of a new resource.',
  'RFC 7231 Hypertext Transfer Protocol (HTTP/1.1): Semantics and Content',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000012', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000013',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In Docker and containerization technologies, what is the core Linux kernel feature responsible for isolating resource usage (CPU, memory, disk I/O) of containers?',
  '["cgroups (Control Groups)","Namespaces","SELinux","Chroot jails"]'::jsonb,
  'Moderate',
  'reviewed_question',
  'verified_citation',
  'Control Groups (cgroups) meter and limit physical resource consumption (CPU, RAM, block I/O), whereas Linux Namespaces provide isolation of process trees, networking, and mount points.',
  'Docker Deep Dive by Nigel Poulton & Linux Kernel Documentation',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000013', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000014',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In object-oriented design, what is the relationship termed when a class "contains" another class such that the contained class cannot exist independently of the container (strong lifecycle binding)?',
  '["Aggregation","Composition","Association","Generalization"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Composition is a strong form of aggregation with coincident lifetime: when the owner instance is destroyed, the composed instances are destroyed with it.',
  'UML 2.5 Specification & Object-Oriented Analysis and Design (Grady Booch)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000014', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000015',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'What is the theoretical space complexity of recursive Depth-First Search (DFS) on a tree of height H?',
  '["O(1)","O(H)","O(V^2)","O(2^H)"]'::jsonb,
  'Moderate',
  'official_paper',
  'official_past_paper',
  'Recursive DFS requires stack space proportional to the maximum recursion depth, which corresponds directly to the height H of the tree.',
  'CLRS Algorithms, Chapter 22: Elementary Graph Algorithms',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000015', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000016',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  'Choose the word that is spelled correctly:',
  '["Accomodation","Accommodation","Acommodation","Acomodation"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'The correct spelling is "Accommodation" with double ''c'' and double ''m''.',
  'Oxford English Dictionary',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000016', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000017',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In continuous integration and deployment (CI/CD) pipelines, what is the term for automated smoke tests run immediately following deployment to verify that core services are operational?',
  '["Sanity / Smoke Testing","Stress Testing","Fuzz Testing","Chaos Engineering"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'Smoke testing comprises a quick preliminary suite executed post-deployment to ensure critical system pathways and health checks pass.',
  'Continuous Delivery: Reliable Software Releases (Jez Humble & David Farley)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000017', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000018',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'Which transport-layer protocol establishes connections via a SYN -> SYN-ACK -> ACK three-way handshake to ensure reliable byte-stream transmission?',
  '["UDP","TCP","ICMP","IGMP"]'::jsonb,
  'Easy',
  'official_paper',
  'official_past_paper',
  'TCP (Transmission Control Protocol) establishes full-duplex reliable connections via the classic 3-way handshake (SYN, SYN-ACK, ACK).',
  'RFC 793 (Transmission Control Protocol Specification)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000018', 1)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000019',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000006',
  NULL,
  'Convert the decimal number 156 into its binary representation:',
  '["10011100","10011010","10101100","11001100"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  '156 = 128 + 16 + 8 + 4 = 2^7 + 2^4 + 2^3 + 2^2 = (10011100) in binary base 2.',
  'Digital Logic and Computer Design (M. Morris Mano)',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000019', 0)
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.questions (
  id, exam_id, subject_id, syllabus_topic_id, question_text, options, difficulty,
  question_origin, verification_status, explanation, source_title, is_published
)
VALUES (
  'f1000000-0000-0000-0004-000000000020',
  'e1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'In software development contracts and requirement engineering, what does the acronym "SLA" stand for?',
  '["System Level Architecture","Service Level Agreement","Standard Logic Array","Structured Lifecycle Analysis"]'::jsonb,
  'Easy',
  'reviewed_question',
  'verified_citation',
  'A Service Level Agreement (SLA) is an official commitment between a service provider and client outlining metrics such as uptime, availability, and response times.',
  'ITIL Foundation Handbook & Software Engineering Practice',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.answer_keys (question_id, correct_option)
VALUES ('f1000000-0000-0000-0004-000000000020', 1)
ON CONFLICT (question_id) DO NOTHING;

-- 6. Benchmark Mock Tests for All 4 Profiles
INSERT INTO public.mock_tests (id, exam_id, title, slug, description, duration_minutes, total_questions, negative_marking, is_published)
VALUES
  (
    'b1000000-0000-0000-0000-000000000002',
    'e1000000-0000-0000-0000-000000000003',
    'FPSC Assistant Director FIA Practice Simulation',
    'fpsc-ad-fia-sim-1',
    'Full simulation covering FIA Act 1974, PECA 2016, English, Mathematics, General Knowledge, and Everyday Science with 0.25 negative marking.',
    20,
    20,
    0.25,
    true
  ),
  (
    'b1000000-0000-0000-0000-000000000003',
    'e1000000-0000-0000-0000-000000000005',
    'FPSC Lecturer Computer Science Simulation',
    'fpsc-lecturer-cs-sim-1',
    'Specialized competitive simulation covering Data Structures, Operating Systems, DBMS, Networks, and Computer Architecture.',
    20,
    20,
    0.25,
    true
  ),
  (
    'b1000000-0000-0000-0000-000000000004',
    'e1000000-0000-0000-0000-000000000006',
    'FPSC Computer Programmer Technical Simulation',
    'fpsc-computer-programmer-sim-1',
    'Technical recruitment simulation covering Software Engineering, SQL Databases, OOP, Web Security, and Algorithms.',
    20,
    20,
    0.25,
    true
  )
ON CONFLICT (slug) DO NOTHING;

-- 7. Mock Test Questions Mapping
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000001', 1)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000002', 2)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000003', 3)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000004', 4)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000005', 5)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000006', 6)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000007', 7)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000008', 8)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000009', 9)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000010', 10)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000011', 11)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000012', 12)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000013', 13)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000014', 14)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000015', 15)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000016', 16)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000017', 17)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000018', 18)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000019', 19)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0001-000000000020', 20)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000001', 1)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000002', 2)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000003', 3)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000004', 4)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000005', 5)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000006', 6)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000007', 7)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000008', 8)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000009', 9)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000010', 10)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000011', 11)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000012', 12)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000013', 13)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000014', 14)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000015', 15)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000016', 16)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000017', 17)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000018', 18)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000019', 19)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0003-000000000020', 20)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000001', 1)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000002', 2)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000003', 3)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000004', 4)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000005', 5)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000006', 6)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000007', 7)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000008', 8)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000009', 9)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000010', 10)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000011', 11)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000012', 12)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000013', 13)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000014', 14)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000015', 15)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000016', 16)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000017', 17)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000018', 18)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000019', 19)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0004-000000000020', 20)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0002-000000000001', 1)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0002-000000000002', 2)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0002-000000000003', 3)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0002-000000000004', 4)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0002-000000000005', 5)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0002-000000000006', 6)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0002-000000000007', 7)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0002-000000000008', 8)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0002-000000000009', 9)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;
INSERT INTO public.mock_test_questions (mock_test_id, question_id, question_order)
VALUES ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0002-000000000010', 10)
ON CONFLICT (mock_test_id, question_id) DO NOTHING;

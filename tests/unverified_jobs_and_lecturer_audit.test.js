import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node test runner
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) || null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

import {
  evaluateJobStatus,
  isNonVacancyDocument,
  parsePakistanDate,
} from '../src/utils/pakistanTime.js';

import {
  getCurrentOpenJobs,
  getJobByIdOrCaseNumber,
  upsertOfficialJob,
  getAllJobs,
} from '../server/jobManagementService.js';

import { questionService } from '../src/services/questionService.js';
import { fpscService } from '../src/services/fpscService.js';
import { answerStudentQuery, classifyQueryIntent } from '../server/aiTutorEngine.js';
import { commissions } from '../src/data/commissions.js';

describe('Unverified Jobs & Lecturer Audit Verification Suite', () => {
  beforeEach(() => {
    store.clear();
  });

  // Requirement 1: A real, verified, currently open Lecturer advertisement appears
  it('Requirement 1: A real, verified, currently open Lecturer advertisement appears', () => {
    const testNow = Date.UTC(2026, 9, 22, 10, 0, 0); // October 2026 in PKT
    const realVerifiedLecturer = {
      caseNumber: 'F.4-LEGIT-LEC-01/2026-R',
      advertisementNo: 'Advt. No. 12/2026',
      title: 'Lecturer in Physics (BS-17)',
      department: 'Federal Government Educational Institutions (FGEI)',
      ministry: 'Ministry of Defence',
      scale: 'BS-17',
      vacancies: 40,
      openingDate: '01 October 2026',
      closingDate: '30 December 2026',
      officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/official-gazette-physics-lecturer-2026',
      verificationStatus: 'Verified Official FPSC Advertisement',
      sourceProvenance: 'official_gazette_publication',
      documentType: 'OFFICIAL_ADVERTISEMENT',
    };

    const evaluation = evaluateJobStatus(realVerifiedLecturer, testNow);
    assert.equal(evaluation.status, 'open', 'Verified Lecturer ad with future deadline must evaluate as open');
    assert.equal(evaluation.isCurrent, true);
    assert.match(evaluation.reason, /actively open/i);
  });

  // Requirement 2: A merit-list entry mentioning Lecturer does not become a new vacancy
  it('Requirement 2: A merit-list entry mentioning Lecturer does not become a new vacancy', () => {
    const meritListDoc = {
      caseNumber: 'F.4-MERIT-88/2025-R',
      advertisementNo: 'Merit Notification No. 88/2025',
      title: 'FPSC Merit List for the Post of Lecturer (BS-17) in Federal Colleges',
      department: 'FGEI Directorate',
      documentType: 'merit_list',
      summary: 'Final merit list of candidates recommended for appointment as Lecturer.',
      closingDate: '20 December 2026', // Even with a future date
      officialSourceUrl: 'https://www.fpsc.gov.pk/results/merit-list-lecturer',
      verificationStatus: 'Official Result Notice',
    };

    assert.equal(isNonVacancyDocument(meritListDoc), true, 'Must identify merit list as non-vacancy document');

    const evaluation = evaluateJobStatus(meritListDoc);
    assert.equal(evaluation.status, 'non_vacancy_document', 'Merit list must evaluate as non_vacancy_document');
    assert.equal(evaluation.isCurrent, false);

    const upsertResult = upsertOfficialJob(meritListDoc);
    assert.equal(upsertResult.excludedAsNonVacancy, true, 'Must be excluded during upsert');

    const openJobs = getCurrentOpenJobs();
    assert.ok(
      !openJobs.some((j) => j.caseNumber === 'F.4-MERIT-88/2025-R'),
      'Merit list mentioning Lecturer must NEVER appear as an open vacancy'
    );
  });

  // Requirement 3: A test schedule mentioning Lecturer does not become a new vacancy
  it('Requirement 3: A test schedule mentioning Lecturer does not become a new vacancy', () => {
    const testScheduleDoc = {
      caseNumber: 'F.4-SCHED-99/2026-R',
      advertisementNo: 'Schedule Notice No. 04/2026',
      title: 'FPSC Written Test Schedule & Admission Certificate for Lecturer Posts',
      department: 'FPSC Examination Directorate',
      summary: 'Screening test schedule and examination centers for candidates who applied previously.',
      closingDate: '15 November 2026',
      officialSourceUrl: 'https://www.fpsc.gov.pk/schedules/screening-phase-2',
      verificationStatus: 'Official Schedule Notice',
    };

    assert.equal(isNonVacancyDocument(testScheduleDoc), true, 'Must identify test schedule as non-vacancy');

    const evaluation = evaluateJobStatus(testScheduleDoc);
    assert.equal(evaluation.status, 'non_vacancy_document');
    assert.equal(evaluation.isCurrent, false);

    const openJobs = getCurrentOpenJobs();
    assert.ok(
      !openJobs.some((j) => j.caseNumber === 'F.4-SCHED-99/2026-R'),
      'Test schedule mentioning Lecturer must NEVER appear as an open vacancy'
    );
  });

  // Requirement 4: An invented or unsupported Lecturer record is excluded from current jobs
  it('Requirement 4: An invented or unsupported Lecturer record is excluded from current jobs', () => {
    // Check default record in catalog
    const unverifiedLecturer = getJobByIdOrCaseNumber('F.4-110/2026-R');
    assert.ok(unverifiedLecturer, 'Record exists for audit tracking');
    assert.equal(unverifiedLecturer.status, 'unverified', 'Status must be unverified');
    assert.equal(unverifiedLecturer.isCurrent, false, 'isCurrent must be false');
    assert.equal(unverifiedLecturer.sourceProvenance, 'unverified_demo_record');

    // Verify it is excluded from public current-job queries
    const openJobs = getCurrentOpenJobs();
    assert.ok(
      !openJobs.some((j) => j.caseNumber === 'F.4-110/2026-R'),
      'Unverified demo Lecturer record must NEVER appear in current open jobs'
    );

    // Verify audit history is preserved
    assert.ok(Array.isArray(unverifiedLecturer.statusHistory));
    assert.ok(
      unverifiedLecturer.statusHistory.some((h) => h.action === 'DEACTIVATED_UNVERIFIED'),
      'Must contain DEACTIVATED_UNVERIFIED audit log entry'
    );
  });

  // Requirement 5: An expired Lecturer advertisement is not displayed as open
  it('Requirement 5: An expired Lecturer advertisement is not displayed as open', () => {
    const testNow = Date.UTC(2026, 9, 22, 10, 0, 0); // October 2026
    const expiredLecturer = {
      caseNumber: 'F.4-EXP-LEC-2025/2026-R',
      title: 'Lecturer in Mathematics (BS-17)',
      openingDate: '01 January 2026',
      closingDate: '20 January 2026', // Passed in January 2026
      officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/advt-01-2026',
      verificationStatus: 'Verified Official FPSC Advertisement',
      status: 'open', // Erroneously tagged open
    };

    const evaluation = evaluateJobStatus(expiredLecturer, testNow);
    assert.equal(evaluation.status, 'expired', 'Expired Lecturer ad must evaluate as expired');
    assert.equal(evaluation.isCurrent, false);
    assert.match(evaluation.reason, /deadline.*passed/i);

    upsertOfficialJob(expiredLecturer);
    const openJobs = getCurrentOpenJobs({ nowMs: testNow });
    assert.ok(
      !openJobs.some((j) => j.caseNumber === 'F.4-EXP-LEC-2025/2026-R'),
      'Expired Lecturer ad must not appear in current open vacancies'
    );
  });

  // Requirement 6: A record with no trustworthy source is sent for verification or excluded
  it('Requirement 6: A record with no trustworthy source is sent for verification or excluded', () => {
    // 6A: Missing source URL
    const missingSourceJob = {
      caseNumber: 'F.4-NOSOURCE/2026-R',
      title: 'Lecturer in Chemistry (BS-17)',
      closingDate: '25 December 2026',
      officialSourceUrl: '',
      verificationStatus: 'Verified Official FPSC',
    };
    const evalMissing = evaluateJobStatus(missingSourceJob);
    assert.equal(evalMissing.status, 'unverified');
    assert.equal(evalMissing.isCurrent, false);

    // 6B: Pending administrative verification
    const pendingJob = {
      caseNumber: 'F.4-PENDING/2026-R',
      title: 'Lecturer in Urdu (BS-17)',
      closingDate: '25 December 2026',
      officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/pending-gazette',
      verificationStatus: 'pending_verification',
    };
    const evalPending = evaluateJobStatus(pendingJob);
    assert.equal(evalPending.status, 'pending_verification');
    assert.equal(evalPending.isCurrent, false);
    assert.match(evalPending.reason, /pending verification/i);

    // Ensure both are excluded from current jobs
    const openJobs = getCurrentOpenJobs();
    assert.ok(!openJobs.some((j) => j.caseNumber === 'F.4-NOSOURCE/2026-R'));
    assert.ok(!openJobs.some((j) => j.caseNumber === 'F.4-PENDING/2026-R'));
  });

  // Requirement 7: A genuine Lecturer practice-question bank remains available with no current vacancies
  it('Requirement 7: A genuine Lecturer practice-question bank remains available with no current vacancies', async () => {
    // Verify Computer Science questions for Lecturer CS preparation are 100% available
    const resCs = await questionService.getQuestions({ subject: 'Computer Science' });
    assert.ok(Array.isArray(resCs.data));
    assert.ok(resCs.data.length > 0, 'Computer Science question bank must not be empty');

    const first = resCs.data[0];
    assert.ok(first.id);
    assert.ok(first.question);
    assert.ok(Array.isArray(first.options));
    assert.equal(first.options.length, 4);
    assert.ok(first.explanation);

    // Verify answer checking still operates deterministically
    const checkRes = await questionService.checkAnswer(first.id, first.options[first.correctAnswer]);
    assert.equal(typeof checkRes.isCorrect, 'boolean');
  });

  // Requirement 8: The Study Buddy does not invent Lecturer advertisements
  it('Requirement 8: The Study Buddy does not invent Lecturer advertisements', async () => {
    // 8A: Intent classification
    const intent = classifyQueryIntent('Are there any Lecturer jobs open in FPSC?');
    assert.equal(intent.type, 'lecturer_inquiry');

    // 8B: Answer synthesis
    const res = await answerStudentQuery({ query: 'Are there any Lecturer jobs open in FPSC?' });
    assert.ok(res.answer);

    // Must truthfully state that no active Lecturer advertisement is currently accepting applications
    assert.match(
      res.answer,
      /(no (verified )?active advertisements?|no active advertisement for Lecturer)/i,
      'Must truthfully report no active Lecturer advertisement'
    );

    // Must explain official verification policy or source
    assert.match(
      res.answer,
      /(verified publication policy|approved Gazette publications|official FPSC portal|verified active advertisements)/i,
      'Must explain official publication safeguard'
    );

    // Must provide general eligibility criteria for future candidate guidance
    assert.match(res.answer, /Master's degree|16 years education/i, 'Must explain eligibility');
    assert.match(res.answer, /22 to 28 years/i, 'Must state age criteria');

    // Must NEVER hallucinate that applications can currently be submitted for fake ads
    assert.doesNotMatch(res.answer, /Advt\. No\. 10\/2026.*currently accepting applications/i);

    // Zero false citations
    assert.equal(res.sources.length, 0, 'No fake advertisement citations should be attached');
  });

  // Requirement 9: Source-fetching failures do not trigger fabricated jobs
  it('Requirement 9: Source-fetching failures do not trigger fabricated jobs', async () => {
    // When client-side fallback runs without network
    const fallbackJobs = await fpscService.getJobs({ status: 'open' });
    assert.ok(Array.isArray(fallbackJobs.data));

    // Fallback must NOT return the unverified Lecturer demo record as open
    assert.ok(
      !fallbackJobs.data.some((j) => j.caseNumber === 'F.4-110/2026-R'),
      'Client-side fallback must never show unverified Lecturer job as open'
    );
    assert.ok(
      !fallbackJobs.data.some((j) => j.status === 'unverified'),
      'Client-side fallback must never return unverified status jobs under status=open'
    );
  });

  // Requirement 10: The existing website build, Supabase functionality and other commission listings continue to work
  it('Requirement 10: The existing website build, Supabase functionality and other commission listings continue to work', () => {
    // Verify commissions catalog is intact
    assert.ok(Array.isArray(commissions));
    assert.ok(commissions.length >= 6);

    const fpsc = commissions.find((c) => c.code === 'FPSC' || c.id === 'fpsc');
    assert.ok(fpsc);
    assert.equal(fpsc.name, 'Federal Public Service Commission');

    const ppsc = commissions.find((c) => c.code === 'PPSC' || c.id === 'ppsc');
    assert.ok(ppsc);
    assert.match(ppsc.description, /Lecturers/i, 'PPSC description references provincial lecturer exams');

    // Verify historical FPSC records remain intact
    const allJobs = getAllJobs({ status: 'all' });
    const customs = allJobs.find((j) => j.caseNumber === 'F.4-02/2026-R');
    assert.ok(customs, 'Inspector Customs historical record must remain in catalog');
    assert.equal(customs.status, 'expired');

    const fia = allJobs.find((j) => j.caseNumber === 'F.4-15/2026-R');
    assert.ok(fia, 'FIA historical record must remain in catalog');
    assert.equal(fia.status, 'expired');
  });
});

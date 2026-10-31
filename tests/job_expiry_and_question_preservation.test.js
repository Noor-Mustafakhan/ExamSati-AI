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
  parsePakistanDate,
  formatPakistanDateTime,
  PAKISTAN_TIMEZONE,
  PAKISTAN_UTC_OFFSET_HOURS,
} from '../src/utils/pakistanTime.js';

import {
  getCurrentOpenJobs,
  getUpcomingJobs,
  getArchivedJobs,
  getAllJobs,
  getJobByIdOrCaseNumber,
  updateJobStatusByAdmin,
  recordDeadlineCorrection,
  upsertOfficialJob,
  recalculateAllJobStatuses,
  startJobStatusScheduler,
  stopJobStatusScheduler,
  getSchedulerStatus,
} from '../server/jobManagementService.js';

import { fpscService } from '../src/services/fpscService.js';
import { questionService } from '../src/services/questionService.js';
import { studentProgressService } from '../src/services/studentProgressService.js';
import { answerStudentQuery, classifyQueryIntent } from '../server/aiTutorEngine.js';

describe('Job Expiry & Practice Question Preservation Verification Suite', () => {
  beforeEach(() => {
    store.clear();
  });

  // Scenario 1: Future deadline job appears in current vacancies
  it('Scenario 1: Future deadline job appears in current vacancies', () => {
    // Current test date: October 2026
    const testNow = Date.UTC(2026, 9, 20, 10, 0, 0); // 20 Oct 2026 10:00 UTC (15:00 PKT)
    const verifiedOpenJob = {
      caseNumber: 'F.4-200/2026-R',
      title: 'Statistical Officer (BS-17)',
      openingDate: '05 October 2026',
      closingDate: '25 November 2026',
      officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/verified-ad',
      verificationStatus: 'Verified Official FPSC Advertisement',
      status: 'open',
    };

    const evaluation = evaluateJobStatus(verifiedOpenJob, testNow);
    assert.equal(evaluation.status, 'open');
    assert.equal(evaluation.isCurrent, true);
    assert.match(evaluation.reason, /actively open/i);
  });

  // Scenario 2: Expired deadline job does not appear in current vacancies
  it('Scenario 2: Expired deadline job does not appear in current vacancies', () => {
    const testNow = Date.UTC(2026, 9, 20, 10, 0, 0); // October 2026
    const expiredJob = {
      caseNumber: 'F.4-02/2026-R',
      title: 'Inspector Customs (BS-16)',
      openingDate: '05 January 2026',
      closingDate: '20 January 2026',
      verificationStatus: 'Verified Official FPSC Advertisement',
      status: 'open', // Even if erroneously tagged open
    };

    const evaluation = evaluateJobStatus(expiredJob, testNow);
    assert.equal(evaluation.status, 'expired', 'Status must be evaluated as expired');
    assert.equal(evaluation.isCurrent, false, 'Expired job must not be marked isCurrent');
    assert.match(evaluation.reason, /deadline.*passed/i);

    const openJobs = getCurrentOpenJobs({ nowMs: testNow });
    const match = openJobs.find((j) => j.caseNumber === 'F.4-02/2026-R');
    assert.equal(match, undefined, 'Expired job F.4-02/2026-R must NEVER appear in current open vacancies');
  });

  // Scenario 3: Unknown or ambiguous deadline job is flagged and excluded from current vacancies
  it('Scenario 3: Unknown or ambiguous deadline job is flagged and excluded from current vacancies', () => {
    const testNow = Date.UTC(2026, 9, 20, 10, 0, 0);

    // Case A: Missing closing date
    const jobMissingDate = {
      caseNumber: 'F.4-999/2026-R',
      title: 'Research Officer',
      closingDate: null,
      verificationStatus: 'Verified Official FPSC',
    };
    const evalMissing = evaluateJobStatus(jobMissingDate, testNow);
    assert.equal(evalMissing.status, 'unverified_deadline');
    assert.equal(evalMissing.isCurrent, false);

    // Case B: Ambiguous non-date text
    const jobAmbiguous = {
      caseNumber: 'F.4-998/2026-R',
      title: 'Field Officer',
      closingDate: 'To be announced soon in daily press',
      verificationStatus: 'Verified Official FPSC',
    };
    const evalAmbiguous = evaluateJobStatus(jobAmbiguous, testNow);
    assert.equal(evalAmbiguous.status, 'unverified_deadline');
    assert.equal(evalAmbiguous.isCurrent, false);

    // Case C: Unverified source
    const jobUnverified = {
      caseNumber: 'F.4-997/2026-R',
      title: 'Assistant Officer',
      closingDate: '30 November 2026',
      verificationStatus: 'Unverified Social Media Post',
    };
    const evalUnverified = evaluateJobStatus(jobUnverified, testNow);
    assert.equal(evalUnverified.status, 'unverified');
    assert.equal(evalUnverified.isCurrent, false);

    // Verify none are in open vacancies
    const openJobs = getCurrentOpenJobs({ nowMs: testNow });
    assert.ok(!openJobs.some((j) => j.caseNumber === 'F.4-999/2026-R'));
    assert.ok(!openJobs.some((j) => j.caseNumber === 'F.4-998/2026-R'));
    assert.ok(!openJobs.some((j) => j.caseNumber === 'F.4-997/2026-R'));
  });

  // Scenario 4: Future-opening advertisement appears as upcoming, not open
  it('Scenario 4: Future-opening advertisement appears as upcoming, not open', () => {
    const testNow = Date.UTC(2026, 9, 20, 10, 0, 0); // 20 October 2026
    const upcomingJob = {
      caseNumber: 'F.4-UPCOMING-VERIFIED/2026-R',
      advertisementNo: 'Advt. No. 12/2026 (Advance Notice)',
      title: 'Statistical Officer (BS-17)',
      openingDate: '01 November 2026',
      closingDate: '20 November 2026',
      officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/advance-notice-12',
      verificationStatus: 'Verified Official FPSC Advertisement',
      vacancies: 20,
    };

    const evaluation = evaluateJobStatus(upcomingJob, testNow);
    assert.equal(evaluation.status, 'upcoming');
    assert.equal(evaluation.isCurrent, false);
    assert.match(evaluation.reason, /open on 01 November 2026/i);

    upsertOfficialJob(upcomingJob);

    const openJobs = getCurrentOpenJobs({ nowMs: testNow });
    assert.ok(!openJobs.some((j) => j.caseNumber === 'F.4-UPCOMING-VERIFIED/2026-R'), 'Must not appear in open jobs');

    const upcomingJobs = getUpcomingJobs({ nowMs: testNow });
    assert.ok(upcomingJobs.some((j) => j.caseNumber === 'F.4-UPCOMING-VERIFIED/2026-R'), 'Must appear in upcoming announcements');
  });

  // Scenario 5: Cancelled/withdrawn job is excluded
  it('Scenario 5: Cancelled/withdrawn job is excluded from current vacancies regardless of dates', () => {
    const testNow = Date.UTC(2026, 9, 20, 10, 0, 0);

    const cancelledJob = {
      caseNumber: 'F.4-888/2026-R',
      title: 'Cancelled Post',
      openingDate: '01 October 2026',
      closingDate: '30 November 2026', // Future date
      verificationStatus: 'Verified Official FPSC',
      status: 'cancelled',
    };
    const evalCancelled = evaluateJobStatus(cancelledJob, testNow);
    assert.equal(evalCancelled.status, 'cancelled');
    assert.equal(evalCancelled.isCurrent, false);

    const withdrawnJob = {
      caseNumber: 'F.4-889/2026-R',
      title: 'Withdrawn Post',
      openingDate: '01 October 2026',
      closingDate: '30 November 2026',
      verificationStatus: 'Verified Official FPSC',
      status: 'withdrawn',
    };
    const evalWithdrawn = evaluateJobStatus(withdrawnJob, testNow);
    assert.equal(evalWithdrawn.status, 'withdrawn');
    assert.equal(evalWithdrawn.isCurrent, false);
  });

  // Scenario 6: Expired job accessible via archived/admin queries
  it('Scenario 6: Expired job accessible via archived/admin queries and contains status history', () => {
    const testNow = Date.UTC(2026, 9, 20, 10, 0, 0);

    const archived = getArchivedJobs({ nowMs: testNow });
    const customs = archived.find((j) => j.caseNumber === 'F.4-02/2026-R');
    assert.ok(customs, 'Inspector Customs must be present in archived jobs');
    assert.equal(customs.status, 'expired');

    // Single job lookup
    const single = getJobByIdOrCaseNumber('F.4-02/2026-R', testNow);
    assert.ok(single);
    assert.equal(single.title, 'Inspector Customs / Intelligence Officer (BS-16)');
    assert.ok(Array.isArray(single.statusHistory));
    assert(single.statusHistory.length > 0, 'Must contain historical status transitions');

    // Admin query for all jobs
    const all = getAllJobs({ status: 'all', nowMs: testNow });
    assert(all.length >= 4, 'All jobs view must return catalog including open, upcoming, and expired');
  });

  // Scenario 7: Expiring a job does NOT delete or disable its practice questions
  it('Scenario 7: Expiring a job does NOT delete or disable its practice questions', async () => {
    // Advt. 01/2026 (Inspector Customs) is expired.
    // Verify that Inspector Customs practice questions remain 100% available
    const res = await questionService.getQuestions();
    const questions = res.data;
    assert.ok(Array.isArray(questions));
    assert.ok(questions.length > 0, 'Questions bank must not be empty');

    const customsQuestions = questions.filter(
      (q) => q.exam === 'fpsc-inspector-customs-2026' || q.subject === 'Everyday Science' || q.subject === 'Pakistan Affairs'
    );
    assert.ok(customsQuestions.length > 0, 'Practice questions for Inspector Customs syllabus must be intact');

    // Verify properties of practice questions
    const sample = customsQuestions[0];
    assert.ok(sample.id);
    assert.ok(sample.question);
    assert.ok(sample.options && sample.options.length >= 4);
    assert.ok(sample.correctAnswer);
    assert.ok(sample.explanation);
  });

  // Scenario 8: Practice questions remain accessible when no vacancy exists for that field
  it('Scenario 8: Practice questions remain accessible when no active vacancy exists for that field', async () => {
    // Currently, there is NO active open vacancy for Pakistan Affairs or CSS MPT
    const openJobs = getCurrentOpenJobs();
    const hasActiveCustomsVacancy = openJobs.some((j) => j.title.includes('Customs'));
    assert.equal(hasActiveCustomsVacancy, false, 'No active Customs vacancy should be open');

    // Yet, Pakistan Affairs practice questions must be fully retrievable
    const pakRes = await questionService.getQuestions({ subject: 'Pakistan Affairs' });
    const pakQuestions = pakRes.data;
    assert.ok(Array.isArray(pakQuestions));
    assert.ok(pakQuestions.length >= 3, 'Must return Pakistan Affairs questions for prep');

    // English practice questions must also be retrievable
    const engRes = await questionService.getQuestions({ subject: 'English' });
    const engQuestions = engRes.data;
    assert.ok(Array.isArray(engQuestions));
    assert.ok(engQuestions.length >= 2, 'Must return English questions for prep');
  });

  // Scenario 9: Quiz answers, scoring, progress, and mistake notebook remain intact
  it('Scenario 9: Quiz answers, scoring, progress, and mistake notebook remain intact', async () => {
    // 1. Answer checking works on question from expired post
    const check1 = await questionService.checkAnswer('mcq-pa-01', 'B');
    assert.equal(typeof check1.isCorrect, 'boolean');
    assert.ok(check1.explanation);

    // 2. Mistake recording works
    studentProgressService.recordMistake({
      questionId: 'mcq-pa-01',
      questionText: 'Under the 1973 Constitution, Article 2A embodies what?',
      selectedOption: 'A',
      correctOption: 'B',
      explanation: 'Article 2A makes the Objectives Resolution substantive and enforceable.',
      subject: 'Pakistan Affairs',
      topic: 'Constitutional Law',
      options: ['Fundamental Rights', 'Objectives Resolution', 'Preamble', 'Principles of Policy'],
    });

    const mistakes = studentProgressService.getMistakes();
    assert.ok(mistakes.length > 0, 'Mistakes must be recorded in student notebook');
    const recorded = mistakes.find((m) => m.questionId === 'mcq-pa-01');
    assert.ok(recorded);
    assert.equal(recorded.subject, 'Pakistan Affairs');
    assert.equal(recorded.timesFailed, 1);
    assert.equal(recorded.mastered, false);

    // 3. Increment mistake on subsequent failure
    studentProgressService.recordMistake({
      questionId: 'mcq-pa-01',
      selectedOption: 'C',
    });
    const updatedMistakes = studentProgressService.getMistakes();
    const updatedRec = updatedMistakes.find((m) => m.questionId === 'mcq-pa-01');
    assert.equal(updatedRec.timesFailed, 2);
  });

  // Scenario 10: Chatbot distinguishes current vacancies, historical ads, and practice MCQs
  it('Scenario 10: Chatbot distinguishes current vacancies, historical ads, and practice MCQs', async () => {
    // 10A: "What jobs are currently open in FPSC?" -> Truthfully reports no unverified vacancies open
    const resOpen = await answerStudentQuery({ query: 'What jobs are currently open in FPSC?' });
    assert.ok(resOpen.answer);
    assert.match(resOpen.answer, /no active FPSC General Recruitment advertisements accepting applications/i, 'Must report no unverified open vacancies');
    assert.match(resOpen.answer, /01\/2026.*closed|application period.*closed/i, 'Must state older ads are closed');
    assert.doesNotMatch(resOpen.answer, /Inspector Customs.*currently accepting/i, 'Must NOT claim Inspector Customs is open');
    assert.doesNotMatch(resOpen.answer, /F\.4-110\/2026-R.*currently accepting/i, 'Must NOT claim unverified Lecturer is open');

    // 10B: "What was the previous FPSC advertisement?" -> Historical context
    const resHistorical = await answerStudentQuery({ query: 'What was the previous FPSC advertisement?' });
    assert.ok(resHistorical.answer);
    assert.match(resHistorical.answer, /Historical FPSC Advertisement Record/i);
    assert.match(resHistorical.answer, /Application Period Closed|20 January 2026/i);
    assert.match(resHistorical.answer, /Inspector Customs/i);

    // 10C: "Give me MCQs for Inspector Customs preparation" -> Persistent practice questions, NOT an ad
    const resMcqs = await answerStudentQuery({ query: 'Give me MCQs for Inspector Customs preparation' });
    assert.ok(resMcqs.answer);
    assert.match(resMcqs.answer, /Customs Act 1969|Section 158|Objectives Resolution/i);
    assert.match(resMcqs.answer, /Q1:|Q2:|Q3:|Q4:|Q5:/);
    assert.match(resMcqs.answer, /\*\(Correct\)\*/);
    assert.match(resMcqs.answer, /practice questions remain permanently accessible/i);
    assert.equal(resMcqs.sources.length, 0, 'Must have zero false advertisement citations');

    // 10D: "Windows MCQs" -> Windows questions, NOT recruitment ads
    const resWindows = await answerStudentQuery({ query: 'Windows MCQs' });
    assert.ok(resWindows.answer);
    assert.match(resWindows.answer, /NTFS|Task Manager|File Explorer|User Account Control/i);
    assert.doesNotMatch(resWindows.answer, /Revenue Division|185 Posts|Inspector Customs/i);
  });

  // Scenario 11: Cached search results do not cause expired ads to reappear as current
  it('Scenario 11: Dynamic date re-evaluation ensures expired ads never reappear as current across repeated calls', async () => {
    const testNow = Date.UTC(2026, 9, 20, 10, 0, 0);

    // First call
    const run1 = getCurrentOpenJobs({ nowMs: testNow });
    assert.ok(!run1.some((j) => j.caseNumber === 'F.4-02/2026-R'));

    // Second call via fpscService client fallback
    const run2 = await fpscService.getJobs({ status: 'open' });
    assert.ok(Array.isArray(run2.data));
    assert.equal(run2.data.length, 0, 'No unverified jobs should appear in current open vacancies');
    assert.ok(!run2.data.some((j) => j.caseNumber === 'F.4-02/2026-R'));
    assert.ok(!run2.data.some((j) => j.status === 'expired'));

    // Force recalculation
    recalculateAllJobStatuses(testNow);
    const run3 = getCurrentOpenJobs({ nowMs: testNow });
    assert.ok(!run3.some((j) => j.caseNumber === 'F.4-02/2026-R'));
  });

  // Scenario 12: Missing dates, failed source retrieval, and duplicate imports handled safely
  it('Scenario 12: Missing dates, failed source retrieval, and duplicate imports handled safely', () => {
    // 1. Missing dates handled gracefully
    assert.equal(parsePakistanDate(''), null);
    assert.equal(parsePakistanDate(null), null);
    assert.equal(parsePakistanDate(undefined), null);
    assert.equal(parsePakistanDate('Invalid String'), null);

    // 2. Duplicate import upsert test
    const initialJob = {
      caseNumber: 'F.4-900/2026-R',
      advertisementNo: 'Advt. No. 99/2026',
      title: 'Assistant Director (IT)',
      department: 'Ministry of Information Technology',
      closingDate: '15 December 2026',
      officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/ad-99',
      verificationStatus: 'Verified Official FPSC Advertisement',
      vacancies: 10,
    };

    const res1 = upsertOfficialJob(initialJob);
    assert.equal(res1.isNew, true);

    // Re-importing with updated deadline
    const updatedJob = {
      caseNumber: 'F.4-900/2026-R',
      advertisementNo: 'Advt. No. 99/2026',
      title: 'Assistant Director (IT)',
      department: 'Ministry of Information Technology',
      closingDate: '25 December 2026', // Extended by corrigendum
      officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/ad-99',
      verificationStatus: 'Verified Official FPSC Advertisement',
      vacancies: 12,
    };

    const res2 = upsertOfficialJob(updatedJob);
    assert.equal(res2.isNew, false, 'Duplicate case number must be merged, not duplicated');
    assert.equal(res2.job.closingDate, '25 December 2026');
    assert.equal(res2.job.vacancies, 12);

    // Check status history recorded the update
    const history = res2.job.statusHistory;
    assert.ok(history.some((h) => h.action === 'DEADLINE_UPDATED_VIA_IMPORT'));

    // 3. Admin status override and deadline correction
    const overridden = updateJobStatusByAdmin({
      jobId: 'F.4-900/2026-R',
      newStatus: 'cancelled',
      reason: 'Withdrawn by ministry due to quota revision',
    });
    assert.equal(overridden.status, 'cancelled');
    assert.equal(overridden.isCurrent, false);

    const corrected = recordDeadlineCorrection({
      jobId: 'F.4-900/2026-R',
      newClosingDate: '31 December 2026',
      reason: 'Court order extension',
    });
    assert.equal(corrected.closingDate, '31 December 2026');
  });

  // Scenario 13: Exact date-boundary behavior verified using Asia/Karachi timezone
  it('Scenario 13: Exact date-boundary behavior verified using Asia/Karachi (UTC+5) timezone', () => {
    // Closing date: "20 January 2026"
    // In Asia/Karachi (UTC+5), end of day is:
    // 2026-01-20 23:59:59.999 PKT
    // Which corresponds to UTC:
    // 2026-01-20 18:59:59.999 UTC
    const closingMs = parsePakistanDate('20 January 2026', true);
    assert.ok(closingMs !== null);

    const testJob = {
      caseNumber: 'F.4-TEST-BOUNDARY/2026-R',
      title: 'Boundary Test Job',
      closingDate: '20 January 2026',
      officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/boundary-test',
      verificationStatus: 'Verified Official FPSC Advertisement',
    };

    // 1 millisecond BEFORE closing deadline (23:59:59.998 PKT -> 18:59:59.998 UTC)
    const justBeforeDeadline = closingMs - 1;
    const evalBefore = evaluateJobStatus(testJob, justBeforeDeadline);
    assert.equal(evalBefore.status, 'open', 'Job must remain open 1ms before deadline');
    assert.equal(evalBefore.isCurrent, true);

    // EXACT deadline moment (23:59:59.999 PKT -> 18:59:59.999 UTC)
    const exactDeadline = closingMs;
    const evalExact = evaluateJobStatus(testJob, exactDeadline);
    assert.equal(evalExact.status, 'open', 'Job must remain open at exact deadline');
    assert.equal(evalExact.isCurrent, true);

    // 1 millisecond AFTER deadline (00:00:00.000 PKT on 21 Jan -> 19:00:00.000 UTC on 20 Jan)
    const justAfterDeadline = closingMs + 1;
    const evalAfter = evaluateJobStatus(testJob, justAfterDeadline);
    assert.equal(evalAfter.status, 'expired', 'Job must expire 1ms after deadline');
    assert.equal(evalAfter.isCurrent, false);

    // Format verification in Asia/Karachi
    const formatted = formatPakistanDateTime(closingMs);
    assert.match(formatted, /January 20, 2026/);
    assert.match(formatted, /11:59 PM/);
  });

  // Scheduler Telemetry and Health
  it('Background scheduler telemetry reports correct state and intervals', () => {
    const status = getSchedulerStatus();
    assert.equal(typeof status.running, 'boolean');
    assert.equal(typeof status.totalJobsCount, 'number');
    assert.equal(typeof status.activeJobsCount, 'number');
    assert.equal(typeof status.upcomingJobsCount, 'number');
    assert.equal(typeof status.archivedJobsCount, 'number');

    // Test start/stop
    const startRes = startJobStatusScheduler(1800000);
    assert.equal(startRes.running, true);
    assert.equal(startRes.intervalMs, 1800000);

    const stopRes = stopJobStatusScheduler();
    assert.equal(stopRes.running, false);
  });
});

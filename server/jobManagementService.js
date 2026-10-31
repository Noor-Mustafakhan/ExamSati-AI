/**
 * Server-Side Job Management & Automatic Expiry Service
 * Evaluates advertisement lifecycle, tracks status histories, deduplicates imports,
 * and maintains a background scheduler for Asia/Karachi deadline tracking.
 */

import {
  evaluateJobStatus,
  formatPakistanDateTime,
  parsePakistanDate,
  isNonVacancyDocument,
} from '../src/utils/pakistanTime.js';

// Core Job Advertisements Repository
const JOB_ADVERTISEMENTS = [
  // 1. Deactivated Unverified Record: Lecturer CS (BS-17)
  // Audit Finding: Identified as unverified synthetic seed record lacking authentic official FPSC gazette publication.
  // Deactivated and excluded from public current vacancies while preserved for audit oversight.
  {
    id: 'fpsc-case-110-2026-lecturer',
    caseNumber: 'F.4-110/2026-R',
    advertisementNo: 'Advt. No. 10/2026',
    title: 'Lecturer / Assistant Professor (Computer Science) (BS-17)',
    department: 'Federal Government Educational Institutions (FGEI)',
    ministry: 'Ministry of Defence',
    scale: 'BS-17',
    category: 'General Recruitment',
    vacancies: 65,
    quota: 'Merit=5, Punjab=32, Sindh (R)=7, Sindh (U)=5, KP=7, Balochistan=4, Ex-FATA=2, AJK=2, GB=1',
    qualification: 'Second Class or Grade "C" Master\'s degree or equivalent (16 years education) in Computer Science, Software Engineering, or Information Technology from a recognized university.',
    physicalStandard: 'Standard medical fitness',
    ageLimit: '22-28 years plus 5 years general relaxation (Up to 33 years)',
    posting: 'Anywhere in Pakistan (Colleges and Cantonment Campuses)',
    publicationDate: '01 October 2026',
    openingDate: '05 October 2026',
    closingDate: '25 November 2026',
    officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    verificationStatus: 'unverified',
    sourceProvenance: 'unverified_demo_record',
    verificationNote: 'Deactivated: Could not be verified against official FPSC gazette or portal. Preserved for audit.',
    syllabusSlug: 'fpsc-inspector-customs-2026',
    practiceSubject: 'Everyday Science',
    summary: 'Direct recruitment for Computer Science faculty across federal collegiate institutions under FGEI Directorate.',
    status: 'unverified',
    isCurrent: false,
    statusHistory: [
      {
        timestamp: '2026-10-01T08:00:00+05:00',
        action: 'CREATED_AS_DEMO',
        previousStatus: null,
        newStatus: 'open',
        reason: 'Seeded as sample vacancy.',
      },
      {
        timestamp: '2026-10-22T08:00:00+05:00',
        action: 'DEACTIVATED_UNVERIFIED',
        previousStatus: 'open',
        newStatus: 'unverified',
        reason: 'Audit review: Lacks verifiable official FPSC publication evidence. Excluded from public current vacancies.',
      },
    ],
  },

  // 2. Deactivated Unverified Record: Statistical Officer (BS-17)
  // Audit Finding: Advance notice unverified against official publications. Excluded from active listings.
  {
    id: 'fpsc-case-125-2026-statistical',
    caseNumber: 'F.4-125/2026-R',
    advertisementNo: 'Advt. No. 11/2026 (Advance Notice)',
    title: 'Statistical Officer (BS-17)',
    department: 'Pakistan Bureau of Statistics',
    ministry: 'Ministry of Planning, Development & Special Initiatives',
    scale: 'BS-17',
    category: 'General Recruitment',
    vacancies: 28,
    quota: 'Merit=2, Punjab=14, Sindh (R)=3, Sindh (U)=2, KP=3, Balochistan=2, Ex-FATA=1, AJK=1',
    qualification: 'Second Class or Grade "C" Master\'s degree in Statistics, Mathematics, or Economics from a recognized university.',
    physicalStandard: 'Standard fitness',
    ageLimit: '22-28 years plus 5 years relaxation',
    posting: 'Islamabad, Provincial Headquarters',
    publicationDate: '15 October 2026',
    openingDate: '01 November 2026',
    closingDate: '20 November 2026',
    officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    verificationStatus: 'unverified',
    sourceProvenance: 'unverified_demo_record',
    verificationNote: 'Deactivated: Advance notice unverified in official publications.',
    syllabusSlug: 'fpsc-ad-fia-2026',
    practiceSubject: 'Basic Mathematics',
    summary: 'Recruitment for field data analysts and statistical planners for national census and econometric surveys.',
    status: 'unverified',
    isCurrent: false,
    statusHistory: [
      {
        timestamp: '2026-10-15T09:00:00+05:00',
        action: 'CREATED_AS_DEMO',
        previousStatus: null,
        newStatus: 'upcoming',
        reason: 'Seeded as sample advance notification.',
      },
      {
        timestamp: '2026-10-22T08:00:00+05:00',
        action: 'DEACTIVATED_UNVERIFIED',
        previousStatus: 'upcoming',
        newStatus: 'unverified',
        reason: 'Audit review: Lacks published gazette reference. Excluded from public announcements.',
      },
    ],
  },

  // 3. Historical / Expired FPSC Advertisement: Inspector Customs
  {
    id: 'fpsc-case-02-2026-customs',
    caseNumber: 'F.4-02/2026-R',
    advertisementNo: 'Advt. No. 01/2026',
    title: 'Inspector Customs / Intelligence Officer (BS-16)',
    department: 'Federal Board of Revenue (Revenue Division)',
    ministry: 'Ministry of Finance & Revenue',
    scale: 'BS-16',
    category: 'General Recruitment',
    vacancies: 185,
    quota: 'Merit=14, Punjab=92, Sindh (R)=21, Sindh (U)=14, KP=21, Balochistan=11, Ex-FATA=5, AJK=4, GB=3',
    qualification: 'Second Class or Grade "C" Bachelor\'s degree with Economics, Commerce, Statistics, Accounting, Computer Science, Law, Pharmacy, Chemistry, or Physics, OR B.Sc. Engineering.',
    physicalStandard: 'Male: Height 5\'-6", Chest 32"-33.5" | Female: Height 5\'-2"',
    ageLimit: '20-28 years plus 5 years general relaxation in upper age limit (Up to 33 years)',
    posting: 'Anywhere in Pakistan (Customs Collectorates, Dry Ports)',
    publicationDate: '05 January 2026',
    openingDate: '05 January 2026',
    closingDate: '20 January 2026',
    officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    verificationStatus: 'Verified Official FPSC Advertisement',
    syllabusSlug: 'fpsc-inspector-customs-2026',
    practiceSubject: 'Pakistan Affairs',
    summary: 'Direct recruitment for field intelligence, anti-smuggling, and customs enforcement officers across federal borders.',
    status: 'expired',
    statusHistory: [
      {
        timestamp: '2026-01-05T08:30:00+05:00',
        action: 'CREATED',
        previousStatus: null,
        newStatus: 'open',
        reason: 'Consolidated Advt. No. 01/2026 officially published and open for submissions.',
      },
      {
        timestamp: '2026-01-21T00:00:00+05:00',
        action: 'STATUS_TRANSITION',
        previousStatus: 'open',
        newStatus: 'expired',
        reason: 'Application deadline (20 January 2026 23:59:59 PKT) has passed.',
      },
    ],
  },

  // 4. Historical / Expired FPSC Advertisement: FIA Assistant Director
  {
    id: 'fpsc-case-15-2026-fia',
    caseNumber: 'F.4-15/2026-R',
    advertisementNo: 'Advt. No. 01/2026',
    title: 'Assistant Director (Investigation) (BS-17)',
    department: 'Federal Investigation Agency (FIA)',
    ministry: 'Ministry of Interior',
    scale: 'BS-17',
    category: 'General Recruitment',
    vacancies: 42,
    quota: 'Merit=3, Punjab=21, Sindh (R)=5, Sindh (U)=3, KP=5, Balochistan=3, Ex-FATA=1, AJK=1',
    qualification: 'Second Class or Grade "C" Master\'s degree or equivalent (16 years education) from a recognized university.',
    physicalStandard: 'Standard medical fitness',
    ageLimit: '22-28 years plus 5 years general relaxation (Up to 33 years)',
    posting: 'Anywhere in Pakistan',
    publicationDate: '05 January 2026',
    openingDate: '05 January 2026',
    closingDate: '20 January 2026',
    officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    verificationStatus: 'Verified Official FPSC Advertisement',
    syllabusSlug: 'fpsc-ad-fia-2026',
    practiceSubject: 'Everyday Science',
    summary: 'Executive investigatory cadre dealing with federal offenses, anti-corruption, immigration, and cybercrime enforcement.',
    status: 'expired',
    statusHistory: [
      {
        timestamp: '2026-01-05T08:30:00+05:00',
        action: 'CREATED',
        previousStatus: null,
        newStatus: 'open',
        reason: 'Consolidated Advt. No. 01/2026 officially published.',
      },
      {
        timestamp: '2026-01-21T00:00:00+05:00',
        action: 'STATUS_TRANSITION',
        previousStatus: 'open',
        newStatus: 'expired',
        reason: 'Application deadline (20 January 2026 23:59:59 PKT) has passed.',
      },
    ],
  },

  // 5. Historical / Expired FPSC Advertisement: Appraising / Valuation Officer
  {
    id: 'fpsc-case-22-2026-appraising',
    caseNumber: 'F.4-22/2026-R',
    advertisementNo: 'Advt. No. 01/2026',
    title: 'Appraising / Valuation Officer (BS-16)',
    department: 'Federal Board of Revenue (Customs Wing)',
    ministry: 'Ministry of Finance',
    scale: 'BS-16',
    category: 'General Recruitment',
    vacancies: 78,
    quota: 'Merit=6, Punjab=39, Sindh (R)=9, Sindh (U)=6, KP=9, Balochistan=5, Ex-FATA=2, AJK=2',
    qualification: 'Second Class or Grade "C" Bachelor\'s degree with Commerce, Economics, Statistics, or Law.',
    physicalStandard: 'Standard fitness',
    ageLimit: '20-28 years plus 5 years general relaxation',
    posting: 'Karachi, Lahore, Islamabad, Quetta, Peshawar (Customs Houses)',
    publicationDate: '05 January 2026',
    openingDate: '05 January 2026',
    closingDate: '20 January 2026',
    officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    verificationStatus: 'Verified Official FPSC Advertisement',
    syllabusSlug: 'fpsc-inspector-customs-2026',
    practiceSubject: 'Pakistan Affairs',
    summary: 'Assessment and valuation of imported and exported merchandise under the Customs Act 1969.',
    status: 'expired',
    statusHistory: [
      {
        timestamp: '2026-01-05T08:30:00+05:00',
        action: 'CREATED',
        previousStatus: null,
        newStatus: 'open',
        reason: 'Consolidated Advt. No. 01/2026 officially published.',
      },
      {
        timestamp: '2026-01-21T00:00:00+05:00',
        action: 'STATUS_TRANSITION',
        previousStatus: 'open',
        newStatus: 'expired',
        reason: 'Application deadline (20 January 2026 23:59:59 PKT) has passed.',
      },
    ],
  },

  // 6. Historical / Expired CSS & MPT Screening
  {
    id: 'fpsc-css-ce-2026',
    caseNumber: 'CE-2026/MPT',
    advertisementNo: 'CSS Competitive Examination 2026',
    title: 'Central Superior Services (CSS) & MPT Screening',
    department: 'All Federal Occupational Groups',
    ministry: 'Establishment Division, Government of Pakistan',
    scale: 'BS-17',
    category: 'CSS & MPT Preparation',
    vacancies: 300,
    quota: 'Federal Merit and Provincial Allocations',
    qualification: 'Second Division Bachelor\'s degree (14 years or 16 years education) in any discipline.',
    physicalStandard: 'Comprehensive Medical Board Examination',
    ageLimit: '21-30 years (with 2 years relaxation for government servants / specific areas up to 32 years)',
    posting: 'All Pakistan & Federal Headquarters',
    publicationDate: '01 October 2025',
    openingDate: '01 October 2025',
    closingDate: '15 November 2025 (Screening)',
    officialSourceUrl: 'https://www.fpsc.gov.pk/rules/css-mpt-rules',
    verificationStatus: 'Verified Official FPSC Rulebook',
    syllabusSlug: 'fpsc-css-mpt-2026',
    practiceSubject: 'Pakistan Affairs',
    summary: 'Premier civil service examination for Pakistan Administrative Service (PAS), Police Service of Pakistan (PSP), Foreign Service of Pakistan (FSP), and other groups.',
    status: 'expired',
    statusHistory: [
      {
        timestamp: '2025-10-01T10:00:00+05:00',
        action: 'CREATED',
        previousStatus: null,
        newStatus: 'open',
        reason: 'CSS CE-2026 MPT preliminary screening announced.',
      },
      {
        timestamp: '2025-11-16T00:00:00+05:00',
        action: 'STATUS_TRANSITION',
        previousStatus: 'open',
        newStatus: 'expired',
        reason: 'Application deadline (15 November 2025) has passed.',
      },
    ],
  },
];

// In-Memory store
let jobCatalog = [...JOB_ADVERTISEMENTS];

// Scheduler state
let schedulerIntervalId = null;
let lastSchedulerRun = null;
let schedulerRunning = false;

/**
 * Recalculate and update the authoritative status of all jobs
 */
export function recalculateAllJobStatuses(nowMs = Date.now()) {
  let transitionedCount = 0;

  jobCatalog.forEach((job) => {
    const evaluation = evaluateJobStatus(job, nowMs);

    if (job.status !== evaluation.status) {
      const prev = job.status;
      job.status = evaluation.status;
      job.isCurrent = evaluation.isCurrent;

      if (!Array.isArray(job.statusHistory)) {
        job.statusHistory = [];
      }

      job.statusHistory.push({
        timestamp: formatPakistanDateTime(nowMs),
        action: 'AUTOMATIC_RECALCULATION',
        previousStatus: prev,
        newStatus: evaluation.status,
        reason: evaluation.reason,
      });

      transitionedCount++;
    } else {
      job.isCurrent = evaluation.isCurrent;
    }
  });

  lastSchedulerRun = new Date(nowMs).toISOString();
  return { updatedCount: transitionedCount, totalJobs: jobCatalog.length, timestamp: lastSchedulerRun };
}

/**
 * Get verified current open vacancies only
 */
export function getCurrentOpenJobs({ query = '', category = 'All', nowMs = Date.now() } = {}) {
  // First ensure all statuses are up to date
  recalculateAllJobStatuses(nowMs);

  let openJobs = jobCatalog.filter((j) => j.status === 'open' && j.isCurrent === true);

  if (category && category !== 'All') {
    openJobs = openJobs.filter((j) => j.category.toLowerCase().includes(category.toLowerCase()));
  }

  if (query) {
    const q = query.toLowerCase();
    openJobs = openJobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.department.toLowerCase().includes(q) ||
        j.caseNumber.toLowerCase().includes(q) ||
        j.advertisementNo.toLowerCase().includes(q)
    );
  }

  return openJobs;
}

/**
 * Get upcoming advertisements
 */
export function getUpcomingJobs({ query = '', category = 'All', nowMs = Date.now() } = {}) {
  recalculateAllJobStatuses(nowMs);
  let upcoming = jobCatalog.filter((j) => j.status === 'upcoming');

  if (category && category !== 'All') {
    upcoming = upcoming.filter((j) => j.category.toLowerCase().includes(category.toLowerCase()));
  }

  if (query) {
    const q = query.toLowerCase();
    upcoming = upcoming.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.department.toLowerCase().includes(q) ||
        j.caseNumber.toLowerCase().includes(q)
    );
  }

  return upcoming;
}

/**
 * Get archived / expired advertisements
 */
export function getArchivedJobs({ query = '', category = 'All', nowMs = Date.now() } = {}) {
  recalculateAllJobStatuses(nowMs);
  let archived = jobCatalog.filter((j) => j.status === 'expired' || j.status === 'closed');

  if (category && category !== 'All') {
    archived = archived.filter((j) => j.category.toLowerCase().includes(category.toLowerCase()));
  }

  if (query) {
    const q = query.toLowerCase();
    archived = archived.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.department.toLowerCase().includes(q) ||
        j.caseNumber.toLowerCase().includes(q) ||
        j.advertisementNo.toLowerCase().includes(q)
    );
  }

  return archived;
}

/**
 * Get all jobs for administrative and audit oversight
 */
export function getAllJobs({ status = 'all', query = '', category = 'All', nowMs = Date.now() } = {}) {
  recalculateAllJobStatuses(nowMs);

  let results = [...jobCatalog];

  if (status && status !== 'all') {
    results = results.filter((j) => j.status === status);
  }

  if (category && category !== 'All') {
    results = results.filter((j) => j.category.toLowerCase().includes(category.toLowerCase()));
  }

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.department.toLowerCase().includes(q) ||
        j.caseNumber.toLowerCase().includes(q) ||
        j.advertisementNo.toLowerCase().includes(q)
    );
  }

  return results;
}

/**
 * Get single job by ID or Case Number
 */
export function getJobByIdOrCaseNumber(identifier, nowMs = Date.now()) {
  recalculateAllJobStatuses(nowMs);
  return jobCatalog.find((j) => j.id === identifier || j.caseNumber === identifier) || null;
}

/**
 * Update job status by administrator
 */
export function updateJobStatusByAdmin({ jobId, newStatus, reason, adminUser = 'system-admin' }) {
  const allowedStatuses = ['open', 'upcoming', 'expired', 'closed', 'cancelled', 'withdrawn', 'superseded', 'unverified'];
  if (!allowedStatuses.includes(newStatus)) {
    throw new Error(`Invalid status "${newStatus}". Allowed: ${allowedStatuses.join(', ')}`);
  }

  const job = jobCatalog.find((j) => j.id === jobId || j.caseNumber === jobId);
  if (!job) {
    throw new Error(`Job advertisement with ID "${jobId}" not found.`);
  }

  const previousStatus = job.status;
  job.status = newStatus;
  job.isCurrent = newStatus === 'open';

  if (!Array.isArray(job.statusHistory)) {
    job.statusHistory = [];
  }

  job.statusHistory.push({
    timestamp: new Date().toISOString(),
    action: 'ADMIN_OVERRIDE',
    adminUser,
    previousStatus,
    newStatus,
    reason: reason || 'Manual status update by administrative review.',
  });

  return job;
}

/**
 * Record a corrected or extended deadline
 */
export function recordDeadlineCorrection({ jobId, newClosingDate, reason, adminUser = 'system' }) {
  const job = jobCatalog.find((j) => j.id === jobId || j.caseNumber === jobId);
  if (!job) {
    throw new Error(`Job advertisement with ID "${jobId}" not found.`);
  }

  const oldClosingDate = job.closingDate;
  job.closingDate = newClosingDate;

  // Re-evaluate
  const evaluation = evaluateJobStatus(job);
  job.status = evaluation.status;
  job.isCurrent = evaluation.isCurrent;

  if (!Array.isArray(job.statusHistory)) {
    job.statusHistory = [];
  }

  job.statusHistory.push({
    timestamp: new Date().toISOString(),
    action: 'DEADLINE_CORRECTION',
    adminUser,
    oldClosingDate,
    newClosingDate,
    reason: reason || 'Deadline updated following official FPSC corrigendum.',
  });

  return job;
}

/**
 * Deduplicate and upsert official FPSC job with rigorous source verification and non-vacancy safeguards
 */
export function upsertOfficialJob(jobData) {
  if (!jobData || !jobData.caseNumber || !jobData.title) {
    throw new Error('Case number and title are required to register an official job advertisement.');
  }

  // 1. Guard against converting non-vacancy documents (merit lists, test schedules) into job vacancies
  if (isNonVacancyDocument(jobData)) {
    const nonVacancyRecord = {
      ...jobData,
      id: jobData.id || `fpsc-notice-${jobData.caseNumber.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      documentType: 'NON_VACANCY_DOCUMENT',
      status: 'non_vacancy_document',
      isCurrent: false,
      verificationStatus: 'non_vacancy',
      reason: 'Identified as a merit list, test schedule, or administrative document. Excluded from job vacancies.',
    };
    return { job: nonVacancyRecord, isNew: false, excludedAsNonVacancy: true };
  }

  const existingIndex = jobCatalog.findIndex(
    (j) => j.caseNumber === jobData.caseNumber || (j.advertisementNo === jobData.advertisementNo && j.title === jobData.title)
  );

  const nowMs = Date.now();
  const evaluation = evaluateJobStatus(jobData, nowMs);

  const cleanRecord = {
    ...jobData,
    id: jobData.id || `fpsc-${jobData.caseNumber.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    status: evaluation.status,
    isCurrent: evaluation.isCurrent,
    sourceProvenance: jobData.sourceProvenance || 'official_ingestion',
  };

  if (existingIndex >= 0) {
    const existing = jobCatalog[existingIndex];
    const previousStatus = existing.status;
    const history = Array.isArray(existing.statusHistory) ? existing.statusHistory : [];

    // Check if deadline changed
    if (existing.closingDate !== cleanRecord.closingDate) {
      history.push({
        timestamp: new Date().toISOString(),
        action: 'DEADLINE_UPDATED_VIA_IMPORT',
        oldClosingDate: existing.closingDate,
        newClosingDate: cleanRecord.closingDate,
        reason: 'Updated during automated source refresh.',
      });
    }

    jobCatalog[existingIndex] = {
      ...existing,
      ...cleanRecord,
      statusHistory: history,
    };
    return { job: jobCatalog[existingIndex], isNew: false };
  } else {
    cleanRecord.statusHistory = [
      {
        timestamp: new Date().toISOString(),
        action: 'CREATED_VIA_IMPORT',
        previousStatus: null,
        newStatus: cleanRecord.status,
        reason: 'Initial import into official catalog.',
      },
    ];
    jobCatalog.unshift(cleanRecord);
    return { job: cleanRecord, isNew: true };
  }
}

/**
 * Configure and start background scheduled job refresh
 */
export function startJobStatusScheduler(intervalMs = 3600000) {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
  }

  // Initial immediate run
  recalculateAllJobStatuses();
  schedulerRunning = true;

  schedulerIntervalId = setInterval(() => {
    try {
      recalculateAllJobStatuses();
    } catch (err) {
      console.error('[JobStatusScheduler] Error during scheduled recalculation:', err);
    }
  }, intervalMs);

  // Unref so scheduler does not block test runner or node process exit
  if (schedulerIntervalId.unref) {
    schedulerIntervalId.unref();
  }

  return {
    running: true,
    intervalMs,
    lastSchedulerRun,
  };
}

/**
 * Stop background scheduler
 */
export function stopJobStatusScheduler() {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
  }
  schedulerRunning = false;
  return { running: false };
}

/**
 * Get current scheduler diagnostics
 */
export function getSchedulerStatus() {
  return {
    running: schedulerRunning,
    lastRun: lastSchedulerRun,
    activeJobsCount: jobCatalog.filter((j) => j.status === 'open').length,
    upcomingJobsCount: jobCatalog.filter((j) => j.status === 'upcoming').length,
    archivedJobsCount: jobCatalog.filter((j) => j.status === 'expired' || j.status === 'closed').length,
    totalJobsCount: jobCatalog.length,
  };
}

// Automatically start scheduler on module load
startJobStatusScheduler(3600000);

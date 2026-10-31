/**
 * Pakistan Timezone (Asia/Karachi, UTC+5) Date Utilities
 * Handles parsing, formatting, and deadline evaluation for official Pakistani public service announcements.
 */

export const PAKISTAN_TIMEZONE = 'Asia/Karachi';
export const PAKISTAN_UTC_OFFSET_HOURS = 5;

/**
 * Format a Date or timestamp in Asia/Karachi timezone
 */
export function formatPakistanDateTime(date = new Date(), options = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';

  const defaultOptions = {
    timeZone: PAKISTAN_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };

  return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options }).format(d);
}

/**
 * Get current timestamp in milliseconds
 */
export function getNowTimestamp() {
  return Date.now();
}

/**
 * Parse human-readable Pakistani dates into exact UTC milliseconds
 * Supports:
 * - "20 January 2026", "20th January 2026", "20-Jan-2026"
 * - "20-01-2026", "2026-01-20"
 * - ISO-8601 strings
 * 
 * If isEndOfDay is true, sets time to 23:59:59.999 PKT (UTC+5).
 * If isEndOfDay is false, sets time to 00:00:00.000 PKT (UTC+5).
 */
export function parsePakistanDate(dateStr, isEndOfDay = true) {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Clean trailing parenthetical notes (e.g. "15 November 2025 (Screening)")
  const cleanStr = trimmed.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  // 1. Direct ISO String check (with explicit timezone)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(cleanStr)) {
    const parsed = new Date(cleanStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  // 2. Format: "YYYY-MM-DD"
  const ymdMatch = cleanStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return createPakistanUtcTime(year, month, day, isEndOfDay);
  }

  // 3. Format: "DD-MM-YYYY" or "DD/MM/YYYY"
  const dmyNumericMatch = cleanStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyNumericMatch) {
    const day = parseInt(dmyNumericMatch[1], 10);
    const month = parseInt(dmyNumericMatch[2], 10) - 1;
    const year = parseInt(dmyNumericMatch[3], 10);
    return createPakistanUtcTime(year, month, day, isEndOfDay);
  }

  // 4. Format: "DD Month YYYY" (e.g. "20 January 2026", "20th January 2026", "5 Jan 2026")
  const monthsMap = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  const textMatch = cleanStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})/i);
  if (textMatch) {
    const day = parseInt(textMatch[1], 10);
    const monthKey = textMatch[2].toLowerCase();
    const year = parseInt(textMatch[3], 10);
    const month = monthsMap[monthKey];
    if (month !== undefined && day >= 1 && day <= 31) {
      return createPakistanUtcTime(year, month, day, isEndOfDay);
    }
  }

  // Ambiguous, relative, or unparseable text (e.g. "To be announced", "See corrigendum")
  return null;
}

/**
 * Helper to construct epoch milliseconds for a date in Pakistan Timezone (UTC+5)
 */
function createPakistanUtcTime(year, monthIndex, day, isEndOfDay) {
  const hours = isEndOfDay ? 23 : 0;
  const minutes = isEndOfDay ? 59 : 0;
  const seconds = isEndOfDay ? 59 : 0;
  const ms = isEndOfDay ? 999 : 0;

  // Pakistan is UTC+5. Convert PKT to UTC by subtracting 5 hours.
  const utcMillis = Date.UTC(year, monthIndex, day, hours - PAKISTAN_UTC_OFFSET_HOURS, minutes, seconds, ms);
  return utcMillis;
}

/**
 * Helper to identify whether a document or listing is an administrative notice,
 * merit list, test schedule, or shortlisting notice rather than an open job advertisement.
 */
export function isNonVacancyDocument(record) {
  if (!record) return false;
  const combinedText = [
    record.title || '',
    record.documentType || '',
    record.summary || '',
    record.advertisementNo || '',
    record.notes || '',
  ].join(' ').toLowerCase();

  const nonVacancyPatterns = [
    /\bmerit\s+lists?\b/i,
    /\blists?\s+of\s+(eligible|shortlisted|provisionally|selected|recommended|rejected)\s+candidates?\b/i,
    /\b(test|interview|screening|written\s+exam)\s+schedules?\b/i,
    /\bshortlisting\s+(criteria|notice|lists?)\b/i,
    /\badmission\s+certificates?\b/i,
    /\broll\s+number\s+slips?\b/i,
    /\brecommendations?\s+status\b/i,
    /\bfinal\s+results?\b/i,
    /\bpress\s+releases?\s+regarding\s+(test|interview|schedule)\b/i,
  ];

  return nonVacancyPatterns.some((pattern) => pattern.test(combinedText));
}

/**
 * Determine the authoritative status of a job advertisement
 * 
 * Possible returned statuses:
 * - 'open': Application period is currently open (openingDate <= now <= closingDate, verified)
 * - 'upcoming': Published/announced but application window opens in the future
 * - 'expired': Application closing date has passed
 * - 'cancelled': Withdrawn or cancelled by commission
 * - 'withdrawn': Explicitly withdrawn
 * - 'superseded': Replaced by a revised advertisement or corrigendum
 * - 'draft': Unfinalized internal record
 * - 'non_vacancy_document': Merit list, test schedule, or administrative notice
 * - 'pending_verification': Under administrative review
 * - 'unverified_deadline': Closing date is missing, ambiguous, or unparseable
 * - 'unverified': Not verified by official commission sources
 */
export function evaluateJobStatus(job, nowMs = Date.now()) {
  if (!job) {
    return {
      status: 'unverified',
      isCurrent: false,
      reason: 'No job record provided',
    };
  }

  // 1. Explicit administrative lifecycle flags
  const explicitStatus = (job.status || '').toLowerCase().trim();
  if (['cancelled', 'withdrawn', 'superseded', 'draft'].includes(explicitStatus)) {
    return {
      status: explicitStatus,
      isCurrent: false,
      reason: `Job record is explicitly marked as ${explicitStatus}.`,
    };
  }

  // 2. Non-vacancy Document Check (Merit lists, test schedules, shortlisting notices)
  if (isNonVacancyDocument(job)) {
    return {
      status: 'non_vacancy_document',
      isCurrent: false,
      reason: 'Document is a merit list, test schedule, or administrative announcement, not an open recruitment advertisement.',
    };
  }

  // 3. Demo / Synthetic / Pending Verification Check
  if (
    explicitStatus === 'pending_verification' ||
    (job.verificationStatus || '').toLowerCase() === 'pending_verification' ||
    job.isPendingVerification === true
  ) {
    return {
      status: 'pending_verification',
      isCurrent: false,
      reason: 'Listing is pending verification by an administrator against official commission gazettes.',
    };
  }

  if (
    explicitStatus === 'unverified' ||
    job.isDemo === true ||
    job.isSynthetic === true ||
    job.sourceProvenance === 'unverified_demo_record'
  ) {
    return {
      status: 'unverified',
      isCurrent: false,
      reason: 'Listing lacks verified official commission publication evidence and is excluded from current vacancies.',
    };
  }

  // 4. Official Verification Check
  const verificationStatus = (job.verificationStatus || '').toLowerCase();
  const isUnverified =
    verificationStatus.includes('unverified') ||
    verificationStatus.includes('rejected') ||
    verificationStatus.includes('fabricated') ||
    verificationStatus.includes('pending');

  const isVerified =
    !isUnverified &&
    (verificationStatus.includes('verified') ||
      verificationStatus.includes('official') ||
      job.isVerified === true);

  if (!isVerified) {
    return {
      status: 'unverified',
      isCurrent: false,
      reason: 'Advertisement has not been verified against approved official commission publications.',
    };
  }

  // 5. Closing Date Parsing
  const closingDateRaw = job.closingDate;
  if (!closingDateRaw) {
    return {
      status: 'unverified_deadline',
      isCurrent: false,
      reason: 'Application deadline is missing from the record.',
    };
  }

  const closingMs = parsePakistanDate(closingDateRaw, true);
  if (closingMs === null) {
    return {
      status: 'unverified_deadline',
      isCurrent: false,
      reason: `Application deadline "${closingDateRaw}" is ambiguous or cannot be verified.`,
    };
  }

  // 6. Expiry Check (Asia/Karachi)
  if (nowMs > closingMs) {
    return {
      status: 'expired',
      isCurrent: false,
      closingTimestampMs: closingMs,
      closingDateFormatted: formatPakistanDateTime(closingMs),
      reason: `Application deadline (${closingDateRaw} 11:59 PM PKT) has passed.`,
    };
  }

  // 7. Opening Date Check (Upcoming Vacancies)
  const openingDateRaw = job.openingDate;
  if (openingDateRaw) {
    const openingMs = parsePakistanDate(openingDateRaw, false);
    if (openingMs !== null && nowMs < openingMs) {
      return {
        status: 'upcoming',
        isCurrent: false,
        openingTimestampMs: openingMs,
        openingDateFormatted: formatPakistanDateTime(openingMs),
        closingTimestampMs: closingMs,
        reason: `Applications open on ${openingDateRaw}.`,
      };
    }
  }

  // 8. Official Source URL Check for Active Vacancies
  const sourceUrl = job.officialSourceUrl || '';
  if (!sourceUrl || typeof sourceUrl !== 'string' || !sourceUrl.startsWith('http')) {
    return {
      status: 'unverified',
      isCurrent: false,
      reason: 'Official source URL is required and must be a valid HTTP/HTTPS address.',
    };
  }

  // 9. Confirmed Open Vacancy
  return {
    status: 'open',
    isCurrent: true,
    closingTimestampMs: closingMs,
    closingDateFormatted: formatPakistanDateTime(closingMs),
    reason: 'Application period is actively open and verified against official sources.',
  };
}

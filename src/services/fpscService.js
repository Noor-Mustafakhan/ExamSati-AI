/**
 * FPSC Client Service
 * Connects to server-side retrieval endpoints for official FPSC documents and advertisements.
 * Handles client-side caching, search, Pakistan timezone expiry filtering, and fallback to verified archival records.
 */

import { evaluateJobStatus } from '../utils/pakistanTime.js';

const FALLBACK_FPSC_JOBS = [
  // 1. Deactivated Unverified Record: Lecturer CS (BS-17)
  // Preserved for administrative audit; excluded from public current vacancies.
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
    qualification: 'Second Class or Grade "C" Master\'s degree or equivalent (16 years education) in Computer Science, Software Engineering, or Information Technology.',
    physicalStandard: 'Standard medical fitness',
    ageLimit: '22-28 years plus 5 years general relaxation (Up to 33 years)',
    posting: 'Anywhere in Pakistan (FGEI Colleges & Campuses)',
    publicationDate: '01 October 2026',
    openingDate: '05 October 2026',
    closingDate: '25 November 2026',
    officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    verificationStatus: 'unverified',
    sourceProvenance: 'unverified_demo_record',
    syllabusSlug: 'fpsc-inspector-customs-2026',
    practiceSubject: 'Everyday Science',
    summary: 'Direct recruitment for Computer Science faculty across federal collegiate institutions under FGEI Directorate.',
    status: 'unverified',
    isCurrent: false,
  },

  // 2. Deactivated Unverified Record: Statistical Officer (BS-17)
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
    qualification: 'Second Class or Grade "C" Master\'s degree in Statistics, Mathematics, or Economics.',
    physicalStandard: 'Standard fitness',
    ageLimit: '22-28 years plus 5 years relaxation',
    posting: 'Islamabad, Provincial Headquarters',
    publicationDate: '15 October 2026',
    openingDate: '01 November 2026',
    closingDate: '20 November 2026',
    officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    verificationStatus: 'unverified',
    sourceProvenance: 'unverified_demo_record',
    syllabusSlug: 'fpsc-ad-fia-2026',
    practiceSubject: 'Basic Mathematics',
    summary: 'Recruitment for field data analysts and statistical planners for national census and econometric surveys.',
    status: 'unverified',
    isCurrent: false,
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
    qualification: 'Second Class or Grade "C" Bachelor\'s degree with Economics, Commerce, Statistics, Accounting, Computer Science, Law, Pharmacy, Chemistry, or Physics, OR B.Sc. Engineering in any specialty.',
    physicalStandard: 'Male: Height 5\'-6", Chest 32"-33.5" | Female: Height 5\'-2"',
    ageLimit: '20-28 years plus 5 years general relaxation in upper age limit (Up to 33 years)',
    posting: 'Anywhere in Pakistan (Customs Collectorates, Airports & Dry Ports)',
    publicationDate: '05 January 2026',
    openingDate: '05 January 2026',
    closingDate: '20 January 2026',
    officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    verificationStatus: 'Verified Official FPSC Advertisement',
    syllabusSlug: 'fpsc-inspector-customs-2026',
    practiceSubject: 'Pakistan Affairs',
    summary: 'Direct recruitment for field intelligence, anti-smuggling, and customs enforcement officers under Revenue Division.',
    status: 'expired',
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
    qualification: 'Second Class or Grade "C" Master\'s degree or equivalent (16 years education) recognized by HEC.',
    physicalStandard: 'Standard medical fitness',
    ageLimit: '22-28 years plus 5 years general relaxation (Up to 33 years)',
    posting: 'Anywhere in Pakistan (FIA Zonal Directorates)',
    publicationDate: '05 January 2026',
    openingDate: '05 January 2026',
    closingDate: '20 January 2026',
    officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    verificationStatus: 'Verified Official FPSC Advertisement',
    syllabusSlug: 'fpsc-ad-fia-2026',
    practiceSubject: 'Everyday Science',
    summary: 'Executive investigatory officers dealing with federal offenses, anti-corruption, financial crimes, and cybercrime.',
    status: 'expired',
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
    physicalStandard: 'Standard medical fitness',
    ageLimit: '20-28 years plus 5 years general relaxation',
    posting: 'Karachi, Lahore, Islamabad, Quetta, Peshawar (Customs Houses)',
    publicationDate: '05 January 2026',
    openingDate: '05 January 2026',
    closingDate: '20 January 2026',
    officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    verificationStatus: 'Verified Official FPSC Advertisement',
    syllabusSlug: 'fpsc-inspector-customs-2026',
    practiceSubject: 'Pakistan Affairs',
    summary: 'Assessment, tariff classification, and valuation of imported and exported merchandise under the Customs Act 1969.',
    status: 'expired',
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
    qualification: 'Second Division Bachelor\'s degree (14 years or 16 years education) in any discipline recognized by HEC.',
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
  },
];

export const fpscService = {
  /**
   * Fetch FPSC jobs with search, category, and lifecycle status filtering.
   * Defaults to 'open' to ensure only active, verified current vacancies appear on public pages.
   */
  async getJobs({ query = '', category = 'All', status = 'open' } = {}) {
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (category && category !== 'All') params.set('category', category);
      if (status) params.set('status', status);

      const res = await fetch(`/api/fpsc/jobs?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        return { data: json.data || [], isLive: true, count: json.count, statusFilter: json.statusFilter };
      }
    } catch {
      // Server fetch failed, evaluate verified client-side fallback
    }

    // Client-side fallback filter with strict Pakistan timezone evaluation
    const nowMs = Date.now();
    let results = FALLBACK_FPSC_JOBS.map((j) => {
      const evalResult = evaluateJobStatus(j, nowMs);
      return {
        ...j,
        status: evalResult.status,
        isCurrent: evalResult.isCurrent,
        statusDetails: evalResult,
      };
    });

    // 1. Status Filter
    if (status === 'open' || status === 'current') {
      results = results.filter((j) => j.status === 'open' && j.isCurrent === true);
    } else if (status === 'upcoming') {
      results = results.filter((j) => j.status === 'upcoming');
    } else if (status === 'archived' || status === 'expired') {
      results = results.filter((j) => j.status === 'expired' || j.status === 'closed');
    } else if (status !== 'all') {
      results = results.filter((j) => j.status === status);
    }

    // 2. Category Filter
    if (category !== 'All') {
      results = results.filter((j) => j.category.toLowerCase().includes(category.toLowerCase()));
    }

    // 3. Search Query Filter
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

    return { data: results, isLive: false, count: results.length, statusFilter: status };
  },

  /**
   * Fetch single job by ID or case number with evaluated lifecycle status
   */
  async getJobById(id) {
    try {
      const res = await fetch(`/api/fpsc/jobs/${encodeURIComponent(id)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) return { data: json.data, isLive: true };
      }
    } catch {
      // Fallback
    }

    const match = FALLBACK_FPSC_JOBS.find((j) => j.id === id || j.caseNumber === id);
    if (match) {
      const evalResult = evaluateJobStatus(match, Date.now());
      return {
        data: {
          ...match,
          status: evalResult.status,
          isCurrent: evalResult.isCurrent,
          statusDetails: evalResult,
        },
        isLive: false,
      };
    }

    return { data: null, isLive: false };
  },

  /**
   * Safely retrieve and parse official FPSC document
   */
  async retrieveDocument(url) {
    try {
      const res = await fetch('/api/fpsc/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const json = await res.json();
        return { data: json.data, error: null };
      }
      const errJson = await res.json().catch(() => ({}));
      return { data: null, error: errJson.error || 'Failed to retrieve document from official portal.' };
    } catch (err) {
      return { data: null, error: err.message || 'Network error reaching retrieval service.' };
    }
  },

  /**
   * Fetch official syllabi schemes
   */
  async getSyllabi() {
    try {
      const res = await fetch('/api/fpsc/syllabi');
      if (res.ok) {
        const json = await res.json();
        return { data: json.data || [] };
      }
    } catch {
      // Fallback
    }
    return { data: [] };
  },

  /**
   * Manually import an official FPSC notification or syllabus document
   */
  async importDocument({ title, officialSourceUrl, advertisementNo, publicationDate, text, notes }) {
    try {
      const res = await fetch('/api/fpsc/import-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          officialSourceUrl,
          advertisementNo,
          publicationDate,
          text,
          notes,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        return { data: json.data, error: null };
      }
      const errJson = await res.json().catch(() => ({}));
      return { data: null, error: errJson.error || 'Failed to import document.' };
    } catch (err) {
      return { data: null, error: err.message || 'Network error reaching import service.' };
    }
  },

  /**
   * Administrative status update
   */
  async updateJobStatus({ jobId, newStatus, reason, adminUser }) {
    try {
      const res = await fetch('/api/admin/jobs/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, newStatus, reason, adminUser }),
      });
      if (res.ok) {
        const json = await res.json();
        return { data: json.data, error: null };
      }
      const errJson = await res.json().catch(() => ({}));
      return { data: null, error: errJson.error || 'Failed to update job status.' };
    } catch (err) {
      return { data: null, error: err.message || 'Network error reaching admin endpoint.' };
    }
  },
};

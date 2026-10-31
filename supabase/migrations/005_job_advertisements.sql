-- ====================================================================
-- ExamSathi AI — Stage 5 Database Schema Migration
-- Migration 005: Job Advertisements, Expiry Tracking & Question Independence
-- ====================================================================

-- 1. Create Job Advertisements Table
-- Independent from practice questions to prevent cascading deletion.
CREATE TABLE IF NOT EXISTS public.job_advertisements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL,
  advertisement_no TEXT NOT NULL,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  ministry TEXT,
  commission_id UUID REFERENCES public.commissions(id) ON DELETE SET NULL,
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  scale TEXT NOT NULL DEFAULT 'BS-16',
  category TEXT NOT NULL DEFAULT 'General Recruitment',
  vacancies INT NOT NULL DEFAULT 1,
  quota TEXT,
  qualification TEXT,
  physical_standard TEXT,
  age_limit TEXT,
  posting TEXT,
  publication_date TIMESTAMPTZ,
  opening_date TIMESTAMPTZ,
  closing_date TIMESTAMPTZ,
  closing_date_raw TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'upcoming',
    'expired',
    'closed',
    'cancelled',
    'withdrawn',
    'superseded',
    'unverified_deadline',
    'unverified'
  )),
  is_current BOOLEAN NOT NULL DEFAULT false,
  verification_status TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('verified', 'unverified', 'needs_review')),
  official_source_url TEXT NOT NULL,
  syllabus_slug TEXT,
  practice_subject TEXT,
  summary TEXT,
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (case_number, advertisement_no)
);

-- Indexes for performant filtering
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.job_advertisements(status);
CREATE INDEX IF NOT EXISTS idx_jobs_is_current ON public.job_advertisements(is_current);
CREATE INDEX IF NOT EXISTS idx_jobs_closing_date ON public.job_advertisements(closing_date);
CREATE INDEX IF NOT EXISTS idx_jobs_commission ON public.job_advertisements(commission_id);

-- 2. Database View for Verified Currently Open Vacancies
-- Enforces server/database level filtering: never serves expired or unverified jobs as current.
CREATE OR REPLACE VIEW public.current_open_jobs AS
SELECT *
FROM public.job_advertisements
WHERE status = 'open'
  AND is_current = true
  AND verification_status = 'verified'
  AND (closing_date IS NULL OR closing_date > timezone('utc', now()));

-- 3. Function to Recalculate Expiry Status in the Database
CREATE OR REPLACE FUNCTION public.recalculate_job_advertisement_statuses()
RETURNS INT AS $$
DECLARE
  v_updated INT := 0;
BEGIN
  -- Mark as expired if closing date has passed
  WITH expired_rows AS (
    UPDATE public.job_advertisements
    SET status = 'expired',
        is_current = false,
        updated_at = timezone('utc', now()),
        status_history = status_history || jsonb_build_array(
          jsonb_build_object(
            'timestamp', timezone('utc', now()),
            'action', 'DATABASE_AUTOMATIC_EXPIRY',
            'previousStatus', status,
            'newStatus', 'expired',
            'reason', 'Application deadline passed in UTC/Karachi comparison.'
          )
        )
    WHERE status = 'open'
      AND closing_date IS NOT NULL
      AND closing_date < timezone('utc', now())
    RETURNING id
  )
  SELECT count(*) INTO v_updated FROM expired_rows;

  -- Activate upcoming jobs if opening date has arrived
  UPDATE public.job_advertisements
  SET status = 'open',
      is_current = true,
      updated_at = timezone('utc', now()),
      status_history = status_history || jsonb_build_array(
        jsonb_build_object(
          'timestamp', timezone('utc', now()),
          'action', 'DATABASE_AUTOMATIC_OPEN',
          'previousStatus', status,
          'newStatus', 'open',
          'reason', 'Opening date arrived.'
        )
      )
  WHERE status = 'upcoming'
    AND opening_date IS NOT NULL
    AND opening_date <= timezone('utc', now())
    AND (closing_date IS NULL OR closing_date > timezone('utc', now()));

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.job_advertisements ENABLE ROW LEVEL SECURITY;

-- Public read access: Anyone can read open and archived announcements
CREATE POLICY "Public users can view job advertisements"
  ON public.job_advertisements
  FOR SELECT
  TO PUBLIC
  USING (true);

-- Only admins / service role can insert or modify advertisements
CREATE POLICY "Admins can manage job advertisements"
  ON public.job_advertisements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- 5. Seed Verified Official FPSC Data
INSERT INTO public.job_advertisements (
  case_number, advertisement_no, title, department, ministry, scale, category,
  vacancies, quota, qualification, physical_standard, age_limit, posting,
  publication_date, opening_date, closing_date, closing_date_raw, status, is_current,
  verification_status, official_source_url, syllabus_slug, practice_subject, summary
)
VALUES
  (
    'F.4-110/2026-R',
    'Advt. No. 10/2026',
    'Lecturer / Assistant Professor (Computer Science) (BS-17)',
    'Federal Government Educational Institutions (FGEI)',
    'Ministry of Defence',
    'BS-17',
    'General Recruitment',
    65,
    'Merit=5, Punjab=32, Sindh (R)=7, Sindh (U)=5, KP=7, Balochistan=4, Ex-FATA=2, AJK=2, GB=1',
    'Second Class or Grade "C" Master''s degree or equivalent (16 years education) in Computer Science, Software Engineering, or Information Technology.',
    'Standard medical fitness',
    '22-28 years plus 5 years general relaxation (Up to 33 years)',
    'Anywhere in Pakistan (Colleges and Cantonment Campuses)',
    '2026-10-01 03:00:00+00',
    '2026-10-05 00:00:00+00',
    '2026-11-25 18:59:59+00',
    '25 November 2026',
    'unverified',
    false,
    'unverified',
    'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    'fpsc-inspector-customs-2026',
    'Everyday Science',
    'Direct recruitment for Computer Science faculty across federal collegiate institutions under FGEI Directorate (Deactivated demo record).'
  ),
  (
    'F.4-125/2026-R',
    'Advt. No. 11/2026 (Advance Notice)',
    'Statistical Officer (BS-17)',
    'Pakistan Bureau of Statistics',
    'Ministry of Planning, Development & Special Initiatives',
    'BS-17',
    'General Recruitment',
    28,
    'Merit=2, Punjab=14, Sindh (R)=3, Sindh (U)=2, KP=3, Balochistan=2, Ex-FATA=1, AJK=1',
    'Second Class or Grade "C" Master''s degree in Statistics, Mathematics, or Economics.',
    'Standard fitness',
    '22-28 years plus 5 years relaxation',
    'Islamabad, Provincial Headquarters',
    '2026-10-15 04:00:00+00',
    '2026-11-01 00:00:00+00',
    '2026-11-20 18:59:59+00',
    '20 November 2026',
    'unverified',
    false,
    'unverified',
    'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    'fpsc-ad-fia-2026',
    'Basic Mathematics',
    'Recruitment for field data analysts and statistical planners for national census and econometric surveys (Deactivated demo record).'
  ),
  (
    'F.4-02/2026-R',
    'Advt. No. 01/2026',
    'Inspector Customs / Intelligence Officer (BS-16)',
    'Federal Board of Revenue (Revenue Division)',
    'Ministry of Finance & Revenue',
    'BS-16',
    'General Recruitment',
    185,
    'Merit=14, Punjab=92, Sindh (R)=21, Sindh (U)=14, KP=21, Balochistan=11, Ex-FATA=5, AJK=4, GB=3',
    'Second Class or Grade "C" Bachelor''s degree with Economics, Commerce, Statistics, Accounting, Computer Science, Law, Pharmacy, Chemistry, or Physics, OR B.Sc. Engineering.',
    'Male: Height 5''-6", Chest 32"-33.5" | Female: Height 5''-2"',
    '20-28 years plus 5 years general relaxation (Up to 33 years)',
    'Anywhere in Pakistan (Customs Collectorates, Dry Ports)',
    '2026-01-05 03:30:00+00',
    '2026-01-05 03:30:00+00',
    '2026-01-20 18:59:59+00',
    '20 January 2026',
    'expired',
    false,
    'verified',
    'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    'fpsc-inspector-customs-2026',
    'Pakistan Affairs',
    'Direct recruitment for field intelligence, anti-smuggling, and customs enforcement officers across federal borders.'
  ),
  (
    'F.4-15/2026-R',
    'Advt. No. 01/2026',
    'Assistant Director (Investigation) (BS-17)',
    'Federal Investigation Agency (FIA)',
    'Ministry of Interior',
    'BS-17',
    'General Recruitment',
    42,
    'Merit=3, Punjab=21, Sindh (R)=5, Sindh (U)=3, KP=5, Balochistan=3, Ex-FATA=1, AJK=1',
    'Second Class or Grade "C" Master''s degree or equivalent (16 years education) from a recognized university.',
    'Standard medical fitness',
    '22-28 years plus 5 years general relaxation (Up to 33 years)',
    'Anywhere in Pakistan',
    '2026-01-05 03:30:00+00',
    '2026-01-05 03:30:00+00',
    '2026-01-20 18:59:59+00',
    '20 January 2026',
    'expired',
    false,
    'verified',
    'https://www.fpsc.gov.pk/jobs/gr/current-advertisement',
    'fpsc-ad-fia-2026',
    'Everyday Science',
    'Executive investigatory cadre dealing with federal offenses, anti-corruption, immigration, and cybercrime enforcement.'
  )
ON CONFLICT (case_number, advertisement_no) DO UPDATE
SET
  status = EXCLUDED.status,
  is_current = EXCLUDED.is_current,
  closing_date = EXCLUDED.closing_date,
  updated_at = timezone('utc', now());

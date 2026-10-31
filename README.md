# ExamSathi AI — Stage 2: Real Backend & Database Integration

ExamSathi AI is a dedicated, distraction-free competitive examination preparation platform designed for students in Pakistan preparing for Federal and Provincial Public Service Commissions:
- **FPSC** (Federal Public Service Commission)
- **PPSC** (Punjab Public Service Commission)
- **KPPSC** (Khyber Pakhtunkhwa Public Service Commission)
- **SPSC** (Sindh Public Service Commission)
- **BPSC** (Balochistan Public Service Commission)
- **AJKPSC** (Azad Jammu & Kashmir Public Service Commission)
- National and provincial testing agencies (NTS, PTS, OTS)

---

## 1. Architecture Overview

### Technology Stack
- **Frontend:** React 19, Vite 8, Tailwind CSS, Lucide Icons, React Router v7.
- **Backend & Auth:** Supabase Auth (`@supabase/supabase-js`), Supabase PostgreSQL.
- **Security:** PostgreSQL Row Level Security (RLS) on all public tables, `SECURITY DEFINER` stored functions for answer validation, isolated `private` schema for correct answer keys.
- **Design Philosophy:** Minimalist, high-readability editorial layout. No purple gradients, no pill buttons, no emojis, no fake reviews or invented statistics, no em dashes in copy.

---

## 2. Setting Up Supabase

### Step 1: Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and create an account.
2. Click **New project**, choose an organization, set a project name (e.g. `examsathi-prod`), and select the closest region (e.g., Southeast Asia or Middle East for low latency to Pakistan).
3. Set a strong database password and click **Create new project**.

### Step 2: Retrieve API Keys
1. In your Supabase dashboard, navigate to **Project Settings** -> **API**.
2. Copy your **Project URL** (`https://[project-id].supabase.co`).
3. Copy your **anon public** / **publishable key** (`sb_pub_...` or legacy `eyJ...`).
> **Important Security Rule:** NEVER expose your `service_role` secret key, database password, or private connection string in Vite frontend code or `.env.local`. Only the publishable/anon key belongs in client applications.

---

## 3. Local Environment Configuration

1. In the repository root, copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Populate `.env` with your credentials:
   ```env
   # Supabase Client (Public)
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key

   # AI LLM Providers (Server-Only — Never prefix with VITE_)
   GEMINI_API_KEY=your_google_ai_studio_key
   GROQ_API_KEY=gsk_your_groq_api_key
   GROQ_MODEL=qwen/qwen3.8-27b
   ```
3. Ensure `.env` is present in `.gitignore` so secrets are never committed to version control.

### Optional: Tesseract OCR (for Scanned Notes & Images)
If you plan to ingest scanned PDF notes or images into the Stage 1 RAG pipeline:
- **Windows:** Install [Tesseract-OCR](https://github.com/UB-Mannheim/tesseract/wiki) to `C:\Program Files\Tesseract-OCR\` (auto-detected).
- **Linux:** `sudo apt install tesseract-ocr`
- **macOS:** `brew install tesseract`


---

## 4. Applying Database Migrations

Database migration files are located under `supabase/migrations/` and should be applied in sequential order. You can apply them either via the **Supabase Web SQL Editor** or via the **Supabase CLI**.

### Migration Files Order
1. `supabase/migrations/001_core_schema.sql`
   - Creates the `private` schema.
   - Sets up public tables: `profiles`, `commissions`, `exams`, `subjects`, `syllabus_topics`, `preparation_materials`, `questions`, `mock_tests`, `mock_test_questions`, `test_attempts`, `test_attempt_answers`, `saved_questions`, `saved_exams`, `reported_questions`.
   - Creates the protected `private.answer_keys` table with revoked browser permissions.
2. `supabase/migrations/002_rls_policies.sql`
   - Enables Row Level Security on all tables.
   - Grants read access to public published exams, syllabi, questions, and tests.
   - Restricts user profiles, bookmarks, and test attempts strictly to their authentic owner (`auth.uid()`).
   - Prevents student users from altering their role to `admin`.
3. `supabase/migrations/003_functions_triggers.sql`
   - Installs `public.handle_new_user()` trigger to automatically create a profile on registration.
   - Installs `public.check_mcq_answer(UUID, INT)`: A secure RPC function that checks option correctness against `private.answer_keys` without revealing keys to the client.
   - Installs `public.submit_mock_test_attempt(UUID, JSONB)`: Server-side scoring calculation that applies negative marking (-0.25 marks per wrong answer), updates status to `completed`, and records individual answer items.
4. `supabase/migrations/004_seed_demo_data.sql`
   - Populates Pakistani commissions (FPSC, PPSC, KPPSC, SPSC, BPSC, AJKPSC).
   - Inserts core syllabus subjects (Pakistan Affairs, General Science & Ability, Islamic Studies, English).
   - Seeds sample published exams, syllabus breakdowns, and sample practice questions with protected keys.

### Option A: Using the Supabase SQL Editor
1. In the Supabase dashboard, click **SQL Editor** -> **New query**.
2. Open each SQL migration file in order (`001`, `002`, `003`, `004`), paste the contents into the SQL editor, and click **Run**.

### Option B: Using Supabase CLI
```bash
npx supabase login
npx supabase link --project-ref your-project-id
npx supabase db push
```

---

## 5. Configuring Authentication & Redirect URLs

1. In the Supabase Dashboard, go to **Authentication** -> **URL Configuration**.
2. Set **Site URL** to:
   - Development: `http://localhost:5173`
   - Production: `https://your-domain.com`
3. Under **Redirect URLs**, add:
   - `http://localhost:5173/dashboard`
   - `http://localhost:5173/login`
4. Under **Authentication** -> **Providers** -> **Email**:
   - Ensure Email provider is enabled.
   - (Optional for development testing) You can toggle "Confirm email" off if you want immediate logins without email inbox verification during local tests.

---

## 6. Running and Verifying the Application

### Running Locally
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
```

### How to Verify the Integration
1. **Unconfigured / Offline Mode:**
   - Without `.env.local`, the application displays an honest banner: *"Supabase Backend Not Configured (Running in Offline Demo Mode)"*.
   - Features gracefully fallback to verified local mock datasets and browser storage.
2. **Database Connected Mode:**
   - Once `.env.local` is populated and migrations are applied:
   - **Signup:** Register a new user at `/register`. Supabase Auth registers the account, and the `handle_new_user()` trigger initializes the profile in `public.profiles`.
   - **Login:** Sign in at `/login`. Your student profile displays in the navigation bar.
   - **Explore Exams:** Open `/exams`. Live records are loaded from `public.exams` and `public.commissions` with real-time category and commission filters.
   - **MCQ Practice:** Visit `/practice`. Questions load without correct answers in the network payload. Selecting an option calls `check_mcq_answer` RPC, returning whether it was correct along with the official explanation.
   - **Bookmarks:** Click the bookmark icon on any question. The state persists to `public.saved_questions` for your `user_id`. Check `/saved` to confirm it persists across browser reloads.
   - **Mock Test & Server-Side Scoring:** Start a test at `/mock-tests`. An attempt is created in `public.test_attempts`. Upon submission, `submit_mock_test_attempt` calculates the final score server-side against `private.answer_keys` and prevents client tampering.
   - **Progress:** Visit `/progress`. Shows recorded test attempts linked directly to your Supabase cloud account.

---

## 7. Remaining Limitations and Next Steps (Stage 3 Roadmap)

- **AI Tutor (Demo Mode):** The AI Tutor interface is currently in a clearly labeled demo mode with pre-programmed Pakistani syllabus heuristics. LLM and RAG integration (fine-tuned on Pakistani curriculum and past papers) is reserved for Stage 3.
- **Past Paper PDF Ingestion:** Automated OCR and question parsing from FPSC/PPSC past paper scans will be introduced in subsequent pipeline milestones.
- **Admin Portal:** Content authoring is currently managed via database migrations and seed scripts. An administrative content review dashboard with role-based access control will be expanded in future releases.

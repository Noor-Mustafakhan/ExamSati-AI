import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight } from 'lucide-react';

export const PrivacyPolicyPage = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-8">
      {/* Header */}
      <div className="space-y-3 pb-6 border-b border-[#E2E8F0]">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-[#64748B] text-xs font-semibold">
          <ShieldCheck className="w-4 h-4 text-[#0F766E]" />
          <span>Legal Documentation</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#15233B] tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-xs text-[#64748B]">
          Effective Date: October 12, 2026 | Last Updated: October 12, 2026
        </p>
        <p className="text-sm text-[#64748B] leading-relaxed">
          This Privacy Policy outlines how ExamSathi AI handles your data when you interact with this web platform.
          Please note that this document reflects the current front-end prototype implementation and requires legal review prior to production launch.
        </p>
      </div>

      {/* Main Content Sections */}
      <div className="space-y-8 text-sm text-[#172033] leading-relaxed">
        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            1. Information Currently Collected
          </h2>
          <p className="text-slate-600">
            In its current development state, ExamSathi AI operates as a front-end single-page application.
            We do not maintain a live server-side database for visitor tracking.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li>
              <strong className="text-[#172033]">Demonstration Authentication:</strong> Any names, email addresses, and passwords entered on the Login or Registration screens are processed locally in your browser memory for interface demonstration purposes only. They are not transmitted to or stored on an external authentication server.
            </li>
            <li>
              <strong className="text-[#172033]">Search Queries & Filter Selections:</strong> Search terms entered to filter competitive exams or syllabus items are evaluated entirely within your web browser.
            </li>
          </ul>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            2. Local Storage and Browser Session Data
          </h2>
          <p className="text-slate-600">
            The platform utilizes your browser's standard Web Storage API (<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-[#15233B]">localStorage</code>) to persist your study preferences locally on your device across page visits. Data stored includes:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li>
              <strong className="text-[#172033]">Bookmarked Questions:</strong> Identifiers of questions you flag for revision.
            </li>
            <li>
              <strong className="text-[#172033]">Saved Exam Outlines:</strong> Identifiers of syllabus blueprints you save to your target list.
            </li>
            <li>
              <strong className="text-[#172033]">Mock Test Attempts:</strong> Summary scores, dates, and accuracy metrics for mock exams completed on this device.
            </li>
            <li>
              <strong className="text-[#172033]">Question Reports:</strong> Feedback logged regarding answer keys or question text, stored locally in the current prototype.
            </li>
          </ul>
          <p className="text-slate-600">
            This data remains on your physical device until you clear your browser cookies and site storage. It is not synced to an external cloud database in this build.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            3. AI Tutor and Interactive Queries
          </h2>
          <p className="text-slate-600">
            The AI Tutor component currently delivers scripted and simulated responses based on curated sample datasets covering Pakistani competitive syllabi. Queries typed into the tutor chat are processed in browser memory and are not sent to any external generative AI APIs, model providers, or third-party cloud services.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            4. Third-Party Services
          </h2>
          <p className="text-slate-600">
            The current prototype loads typography assets (Inter and JetBrains Mono) from Google Fonts CDN. No third-party marketing trackers, advertising pixels, or invasive behavioral analytics scripts are embedded in the code.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            5. Data Security and Access
          </h2>
          <p className="text-slate-600">
            Because personal profile records and study sessions reside entirely in your browser storage, security depends on the physical access and security settings of your personal device. We advise clearing your local browser storage if using a shared or public computer.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            6. Data Retention and Deletion
          </h2>
          <p className="text-slate-600">
            You can delete all your stored practice records, bookmarked questions, and test scores at any time by clearing site data for this application in your browser settings, or by clicking the "Reset Progress" control available on the Practice and Dashboard pages.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            7. Contact Information
          </h2>
          <p className="text-slate-600">
            For questions regarding this privacy notice or the technical implementation of ExamSathi AI, please contact the development team at:
          </p>
          <div className="p-3.5 bg-slate-50 rounded-lg border border-[#E2E8F0] text-xs font-mono text-slate-700">
            Contact Email: [CONFIG_REQUIRED: privacy@examsathi.pk]
          </div>
          <p className="text-xs text-[#64748B]">
            Note: The contact address above is a placeholder and must be confirmed with an active administrative mailbox prior to commercial release.
          </p>
        </section>
      </div>

      {/* Footer Navigation Back */}
      <div className="pt-6 border-t border-[#E2E8F0] flex items-center justify-between">
        <Link
          to="/"
          className="text-xs font-semibold text-[#3156A6] hover:underline"
        >
          Return to Home
        </Link>
        <Link
          to="/terms-and-conditions"
          className="text-xs font-semibold text-[#3156A6] hover:underline flex items-center gap-1"
        >
          <span>View Terms and Conditions</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};

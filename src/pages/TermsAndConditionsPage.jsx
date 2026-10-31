import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowRight } from 'lucide-react';

export const TermsAndConditionsPage = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-8">
      {/* Header */}
      <div className="space-y-3 pb-6 border-b border-[#E2E8F0]">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-[#64748B] text-xs font-semibold">
          <FileText className="w-4 h-4 text-[#3156A6]" />
          <span>Terms of Use</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#15233B] tracking-tight">
          Terms and Conditions
        </h1>
        <p className="text-xs text-[#64748B]">
          Effective Date: October 12, 2026 | Last Updated: October 12, 2026
        </p>
        <p className="text-sm text-[#64748B] leading-relaxed">
          Please read these terms carefully before accessing or using the ExamSathi AI platform.
          This document represents an initial draft for the web prototype and requires qualified legal review before public deployment.
        </p>
      </div>

      {/* Main Terms Sections */}
      <div className="space-y-8 text-sm text-[#172033] leading-relaxed">
        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            1. Acceptance of Terms
          </h2>
          <p className="text-slate-600">
            By visiting, accessing, or using ExamSathi AI, you agree to comply with and be bound by these Terms and Conditions. If you do not agree with any portion of these terms, please discontinue your use of the website.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            2. Nature of the Platform and Independence
          </h2>
          <div className="p-4 bg-slate-50 rounded-lg border border-[#E2E8F0] space-y-2 text-slate-700">
            <strong className="text-[#15233B] block">Important Non-Affiliation Notice:</strong>
            <p>
              ExamSathi AI is an independent, non-governmental educational study aid. We are not affiliated with, endorsed by, sponsored by, or in any formal relationship with the Federal Public Service Commission (FPSC), Punjab Public Service Commission (PPSC), Khyber Pakhtunkhwa Public Service Commission (KPPSC), Sindh Public Service Commission (SPSC), Balochistan Public Service Commission (BPSC), National Testing Service (NTS), Educational Testing and Evaluation Agency (ETEA), or any federal or provincial governmental ministry in Pakistan.
            </p>
          </div>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            3. Educational Content and Limitations of Accuracy
          </h2>
          <p className="text-slate-600">
            All practice questions, sample syllabus outlines, answers, scoring criteria, and explanations provided on this platform are for general instructional practice only:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li>
              <strong className="text-[#172033]">No Guarantee of Examination Results:</strong> Using our practice tests, syllabus outlines, or tutor recommendations does not guarantee success, passing scores, or merit standing in any official examination or recruitment drive.
            </li>
            <li>
              <strong className="text-[#172033]">Official Source Primacy:</strong> Official syllabus changes, advertisement deadlines, eligibility criteria, and fee challans are established exclusively by the respective testing commissions. Candidates must always verify critical requirements directly through the official Gazette notifications and recruitment commission portals.
            </li>
            <li>
              <strong className="text-[#172033]">AI and Automated Answers:</strong> AI tutor outputs and automated explanations are educational references. They can occasionally contain errors or omissions and should not be treated as authoritative legal or statutory determinations.
            </li>
          </ul>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            4. User Responsibilities
          </h2>
          <p className="text-slate-600">
            When interacting with this platform, you agree to:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li>Use the practice modules and educational resources solely for personal, non-commercial exam preparation.</li>
            <li>Not engage in automated scraping, denial-of-service attempts, or reverse-engineering of platform source code without written permission.</li>
            <li>Submit constructive, accurate feedback when using the question reporting tool.</li>
          </ul>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            5. Intellectual Property
          </h2>
          <p className="text-slate-600">
            The platform design, user interface components, software code, and curated study notes are protected intellectual assets of ExamSathi AI. Statutory acts, official titles, and public domain past papers referenced in our materials remain the property of their respective statutory bodies and copyright holders.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            6. Service Modifications and Availability
          </h2>
          <p className="text-slate-600">
            As ExamSathi AI is an active product under continuous improvement, features, questions, interface designs, and access requirements may be updated, modified, or temporarily paused without prior notice.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            7. Limitation of Liability
          </h2>
          <p className="text-slate-600">
            To the fullest extent permitted by applicable law, ExamSathi AI and its contributors shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of or inability to use this platform, including any discrepancies between practice questions and actual commission examinations.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#15233B]">
            8. Contact and Queries
          </h2>
          <p className="text-slate-600">
            For questions or feedback regarding these terms, please reach out to:
          </p>
          <div className="p-3.5 bg-slate-50 rounded-lg border border-[#E2E8F0] text-xs font-mono text-slate-700">
            Contact Email: [CONFIG_REQUIRED: terms@examsathi.pk]
          </div>
          <p className="text-xs text-[#64748B]">
            Note: The contact address above is a placeholder and must be confirmed prior to public production release.
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
          to="/privacy-policy"
          className="text-xs font-semibold text-[#3156A6] hover:underline flex items-center gap-1"
        >
          <span>View Privacy Policy</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};

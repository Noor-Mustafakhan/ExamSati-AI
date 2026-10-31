import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="bg-[#15233B] text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand info */}
          <div className="space-y-3">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#3156A6] flex items-center justify-center text-white">
                <BookOpen className="w-4 h-4" />
              </div>
              <span className="font-bold text-lg text-white">
                ExamSathi AI
              </span>
            </Link>
            <p className="text-xs text-slate-400 leading-relaxed">
              An independent exam-preparation platform for students in Pakistan preparing for federal and provincial competitive tests.
            </p>
          </div>

          {/* Testing Commissions */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
              Testing Commissions
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><Link to="/exams?commission=FPSC" className="hover:text-white transition-colors">FPSC (Federal)</Link></li>
              <li><Link to="/exams?commission=PPSC" className="hover:text-white transition-colors">PPSC (Punjab)</Link></li>
              <li><Link to="/exams?commission=KPPSC" className="hover:text-white transition-colors">KPPSC (Khyber Pakhtunkhwa)</Link></li>
              <li><Link to="/exams?commission=SPSC" className="hover:text-white transition-colors">SPSC (Sindh)</Link></li>
              <li><Link to="/exams?commission=BPSC" className="hover:text-white transition-colors">BPSC (Balochistan)</Link></li>
            </ul>
          </div>

          {/* Preparation Navigation */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
              Preparation
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><Link to="/fpsc-jobs" className="hover:text-white transition-colors">FPSC Jobs & Advertisements</Link></li>
              <li><Link to="/exams" className="hover:text-white transition-colors">Explore Exams & Syllabi</Link></li>
              <li><Link to="/practice" className="hover:text-white transition-colors">Practise MCQs</Link></li>
              <li><Link to="/mock-tests" className="hover:text-white transition-colors">Mock Tests</Link></li>
              <li><Link to="/ai-tutor" className="hover:text-white transition-colors">AI Study Buddy</Link></li>
              <li><Link to="/dashboard" className="hover:text-white transition-colors">Student Dashboard</Link></li>
            </ul>
          </div>

          {/* Legal and Information */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
              Information & Legal
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link to="/privacy-policy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms-and-conditions" className="hover:text-white transition-colors">
                  Terms and Conditions
                </Link>
              </li>
            </ul>
            <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
              ExamSathi AI is an independent preparatory study platform. It is not affiliated with, authorized by, or an official representative of FPSC, PPSC, KPPSC, SPSC, BPSC, or any government testing body.
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-6 border-t border-slate-800 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 ExamSathi AI. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/privacy-policy" className="hover:text-slate-300">Privacy Policy</Link>
            <Link to="/terms-and-conditions" className="hover:text-slate-300">Terms and Conditions</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

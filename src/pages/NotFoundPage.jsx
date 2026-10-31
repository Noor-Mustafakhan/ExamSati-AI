import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

export const NotFoundPage = () => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center py-12 px-4 text-center">
      <div className="max-w-md space-y-4">
        <div className="w-12 h-12 rounded-md bg-slate-100 text-[#3156A6] flex items-center justify-center mx-auto border border-[#E2E8F0]">
          <BookOpen className="w-6 h-6" />
        </div>
        <h1 className="text-3xl font-extrabold text-[#15233B] tracking-tight">
          404
        </h1>
        <h2 className="text-base font-bold text-[#172033]">
          Page Not Found
        </h2>
        <p className="text-xs text-[#64748B] leading-relaxed">
          The requested page does not exist. Explore our available competitive exam syllabus outlines or return to the homepage.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/"
            className="px-4 py-2 rounded-md bg-[#15233B] hover:bg-slate-900 text-white font-medium text-xs transition-colors"
          >
            Home
          </Link>
          <Link
            to="/exams"
            className="px-4 py-2 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-medium text-xs transition-colors"
          >
            Explore Exams
          </Link>
        </div>
      </div>
    </div>
  );
};

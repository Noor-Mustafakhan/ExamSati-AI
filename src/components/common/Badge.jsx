import React from 'react';

/**
 * Question Provenance Badge
 * Distinguishes:
 * 1. Official past-paper question (provenance established)
 * 2. Reviewed practice question
 * 3. AI-generated practice question
 * 4. Question awaiting verification
 */
export const VerificationBadge = ({ status }) => {
  const normalized = (status || '').toLowerCase();

  if (normalized.includes('official') || normalized.includes('past paper')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
        Official Past Paper
      </span>
    );
  }

  if (normalized.includes('reviewed') || normalized.includes('verified')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
        Reviewed Practice Question
      </span>
    );
  }

  if (normalized.includes('ai') || normalized.includes('generated')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
        AI-Generated Practice
      </span>
    );
  }

  if (normalized.includes('awaiting') || normalized.includes('unverified')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
        Awaiting Verification
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
      Demonstration Question
    </span>
  );
};

export const DifficultyBadge = ({ difficulty }) => {
  const colors = {
    Easy: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Moderate: 'bg-blue-50 text-blue-800 border-blue-200',
    Advanced: 'bg-slate-100 text-slate-800 border-slate-200'
  };

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${colors[difficulty] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      {difficulty}
    </span>
  );
};

export const CommissionBadge = ({ commission, showComingSoon = true }) => {
  const isFpsc = (commission || '').toUpperCase() === 'FPSC';

  if (isFpsc) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-[#15233B] text-white">
        FPSC
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        {commission}
      </span>
      {showComingSoon && (
        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
          Coming Soon
        </span>
      )}
    </span>
  );
};

import React from 'react';
import { Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

/**
 * AdminRoute Guard
 * Strictly enforces that only authenticated users with role === 'admin'
 * can view nested admin routes.
 *
 * Normal students attempting to visit admin URLs are blocked with an
 * explicit 403 Access Denied state, preventing any bypass via direct URL entry.
 */
export const AdminRoute = () => {
  const { user, profile, loading, isConfigured } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-xs text-slate-500 font-medium">Verifying administrator permissions...</div>
      </div>
    );
  }

  // 1. If Supabase is configured and user is not authenticated, redirect to login
  if (isConfigured && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. If user is authenticated (or in configured mode) but role is not admin, deny access
  const isAdmin = profile?.role === 'admin';

  if (!isAdmin && isConfigured) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/40 rounded-xl shadow-sm text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
          403 — Administrator Access Required
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-md mx-auto">
          You are currently signed in as <strong>{profile?.full_name || user?.email || 'Student Candidate'}</strong> with role{' '}
          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            {profile?.role || 'student'}
          </span>
          .
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 mb-6 max-w-md mx-auto">
          Administrative content review, user role management, and syllabus curation are restricted strictly to verified project administrators. All direct API access is enforced via Supabase Row Level Security.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#15233B] hover:bg-slate-800 text-white text-xs font-semibold transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Student Workspace</span>
        </Link>
      </div>
    );
  }

  // Admin access verified
  return <Outlet />;
};


import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  CheckSquare,
  Clock,
  HelpCircle,
  Bookmark,
  TrendingUp,
  Menu,
  X,
  BookOpen,
  LogOut,
  Briefcase,
  ShieldCheck,
  Users
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, profile, signOut } = useAuth();

  const isAdmin = profile?.role === 'admin';

  // Standard student items accessible to all authenticated candidates
  const studentMenuItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'FPSC Jobs', path: '/fpsc-jobs', icon: Briefcase },
    { label: 'Explore Exams', path: '/exams', icon: Search },
    { label: 'Practise MCQs', path: '/practice', icon: CheckSquare },
    { label: 'Mock Tests', path: '/mock-tests', icon: Clock },
    { label: 'AI Tutor', path: '/ai-tutor', icon: HelpCircle },
    { label: 'Saved Questions', path: '/saved', icon: Bookmark },
    { label: 'Performance & Mistakes', path: '/progress', icon: TrendingUp },
  ];

  // Administrative tools — strictly hidden from normal student accounts
  const adminMenuItems = [
    { label: 'Question Quality Review', path: '/admin/review', icon: ShieldCheck },
    { label: 'User Role Management', path: '/admin/users', icon: Users },
  ];

  const isActive = (path) => {
    if (path === '/dashboard' && location.pathname === '/dashboard') return true;
    if (path !== '/dashboard' && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-[#15233B] text-slate-200 flex flex-col transition-transform duration-200 shrink-0 border-r border-slate-800 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#3156A6] flex items-center justify-center text-white">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-base text-white tracking-tight">
                ExamSathi AI
              </span>
              <span className="block text-[10px] text-slate-400">
                Student Workspace
              </span>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-slate-400 hover:text-white p-1 rounded"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {studentMenuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#3156A6] text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* Admin Management Section - Strictly shown for Admins only */}
          {isAdmin && (
            <div className="pt-4 mt-3 border-t border-slate-800">
              <span className="px-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Administration
              </span>
              <div className="mt-1 space-y-1">
                {adminMenuItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.label}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                        active
                          ? 'bg-[#3156A6] text-white font-semibold'
                          : 'text-purple-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-purple-400" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Sidebar Footer User Info */}
        <div className="p-4 border-t border-slate-800 bg-[#0E1726]/40 text-xs text-slate-400 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 truncate max-w-[150px]">
              <span className="font-medium text-slate-200 truncate">
                {profile?.full_name || user?.email || 'Candidate Profile'}
              </span>
              {isAdmin && (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-300 border border-purple-700">
                  ADMIN
                </span>
              )}
            </div>
            {user ? (
              <button
                onClick={() => signOut()}
                className="text-slate-400 hover:text-rose-400 p-1"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            ) : (
              <Link to="/login" className="text-[#3156A6] hover:underline">
                Sign In
              </Link>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {user ? 'Account Synced' : 'Sign in to sync your progress'}
          </p>
        </div>
      </aside>

      {/* Main Workspace Body */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header for Mobile */}
        <header className="md:hidden bg-white border-b border-[#E2E8F0] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md text-slate-700 hover:bg-slate-100"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-bold text-sm text-[#15233B]">
              ExamSathi AI
            </span>
          </div>
          <Link
            to="/"
            className="text-xs text-[#3156A6] font-medium"
          >
            Public Site
          </Link>
        </header>

        {/* Content Outlet */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

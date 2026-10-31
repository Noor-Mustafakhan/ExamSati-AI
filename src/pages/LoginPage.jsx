import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  BookOpen
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Toast } from '../components/common/Toast';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { signIn, isConfigured } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [toastMsg, setToastMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const errs = {};
    if (!email.trim()) {
      errs.email = 'Email address is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errs.email = 'Enter a valid email address';
    }

    if (!password) {
      errs.password = 'Password is required';
    } else if (password.length < 6) {
      errs.password = 'Password must be at least 6 characters';
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      if (isConfigured) {
        await signIn({ email, password });
        setToastMsg('Signed in successfully.');
        setTimeout(() => navigate('/dashboard'), 300);
      } else {
        // Honest development notice when Supabase credentials are not yet configured
        setToastMsg('Demo session active (Supabase .env.local not configured).');
        setTimeout(() => navigate('/dashboard'), 500);
      }
    } catch (err) {
      setErrors({ form: err.message || 'Failed to sign in. Please check your credentials.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-10 px-4 sm:px-6">
      <Toast message={toastMsg} onClose={() => setToastMsg('')} />

      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[#15233B] flex items-center justify-center text-white">
              <BookOpen className="w-4 h-4" />
            </div>
            <span className="font-bold text-xl text-[#15233B]">
              ExamSathi AI
            </span>
          </Link>

          <h1 className="text-2xl font-bold text-[#15233B] tracking-tight">
            Sign in to your account
          </h1>
          <p className="text-xs text-[#64748B]">
            Access your practice targets and mock test records
          </p>
        </div>

        {!isConfigured && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 leading-relaxed">
            <strong>Configuration Notice:</strong> Real Supabase authentication will connect once valid <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> are supplied in <code>.env.local</code>. Running in offline preview mode.
          </div>
        )}

        <div className="bg-white rounded-md p-6 sm:p-7 border border-[#E2E8F0] space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.form && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs">
                {errors.form}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  disabled={isSubmitting}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className={`w-full px-3 py-2 text-sm rounded-md border text-[#172033] focus:outline-hidden ${
                    errors.email ? 'border-rose-500' : 'border-[#E2E8F0] focus:border-[#3156A6]'
                  }`}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-rose-600 mt-1">{errors.email}</p>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-[#172033]">
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  disabled={isSubmitting}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full px-3 py-2 text-sm rounded-md border text-[#172033] focus:outline-hidden ${
                    errors.password ? 'border-rose-500' : 'border-[#E2E8F0] focus:border-[#3156A6]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-rose-600 mt-1">{errors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div className="pt-2 border-t border-[#E2E8F0] text-center text-xs text-[#64748B]">
            Don't have an account yet?{' '}
            <Link to="/register" className="font-semibold text-[#3156A6] hover:underline">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

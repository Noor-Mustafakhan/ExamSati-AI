import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  BookOpen
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { mockExams } from '../data/exams';
import { Toast } from '../components/common/Toast';

export const RegisterPage = () => {
  const navigate = useNavigate();
  const { signUp, isConfigured } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [targetExam, setTargetExam] = useState(mockExams[0]?.title || 'Inspector Customs');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [toastMsg, setToastMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const validate = () => {
    const errs = {};
    if (!fullName.trim()) errs.fullName = 'Full Name is required';
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

    if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
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
        const data = await signUp({ email, password, fullName });
        // Check if email confirmation is required by Supabase
        if (data?.user && !data?.session) {
          setSignupSuccess(true);
          setToastMsg('Account created. Please check your email to verify your account.');
        } else {
          setToastMsg('Account registered successfully.');
          setTimeout(() => navigate('/dashboard'), 300);
        }
      } else {
        setToastMsg('Demo registration completed (Supabase .env.local not configured).');
        setTimeout(() => navigate('/dashboard'), 500);
      }
    } catch (err) {
      setErrors({ form: err.message || 'Registration failed. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-10 px-4 sm:px-6">
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
            Create your account
          </h1>
          <p className="text-xs text-[#64748B]">
            Start practicing with syllabus-aligned competitive exam modules
          </p>
        </div>

        {!isConfigured && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 leading-relaxed">
            <strong>Configuration Notice:</strong> Real Supabase authentication will connect once valid <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> are supplied in <code>.env.local</code>. Running in offline preview mode.
          </div>
        )}

        {signupSuccess ? (
          <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-4 text-center">
            <h2 className="text-base font-bold text-[#15233B]">Registration Successful</h2>
            <p className="text-xs text-[#64748B] leading-relaxed">
              We have sent a confirmation link to <strong className="text-[#172033]">{email}</strong>. Please check your inbox to confirm your email before signing in.
            </p>
            <div className="pt-2">
              <Link
                to="/login"
                className="inline-block px-4 py-2 bg-[#3156A6] text-white rounded-md text-xs font-semibold"
              >
                Go to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-md p-6 sm:p-7 border border-[#E2E8F0] space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              {errors.form && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs">
                  {errors.form}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  disabled={isSubmitting}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Muhammad Asad"
                  className={`w-full px-3 py-2 text-sm rounded-md border text-[#172033] focus:outline-hidden ${
                    errors.fullName ? 'border-rose-500' : 'border-[#E2E8F0] focus:border-[#3156A6]'
                  }`}
                />
                {errors.fullName && (
                  <p className="text-xs text-rose-600 mt-1">{errors.fullName}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  Email Address
                </label>
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
                {errors.email && (
                  <p className="text-xs text-rose-600 mt-1">{errors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  Target Exam Post
                </label>
                <select
                  value={targetExam}
                  disabled={isSubmitting}
                  onChange={(e) => setTargetExam(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-[#E2E8F0] bg-white text-[#172033]"
                >
                  {mockExams.map((ex) => (
                    <option key={ex.id} value={ex.title}>
                      {ex.commission} - {ex.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    disabled={isSubmitting}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
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

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  disabled={isSubmitting}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type password"
                  className={`w-full px-3 py-2 text-sm rounded-md border text-[#172033] focus:outline-hidden ${
                    errors.confirmPassword ? 'border-rose-500' : 'border-[#E2E8F0] focus:border-[#3156A6]'
                  }`}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-rose-600 mt-1">{errors.confirmPassword}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>

            <div className="pt-2 border-t border-[#E2E8F0] text-center text-xs text-[#64748B]">
              Already registered?{' '}
              <Link to="/login" className="font-semibold text-[#3156A6] hover:underline">
                Sign in to your account
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

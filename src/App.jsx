import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AdminRoute } from './components/layout/AdminRoute';
import { MainLayout } from './components/layout/MainLayout';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExamsPage } from './pages/ExamsPage';
import { ExamDetailPage } from './pages/ExamDetailPage';
import { FPSCJobsPage } from './pages/FPSCJobsPage';
import { FPSCJobDetailPage } from './pages/FPSCJobDetailPage';
import { PracticePage } from './pages/PracticePage';
import { MockTestsPage } from './pages/MockTestsPage';
import { AITutorPage } from './pages/AITutorPage';
import { ProgressPage } from './pages/ProgressPage';
import { SavedQuestionsPage } from './pages/SavedQuestionsPage';
import { AdminQuestionReviewPage } from './pages/AdminQuestionReviewPage';
import { AdminUserManagementPage } from './pages/AdminUserManagementPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsAndConditionsPage } from './pages/TermsAndConditionsPage';

import { ErrorBoundary } from './components/common/ErrorBoundary';

export function App() {
  return (
    <AuthProvider>
      <ErrorBoundary title="ExamSathi AI Application">
        <BrowserRouter>
          <Routes>
            {/* Public Navigation Layout */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/exams" element={<ExamsPage />} />
              <Route path="/exams/:id" element={<ExamDetailPage />} />
              <Route path="/fpsc-jobs" element={<FPSCJobsPage />} />
              <Route path="/fpsc-jobs/:id" element={<FPSCJobDetailPage />} />
              <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
              <Route path="/terms-and-conditions" element={<TermsAndConditionsPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/404" element={<NotFoundPage />} />
            </Route>

            {/* Student Dashboard & Workspace Layout (Protected / Local Mode) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/fpsc-jobs" element={<FPSCJobsPage />} />
                <Route path="/fpsc-jobs/:id" element={<FPSCJobDetailPage />} />
                <Route path="/practice" element={<PracticePage />} />
                <Route path="/mock-tests" element={<MockTestsPage />} />
                <Route path="/ai-tutor" element={<AITutorPage />} />
                <Route path="/progress" element={<ProgressPage />} />
                <Route path="/saved" element={<SavedQuestionsPage />} />

                {/* Strictly Guarded Admin Workspace */}
                <Route element={<AdminRoute />}>
                  <Route path="/admin/questions" element={<AdminQuestionReviewPage />} />
                  <Route path="/admin/review" element={<AdminQuestionReviewPage />} />
                  <Route path="/admin/users" element={<AdminUserManagementPage />} />
                </Route>
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </AuthProvider>
  );
}


export default App;

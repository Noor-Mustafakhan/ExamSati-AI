import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="max-w-2xl mx-auto my-8 p-6 bg-white border border-rose-200 rounded-lg shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-rose-50 text-rose-600 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[#15233B]">
                {this.props.title || 'Workspace Error'}
              </h2>
              <p className="text-xs text-[#64748B] leading-relaxed">
                An unexpected issue occurred while rendering this view. Your saved attempts and Mistake Notebook remain secure.
              </p>
              {this.state.error?.message && (
                <div className="mt-2 p-2.5 rounded bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-700 break-words">
                  {this.state.error.message}
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center gap-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-[#3156A6] hover:bg-blue-800 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
            <a
              href="/dashboard"
              className="px-4 py-2 border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Go to Dashboard</span>
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

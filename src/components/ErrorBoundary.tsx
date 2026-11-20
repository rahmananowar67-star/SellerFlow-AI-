import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  details?: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let message = error.message || 'An unexpected application error occurred.';
    let details: string | undefined;

    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed === 'object' && 'operationType' in parsed) {
        message = `Permission or data error during ${parsed.operationType} on ${parsed.path || 'database'}`;
        details = parsed.error;
      }
    } catch {
      // Standard non-JSON error
    }

    return { hasError: true, message, details };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex items-center gap-3 text-red-700 mb-4">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Workspace Recovery Notice
              </h2>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">{this.state.message}</p>
            {this.state.details && (
              <pre className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-600 overflow-x-auto mb-6">
                {this.state.details}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

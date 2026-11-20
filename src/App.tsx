import React, { useState } from 'react';
import { MailCheck, RefreshCw, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PublicPortal } from './components/PublicPortal';
import { CustomerPortal } from './components/CustomerPortal';
import { SellerPortal } from './components/SellerPortal';
import { AdminPortal } from './components/AdminPortal';

const EmailVerificationGate: React.FC = () => {
  const {
    firebaseUser,
    resendVerificationEmail,
    refreshEmailVerification,
    signOutUser,
    navigateToPublic,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleRefresh = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const ok = await refreshEmailVerification();
      if (!ok) {
        setStatusMsg('Email is not verified yet. Please click the verification link in your inbox.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      await resendVerificationEmail();
      setStatusMsg(`Verification link re-sent to ${firebaseUser?.email}.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center mx-auto mb-4">
          <MailCheck className="w-6 h-6" />
        </div>
        <h1 className="font-display text-xl font-bold text-slate-900 mb-2">
          Verify your email address
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          We sent a verification link to{' '}
          <span className="font-semibold text-slate-900">{firebaseUser?.email}</span>. Click the
          link in your inbox, then press Refresh Status below to unlock your SellerFlow AI account.
        </p>
        {statusMsg && (
          <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            {statusMsg}
          </p>
        )}
        <div className="space-y-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRefresh()}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            I Verified My Email — Continue
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleResend()}
            className="w-full py-2 px-4 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            Resend Verification Email
          </button>
          <div className="pt-2 flex items-center justify-center gap-4 text-xs">
            <button
              type="button"
              onClick={() => {
                void signOutUser();
                navigateToPublic('home');
              }}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out & return Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SellerFlowShell: React.FC = () => {
  const { portal, authReady, userProfile, pendingEmailVerification } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center">
          <p className="font-display text-lg font-bold text-slate-900">SellerFlow AI</p>
          <p className="text-xs text-slate-500 mt-1">Initializing workspace...</p>
        </div>
      </div>
    );
  }

  if (pendingEmailVerification) {
    return <EmailVerificationGate />;
  }

  if (portal === 'admin') {
    return <AdminPortal />;
  }

  if (portal === 'seller') {
    if (!userProfile) {
      return <PublicPortal />;
    }
    return <SellerPortal />;
  }

  if (portal === 'customer') {
    return <CustomerPortal />;
  }

  return <PublicPortal />;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SellerFlowShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}

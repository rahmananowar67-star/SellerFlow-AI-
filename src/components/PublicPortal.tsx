import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  CreditCard,
  Home,
  Layers,
  Menu,
  ShieldCheck,
  Sparkles,
  Store as StoreIcon,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  INDIAN_STATES,
  isValidGstin,
  isValidIndianMobile,
  isValidIndianPinCode,
  normalizeIndianMobile,
} from '../lib/indiaData';
import { compressImageToWebP, type SellerOnboardingInput } from '../lib/firestoreService';
import { SUBSCRIPTION_PLANS } from '../lib/seedData';
import { LocaleControls } from './LocaleControls';
import { HeroStudioArtwork, ProductVisual } from './ProductVisual';

export const PublicPortal: React.FC = () => {
  const {
    userProfile,
    isAdmin,
    isSeller,
    publicSection,
    setPublicSection,
    setPortal,
    setCustomerSection,
    setSellerSection,
    navigateToPublic,
    navigateToMarketplace,
    stores,
    products,
    categories,
    platformSettings,
    usingSampleFallback,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    resetPassword,
    authError,
    formatPrice,
    t,
  } = useAuth();

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [featureTab, setFeatureTab] = useState<'customer' | 'seller' | 'economics' | 'security'>('seller');
  const [registerRole, setRegisterRole] = useState<'customer' | 'seller'>('seller');
  const [onboardingTab, setOnboardingTab] = useState<'seller' | 'store'>('seller');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  // Customer + Seller Registration fields (India-ready)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('Karnataka');
  const [pinCode, setPinCode] = useState('');
  const [businessCategory, setBusinessCategory] = useState(
    categories[0]?.name || 'Home & Living'
  );
  const [gstin, setGstin] = useState('');
  const [upiId, setUpiId] = useState('');

  // Store creation fields
  const [storeName, setStoreName] = useState('');
  const [storeCategory, setStoreCategory] = useState(categories[0]?.name || 'Home & Living');
  const [storeDescription, setStoreDescription] = useState('');
  const [returnPolicy, setReturnPolicy] = useState(
    '7-day replacement for transit damage or manufacturing defects.'
  );
  const [shippingPolicy, setShippingPolicy] = useState(
    'Dispatched within 48 business hours via Shiprocket / Delhivery PAN-India.'
  );
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [bannerDataUrl, setBannerDataUrl] = useState<string | undefined>(undefined);

  const [authBusy, setAuthBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleOpenWorkspace = () => {
    if (!userProfile) {
      navigateToPublic('login');
      return;
    }
    if (isAdmin) {
      setPortal('admin');
    } else if (isSeller) {
      setPortal('seller');
    } else {
      navigateToMarketplace('stores');
    }
  };

  const handleImagePick = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'logo' | 'banner'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalError(null);
    try {
      const compressed = await compressImageToWebP(file, target === 'banner' ? 960 : 480, 0.78);
      if (target === 'logo') setLogoDataUrl(compressed.dataUrl);
      else setBannerDataUrl(compressed.dataUrl);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to process image.');
    } finally {
      e.target.value = '';
    }
  };

  const buildSellerOnboardingPayload = (): SellerOnboardingInput => ({
    fullName: fullName.trim() || undefined,
    businessName: businessName.trim() || storeName.trim(),
    mobile: mobile ? normalizeIndianMobile(mobile) : undefined,
    address: address.trim() || undefined,
    city: city.trim() || undefined,
    state: stateName,
    pinCode: pinCode.trim() || undefined,
    businessCategory,
    gstin: gstin.trim().toUpperCase() || undefined,
    upiId: upiId.trim() || undefined,
    storeName: (storeName || businessName).trim(),
    storeCategory: storeCategory || businessCategory,
    storeDescription: storeDescription.trim() || undefined,
    returnPolicy: returnPolicy.trim() || undefined,
    shippingPolicy: shippingPolicy.trim() || undefined,
    logoDataUrl,
    bannerDataUrl,
  });

  const validateSellerForm = (requireEmailPassword: boolean): string | null => {
    if (registerRole === 'customer') {
      if (requireEmailPassword) {
        if (!fullName.trim()) return 'Enter your full name.';
        if (!email.includes('@')) return 'Enter a valid email address.';
        if (password.length < 6) return 'Password must be at least 6 characters.';
      }
      return null;
    }
    if (businessName.trim().length < 2) {
      return 'Enter your business name (at least 2 characters).';
    }
    if (mobile && !isValidIndianMobile(mobile)) {
      return 'Enter a valid 10-digit Indian mobile number starting with 6–9.';
    }
    if (pinCode && !isValidIndianPinCode(pinCode)) {
      return 'Enter a valid 6-digit Indian PIN code.';
    }
    if (gstin && !isValidGstin(gstin)) {
      return 'Enter a valid 15-character GSTIN (or leave blank if unregistered).';
    }
    if (requireEmailPassword) {
      if (!fullName.trim()) return 'Enter your full name.';
      if (!email.includes('@')) return 'Enter a valid email address.';
      if (password.length < 6) return 'Password must be at least 6 characters.';
      if (!mobile || !isValidIndianMobile(mobile)) {
        return 'Enter a valid 10-digit Indian mobile number.';
      }
      if (!address.trim() || !city.trim() || !isValidIndianPinCode(pinCode)) {
        return 'Complete your Indian business address, city, and 6-digit PIN code.';
      }
    }
    return null;
  };

  const handleGoogleAuthAction = async (mode: 'login' | 'register') => {
    setLocalError(null);
    if (mode === 'register') {
      const err = validateSellerForm(false);
      if (err) {
        setLocalError(err);
        return;
      }
    }
    setAuthBusy(true);
    try {
      if (mode === 'register') {
        const onboarding = registerRole === 'seller' ? buildSellerOnboardingPayload() : undefined;
        await signInWithGoogle(
          registerRole,
          onboarding?.businessName || undefined,
          onboarding
        );
      } else {
        await signInWithGoogle();
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Google authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleEmailLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setResetMessage(null);
    setAuthBusy(true);
    try {
      await signInWithEmail(loginEmail, loginPassword);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setResetMessage(null);
    setAuthBusy(true);
    try {
      await resetPassword(loginEmail);
      setResetMessage(`Password reset email sent to ${loginEmail.trim()}. Check your inbox.`);
      setShowForgotPassword(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to send password reset email.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleEmailRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const err = validateSellerForm(true);
    if (err) {
      setLocalError(err);
      return;
    }
    setAuthBusy(true);
    try {
      await registerWithEmail({
        email,
        password,
        displayName: fullName.trim() || email.split('@')[0],
        intendedRole: registerRole,
        sellerOnboarding: registerRole === 'seller' ? buildSellerOnboardingPayload() : undefined,
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Registration failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const dynamicPlans = SUBSCRIPTION_PLANS.map((plan) => {
    if (plan.id === 'starter') {
      return {
        ...plan,
        monthlyPriceCents: platformSettings.starterPriceCents,
        annualPriceCents: Math.round(platformSettings.starterPriceCents * 0.8),
        commissionRate: platformSettings.starterCommissionRate,
        skuLimit: `${platformSettings.starterSkuLimit} active SKUs`,
      };
    }
    if (plan.id === 'growth') {
      return {
        ...plan,
        monthlyPriceCents: platformSettings.growthPriceCents,
        annualPriceCents: Math.round(platformSettings.growthPriceCents * 0.8),
        commissionRate: platformSettings.growthCommissionRate,
        skuLimit: `${platformSettings.growthSkuLimit} active SKUs`,
      };
    }
    return {
      ...plan,
      monthlyPriceCents: platformSettings.proPriceCents,
      annualPriceCents: Math.round(platformSettings.proPriceCents * 0.8),
      commissionRate: platformSettings.proCommissionRate,
      skuLimit:
        platformSettings.proSkuLimit >= 5000
          ? 'Unlimited SKUs'
          : `${platformSettings.proSkuLimit} active SKUs`,
    };
  });

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-slate-900">
      {/* Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              navigateToPublic('home');
            }}
            className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-slate-900 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            aria-label="SellerFlow AI Home"
          >
            <span className="w-7 h-7 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <span>SellerFlow AI</span>
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => navigateToPublic('home')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                publicSection === 'home'
                  ? 'border-blue-700 text-slate-900'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              {t('nav.home')}
            </button>
            <button
              type="button"
              onClick={() => navigateToPublic('features')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                publicSection === 'features'
                  ? 'border-blue-700 text-slate-900'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              {t('nav.features')}
            </button>
            <button
              type="button"
              onClick={() => navigateToPublic('pricing')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                publicSection === 'pricing'
                  ? 'border-blue-700 text-slate-900'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              {t('nav.pricing')}
            </button>
            <button
              type="button"
              onClick={() => navigateToMarketplace('stores')}
              className="whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:text-slate-900 transition-colors cursor-pointer"
            >
              {t('nav.marketplace')}
            </button>
            {isSeller && (
              <button
                type="button"
                onClick={() => setPortal('seller')}
                className="whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent text-blue-700 hover:text-blue-800 transition-colors cursor-pointer"
              >
                {t('sell.portal')}
              </button>
            )}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <LocaleControls compact />
            </div>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                handleOpenWorkspace();
              }}
              className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {userProfile ? t('nav.openWorkspace') : t('nav.login')}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Responsive Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-200 px-4 py-3 space-y-3 shadow-sm">
            <LocaleControls fullWidth />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateToPublic('home');
                }}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg cursor-pointer ${
                  publicSection === 'home'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-700 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                {t('nav.home')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateToPublic('features');
                }}
                className={`text-left px-3 py-2 text-xs font-medium rounded-lg cursor-pointer ${
                  publicSection === 'features'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-700 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                {t('nav.features')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateToPublic('pricing');
                }}
                className={`text-left px-3 py-2 text-xs font-medium rounded-lg cursor-pointer ${
                  publicSection === 'pricing'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-700 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                {t('nav.pricing')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateToMarketplace('stores');
                }}
                className="text-left px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                {t('nav.marketplace')}
              </button>
            </div>

            {userProfile && (
              <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setPortal('admin');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg cursor-pointer"
                  >
                    Admin Dashboard
                  </button>
                )}
                {isSeller && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setPortal('seller');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Seller Dashboard
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content Views */}
      <main className="flex-1">
        {publicSection === 'home' && (
          <>
            {/* Section 1: Hero */}
            <section className="max-w-7xl mx-auto px-6 pt-12 pb-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-center py-4">
                  <p className="text-xs font-medium text-blue-700 tracking-wide mb-3">
                    {t('hero.badge')}
                  </p>
                  <h1
                    className="font-display font-bold text-slate-900 tracking-tight leading-[1.08] mb-5"
                    style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', textWrap: 'balance' }}
                  >
                    {t('hero.title')}
                  </h1>
                  <p className="text-base text-slate-600 leading-relaxed max-w-xl mb-8">
                    {t('hero.subtitle')}
                  </p>
                  <div className="flex flex-wrap items-center gap-5">
                    <button
                      type="button"
                      onClick={() => {
                        if (userProfile) {
                          handleOpenWorkspace();
                        } else {
                          setRegisterRole('seller');
                          setPublicSection('register');
                        }
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {userProfile ? t('nav.openWorkspace') : t('hero.ctaStartSeller')}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPortal('customer');
                        setCustomerSection('stores');
                      }}
                      className="text-sm font-medium text-slate-700 hover:text-slate-900 underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {t('hero.ctaBrowse')}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6 min-h-[320px] lg:min-h-[420px] rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
                  <HeroStudioArtwork />
                </div>
              </div>

              {/* 4-Column Full-Width KPI Strip Below Hero */}
              <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 border border-slate-200 bg-white rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                <div className="p-6">
                  <p className="text-xs text-slate-500 mb-1">Active Storefronts</p>
                  <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900">
                    {stores.length} {usingSampleFallback ? 'Sample' : 'Curated'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Indian direct-to-consumer merchants</p>
                </div>
                <div className="p-6">
                  <p className="text-xs text-slate-500 mb-1">Live Catalog Volume</p>
                  <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900">
                    {products.length} SKUs
                  </p>
                  <p className="text-xs text-slate-500 mt-1">INR pricing, variants & GST tracking</p>
                </div>
                <div className="p-6">
                  <p className="text-xs text-slate-500 mb-1">AI Studio Turnaround</p>
                  <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900">
                    &lt; 4 sec
                  </p>
                  <p className="text-xs text-slate-500 mt-1">SEO copy, tags & INR margin pricing</p>
                </div>
                <div className="p-6">
                  <p className="text-xs text-slate-500 mb-1">Commission Floor</p>
                  <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900">
                    {(platformSettings.proCommissionRate * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Pro plan UPI/IMPS payout settlement</p>
                </div>
              </div>
            </section>

            {/* Section 2: Asymmetric Capabilities Bento */}
            <section className="max-w-7xl mx-auto px-6 py-14 border-t border-slate-200">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
                <div>
                  <p className="text-xs font-medium text-blue-700 mb-2">Platform Architecture</p>
                  <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                    Four synchronized portals on one real-time database
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setPublicSection('features')}
                  className="text-sm font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Inspect all capabilities
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      01. Multi-Image Catalog & AI Product Studio
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed max-w-2xl mb-6">
                      Upload multiple product images, configure size and color variants, weight,
                      shipping & return policies, or generate structured INR listings with Gemini AI
                      and submit them for marketplace approval.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-100 text-xs text-slate-600">
                    <div>
                      <p className="font-medium text-slate-900 mb-1">Persisted Asset Vault</p>
                      <p>Compressed WebP multi-image galleries synced to your SKU.</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 mb-1">INR Unit Economics</p>
                      <p>Selling price, MRP discount %, GST & break-even ROAS modeler.</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 mb-1">Shiprocket & Tracking</p>
                      <p>6-stage Indian fulfillment lifecycle with AWB & GST invoices.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      02. Customer Marketplace
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed mb-6">
                      Shoppers explore approved storefronts, select sizes & colors, save wishlists,
                      pay via Razorpay or Cash on Delivery, review products, and track orders live.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPortal('customer');
                      setCustomerSection('search');
                    }}
                    className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                  >
                    Search {products.length} Live Products
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-8">
                  <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                    03. Seller Payouts & CRM
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Track gross earnings, platform commissions, net withdrawable INR balance, request
                    UPI or IMPS/NEFT payouts, and manage repeat customer CRM segments.
                  </p>
                </div>

                <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      04. Admin Governance, Refunds & Commission Ledger
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
                      Approve sellers and products, manage categories and GST rates, settle payouts,
                      resolve customer refunds and disputes, and tune SaaS plans from System Settings.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPublicSection('pricing')}
                    className="px-4 py-2 border border-slate-300 bg-white text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Compare Plans
                  </button>
                </div>
              </div>
            </section>

            {/* Section 3: Featured Live Storefronts Preview + Proof */}
            <section className="max-w-7xl mx-auto px-6 py-14 border-t border-slate-200">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
                <div>
                  <p className="text-xs font-medium text-blue-700 mb-2">
                    {usingSampleFallback ? t('public.featuredStores') : t('public.featuredProducts')}
                  </p>
                  <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                    {t('public.featuredProducts')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPortal('customer');
                    setCustomerSection('stores');
                  }}
                  className="text-sm font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {t('public.browseAll')}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {products.slice(0, 6).map((product) => (
                  <article
                    key={product.id}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <ProductVisual
                      variant={product.visualVariant}
                      imageDataUrl={product.imageDataUrl}
                      title={product.title}
                      className="w-full aspect-[4/3]"
                    />
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                          <span className="truncate">
                            {product.storeName} · {product.category}
                          </span>
                          {product.isSample && (
                            <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                              Sample
                            </span>
                          )}
                        </div>
                        <h3 className="font-display text-base font-semibold text-slate-900 mb-1">
                          {product.title}
                        </h3>
                        <p className="text-sm text-slate-600 line-clamp-2 mb-4">
                          {product.description}
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                        <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                          {formatPrice(product.priceCents, product.currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPortal('customer');
                            setCustomerSection('search');
                          }}
                          className="text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                        >
                          {t('public.viewProduct')}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <p className="text-xs font-mono tabular-nums text-blue-700 mb-2">
                    +64% Repeat Customer Orders in 90 Days
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed mb-4">
                    “Moving Jaipur Clay & Brass Atelier onto SellerFlow AI cut our SKU launch cycle
                    from four days to twenty minutes while unifying GST invoicing and repeat buyer CRM.”
                  </p>
                  <p className="text-xs text-slate-500">
                    Arjun Rathore · Founder, Jaipur Clay & Brass Atelier (Jaipur)
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <p className="text-xs font-mono tabular-nums text-blue-700 mb-2">
                    +18.4% Gross Margin Improvement Across 14 SKUs
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed mb-4">
                    “The INR Profit Calculator and AI Product Studio surfaced shipping and GST leaks
                    before our Bengaluru launch and helped us dial in sustainable unit margins.”
                  </p>
                  <p className="text-xs text-slate-500">
                    Ananya Deshmukh · Operations Lead, Koramangala Acoustic Labs (Bengaluru)
                  </p>
                </div>
              </div>
            </section>
          </>
        )}

        {publicSection === 'features' && (
          <section className="max-w-7xl mx-auto px-6 py-14">
            <div className="max-w-2xl mb-10">
              <p className="text-xs font-medium text-blue-700 mb-2">Complete System Breakdown</p>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-4">
                Every workflow from storefront discovery to settlement
              </h1>
              <p className="text-base text-slate-600 leading-relaxed">
                Inspect how each portal converts merchant intent into live database state,
                verified Razorpay & COD payments, and Shiprocket-ready fulfillment.
              </p>
            </div>

            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg mb-8">
              {[
                { key: 'seller', label: 'Seller AI & Catalog', icon: Sparkles },
                { key: 'customer', label: 'Customer Marketplace', icon: StoreIcon },
                { key: 'economics', label: 'Profit & Payouts', icon: TrendingUp },
                { key: 'security', label: 'Governance & Security', icon: ShieldCheck },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFeatureTab(key as typeof featureTab)}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    featureTab === key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-8">
              {featureTab === 'seller' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">Full Product Upload</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      Multi-image, variants & approval flow
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Upload multiple persisted WebP product photos, sizes, colors, MRP discount %,
                      weight, dimensions, and shipping/return policies. Save as Draft or Submit for
                      Admin Approval.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">AI Product & Marketing Studio</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      Editable AI listings in INR
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Generate product title, category, tags, SEO keywords, promotional caption,
                      and INR selling/MRP suggestions—then edit or load into the Product Form.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">Store Builder & Shipping</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      Logo, banner & Shiprocket courier dispatch
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Customize store banner, logo, policies, and dispatch orders via Shiprocket
                      API or manual Indian courier AWB entry with printable GST invoices.
                    </p>
                  </div>
                </div>
              )}

              {featureTab === 'customer' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">Discovery & Variants</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      Storefronts, gallery, sizes & wishlist
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Inspect multi-image product galleries, choose size and color options, save to
                      persistent wishlist, and read or submit verified product reviews.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">Indian Checkout</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      Razorpay UPI/Card & Cash on Delivery
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Multi-merchant checkout with 10-digit mobile & 6-digit PIN code validation,
                      CGST/SGST tax breakdown, Razorpay HMAC-verified payment, and COD support.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">6-Stage Tracking</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      Live order status, refunds & disputes
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Track orders across Pending, Confirmed, Processing, Shipped, Out for Delivery,
                      and Delivered—with cancellation, refund requests, and dispute escalation.
                    </p>
                  </div>
                </div>
              )}

              {featureTab === 'economics' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">Profit Calculator</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      INR unit economics & GST modeling
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Calculate landed COGS, courier cost, packaging, ad CPA, return reserve, and
                      commission fees in ₹ to find exact net margin and break-even ROAS.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">Revenue & Payouts</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      Commission ledger & UPI/Bank withdrawal
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Inspect order-level gross sales, platform fee deductions, net earnings, and
                      submit payout requests directly to your verified UPI ID or bank IFSC.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">Customer CRM</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      VIP & repeat buyer tracking
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Every checkout updates your store’s CRM ledger with lifetime INR spend, order
                      counts, and segment classification.
                    </p>
                  </div>
                </div>
              )}

              {featureTab === 'security' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">Hardened RBAC</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      Verified Auth & strict tenant isolation
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      19-collection Firestore security rules enforce role boundaries, verified
                      email tokens, and admin moderation gates on sellers and products.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">Payment Verification</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      Server-side Razorpay HMAC-SHA256 checks
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Razorpay secrets stay strictly on the Express backend; online orders are never
                      marked paid without cryptographic signature verification.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-2">Admin Controls</p>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">
                      Full platform oversight & system settings
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Moderate sellers, stores, and products, configure GST & shipping rules, settle
                      commissions/payouts, and resolve customer refunds or disputes.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {publicSection === 'pricing' && (
          <section className="max-w-7xl mx-auto px-6 py-14">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
              <div className="max-w-2xl">
                <p className="text-xs font-medium text-blue-700 mb-2">Transparent Indian Merchant Plans</p>
                <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-3">
                  Simple INR pricing with lower commissions as you scale
                </h1>
                <p className="text-sm text-slate-600">
                  Customers shop free forever. Sellers choose Starter (₹0), Growth, or Pro tiers
                  configured by platform governance.
                </p>
              </div>

              <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg shrink-0 self-start">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    billingCycle === 'monthly'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    billingCycle === 'annual'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Annual (Save 20%)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {dynamicPlans.map((plan) => {
                const price =
                  billingCycle === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents;
                const featured = plan.id === 'growth';
                return (
                  <div
                    key={plan.id}
                    className={`bg-white rounded-xl p-8 flex flex-col justify-between ${
                      featured ? 'border-2 border-blue-700' : 'border border-slate-200'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-medium text-blue-700 mb-1">{plan.audience}</p>
                      <h3 className="font-display text-xl font-bold text-slate-900 mb-4">
                        {plan.name}
                      </h3>
                      <div className="flex items-baseline gap-1 mb-6">
                        <span className="font-mono tabular-nums text-3xl font-bold text-slate-900">
                          {formatPrice(price, 'INR')}
                        </span>
                        <span className="text-xs text-slate-500">/ month</span>
                      </div>

                      <div className="space-y-2 py-4 border-y border-slate-100 text-xs mb-6">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Catalog Limit</span>
                          <span className="font-mono tabular-nums font-medium text-slate-900">
                            {plan.skuLimit}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">AI Studio Quota</span>
                          <span className="font-mono tabular-nums font-medium text-slate-900">
                            {plan.aiRunsLimit}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Marketplace Commission</span>
                          <span className="font-mono tabular-nums font-medium text-slate-900">
                            {(plan.commissionRate * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Payout Cadence</span>
                          <span className="font-medium text-slate-900">{plan.payoutCadence}</span>
                        </div>
                      </div>

                      <ul className="space-y-2.5 mb-8">
                        {plan.highlights.map((item) => (
                          <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                            <Check className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (isSeller) {
                          setPortal('seller');
                          setSellerSection('settings');
                        } else {
                          setRegisterRole('seller');
                          setPublicSection('register');
                        }
                      }}
                      className={`w-full py-2.5 px-4 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                        featured
                          ? 'bg-blue-700 text-white hover:bg-blue-800'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {isSeller ? `Manage ${plan.name} Plan` : `Start with ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {(publicSection === 'login' || publicSection === 'register') && (
          <section
            className={`${
              publicSection === 'register' && registerRole === 'seller'
                ? 'max-w-3xl'
                : 'max-w-lg'
            } mx-auto px-6 py-12`}
          >
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg mb-6 max-w-sm">
                <button
                  type="button"
                  onClick={() => {
                    setLocalError(null);
                    setPublicSection('login');
                  }}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    publicSection === 'login'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocalError(null);
                    setPublicSection('register');
                  }}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    publicSection === 'register'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Register
                </button>
              </div>

              <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">
                {publicSection === 'login'
                  ? t('auth.welcomeBack')
                  : registerRole === 'seller'
                  ? t('auth.createSeller')
                  : t('auth.createCustomer')}
              </h1>
              <p className="text-sm text-slate-600 mb-6">
                {publicSection === 'login'
                  ? 'Sign in with Email & Password or your verified Google account to access your Customer, Seller, or Admin workspace.'
                  : registerRole === 'seller'
                  ? 'Register your Indian business and initialize your private Seller Dashboard & Storefront in one step.'
                  : 'Create your shopper account to save wishlists, place orders, and track shipments across India.'}
              </p>

              {/* LOGIN VIEW */}
              {publicSection === 'login' && (
                <div className="space-y-5">
                  {!showForgotPassword ? (
                    <form onSubmit={(e) => void handleEmailLoginSubmit(e)} className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {t('auth.email')}
                        </label>
                        <input
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="you@brand.in"
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-700">
                            Password
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setLocalError(null);
                              setResetMessage(null);
                              setShowForgotPassword(true);
                            }}
                            className="text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                          >
                            {t('auth.forgotPassword')}
                          </button>
                        </div>
                        <input
                          type="password"
                          required
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={authBusy}
                        className="w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                      >
                        {authBusy ? 'Signing in...' : 'Sign In with Email'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={(e) => void handlePasswordResetSubmit(e)} className="space-y-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-900">{t('auth.forgotPassword')}</p>
                        <button
                          type="button"
                          onClick={() => setShowForgotPassword(false)}
                          className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                        >
                          Back to Login
                        </button>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {t('auth.email')}
                        </label>
                        <input
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="Enter your registered email"
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={authBusy}
                        className="w-full py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                      >
                        {authBusy ? 'Sending...' : t('auth.sendResetEmail')}
                      </button>
                    </form>
                  )}

                  {resetMessage && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                      {resetMessage}
                    </div>
                  )}

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-slate-200" />
                    <span className="shrink mx-3 text-xs text-slate-400">or</span>
                    <div className="flex-grow border-t border-slate-200" />
                  </div>

                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={() => void handleGoogleAuthAction('login')}
                    className="w-full py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {authBusy ? 'Connecting Google Account...' : t('auth.continueGoogle')}
                  </button>
                </div>
              )}

              {/* REGISTER VIEW */}
              {publicSection === 'register' && (
                <form onSubmit={(e) => void handleEmailRegisterSubmit(e)} className="space-y-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-2">
                      Account Portal Role
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRegisterRole('seller')}
                        className={`p-3 text-left rounded-lg border transition-colors cursor-pointer ${
                          registerRole === 'seller'
                            ? 'border-blue-700 bg-blue-50/50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-0.5">
                          <Layers className="w-4 h-4 text-blue-700" />
                          Seller Studio
                        </div>
                        <p className="text-xs text-slate-500">Launch Indian storefront & SKUs</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegisterRole('customer')}
                        className={`p-3 text-left rounded-lg border transition-colors cursor-pointer ${
                          registerRole === 'customer'
                            ? 'border-blue-700 bg-blue-50/50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-0.5">
                          <CreditCard className="w-4 h-4 text-blue-700" />
                          Customer
                        </div>
                        <p className="text-xs text-slate-500">Shop stores & track orders</p>
                      </button>
                    </div>
                  </div>

                  {registerRole === 'seller' && (
                    <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                      <button
                        type="button"
                        onClick={() => setOnboardingTab('seller')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                          onboardingTab === 'seller'
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        1. Seller & Business Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setOnboardingTab('store')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                          onboardingTab === 'store'
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        2. Storefront Creation
                      </button>
                    </div>
                  )}

                  {(registerRole === 'customer' || onboardingTab === 'seller') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Aarav Sharma"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@domain.in"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Password (for Email signup)
                        </label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min 6 characters"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Mobile Number (India 10-digit) {registerRole === 'seller' ? '*' : ''}
                        </label>
                        <input
                          type="tel"
                          value={mobile}
                          onChange={(e) => setMobile(e.target.value)}
                          placeholder="9876543210"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                        />
                      </div>

                      {registerRole === 'seller' && (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Business Name *
                            </label>
                            <input
                              type="text"
                              value={businessName}
                              onChange={(e) => {
                                setBusinessName(e.target.value);
                                if (!storeName) setStoreName(e.target.value);
                              }}
                              placeholder="e.g. Deccan Craft Collective"
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Business Category *
                            </label>
                            <select
                              value={businessCategory}
                              onChange={(e) => {
                                setBusinessCategory(e.target.value);
                                setStoreCategory(e.target.value);
                              }}
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
                            >
                              {categories.map((c) => (
                                <option key={c.id} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Business Address *
                            </label>
                            <input
                              type="text"
                              value={address}
                              onChange={(e) => setAddress(e.target.value)}
                              placeholder="Plot / Street / Industrial Area"
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              City *
                            </label>
                            <input
                              type="text"
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              placeholder="Bengaluru / Jaipur / Mumbai"
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              State *
                            </label>
                            <select
                              value={stateName}
                              onChange={(e) => setStateName(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
                            >
                              {INDIAN_STATES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              PIN Code (6 digits) *
                            </label>
                            <input
                              type="text"
                              value={pinCode}
                              onChange={(e) => setPinCode(e.target.value)}
                              placeholder="560034"
                              maxLength={6}
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-blue-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              GSTIN (Optional) & UPI ID
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={gstin}
                                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                                placeholder="29ABCDE1234F1Z5"
                                maxLength={15}
                                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-blue-700"
                              />
                              <input
                                type="text"
                                value={upiId}
                                onChange={(e) => setUpiId(e.target.value)}
                                placeholder="merchant@upi"
                                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {registerRole === 'seller' && onboardingTab === 'store' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Store Name
                        </label>
                        <input
                          type="text"
                          value={storeName}
                          onChange={(e) => setStoreName(e.target.value)}
                          placeholder={businessName || 'Public Storefront Name'}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Store Category
                        </label>
                        <select
                          value={storeCategory}
                          onChange={(e) => setStoreCategory(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Store Description
                        </label>
                        <textarea
                          rows={2}
                          value={storeDescription}
                          onChange={(e) => setStoreDescription(e.target.value)}
                          placeholder="Describe what your brand crafts and ships across India..."
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Store Logo (Compressed WebP)
                        </label>
                        <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{logoDataUrl ? 'Logo selected (Replace)' : 'Upload Logo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => void handleImagePick(e, 'logo')}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Store Banner (Compressed WebP)
                        </label>
                        <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{bannerDataUrl ? 'Banner selected (Replace)' : 'Upload Banner'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => void handleImagePick(e, 'banner')}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Return Policy
                        </label>
                        <input
                          type="text"
                          value={returnPolicy}
                          onChange={(e) => setReturnPolicy(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Shipping Policy
                        </label>
                        <input
                          type="text"
                          value={shippingPolicy}
                          onChange={(e) => setShippingPolicy(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                        />
                      </div>
                    </div>
                  )}

                  {(localError || authError) && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      {localError || authError}
                    </div>
                  )}

                  <div className="space-y-3 pt-2">
                    {registerRole === 'seller' && onboardingTab === 'seller' ? (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={() => setOnboardingTab('store')}
                          className="flex-1 py-2.5 px-4 border border-slate-300 text-slate-800 text-sm font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          Next: Customize Storefront →
                        </button>
                        <button
                          type="button"
                          disabled={authBusy}
                          onClick={() => void handleGoogleAuthAction('register')}
                          className="flex-1 py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                        >
                          {authBusy ? 'Creating...' : 'Continue with Google & Create Store'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="submit"
                          disabled={authBusy}
                          className="w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                        >
                          {authBusy
                            ? 'Creating Account...'
                            : registerRole === 'seller'
                            ? 'Register Seller & Create Store (Email)'
                            : 'Create Customer Account (Email)'}
                        </button>
                        <button
                          type="button"
                          disabled={authBusy}
                          onClick={() => void handleGoogleAuthAction('register')}
                          className="w-full py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                        >
                          {authBusy
                            ? 'Connecting Google...'
                            : registerRole === 'seller'
                            ? 'Continue with Google & Create Store'
                            : 'Continue with Google'}
                        </button>
                      </>
                    )}
                  </div>
                </form>
              )}

              {publicSection === 'login' && (localError || authError) && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {localError || authError}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>SellerFlow AI · Indian Multi-Vendor Commerce Operating System</p>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setPublicSection('features')}
              className="hover:text-slate-900 cursor-pointer"
            >
              Capabilities
            </button>
            <button
              type="button"
              onClick={() => setPublicSection('pricing')}
              className="hover:text-slate-900 cursor-pointer"
            >
              INR Pricing
            </button>
            <button
              type="button"
              onClick={() => {
                setPortal('customer');
                setCustomerSection('stores');
              }}
              className="hover:text-slate-900 cursor-pointer"
            >
              Marketplace
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

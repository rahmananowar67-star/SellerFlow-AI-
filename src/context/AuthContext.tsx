import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  clearSampleMarketplaceData,
  seedMarketplaceIfEmpty,
  subscribeActiveStores,
  subscribeCategories,
  subscribeCustomerWishlist,
  subscribeNotifications,
  subscribePlatformSettings,
  subscribePublishedProducts,
  syncSampleCatalogMedia,
  syncUserProfile,
  toggleWishlistItem,
  updateUserPreferences,
  upgradeCustomerToSeller,
  type SellerOnboardingInput,
} from '../lib/firestoreService';
import {
  ALL_CURRENCIES,
  DEFAULT_FX_RATES,
  convertCurrencyMinorUnits,
  formatCurrency,
  sanitizeCurrency,
  type FxFeedMeta,
  type FxRatesMap,
  type SupportedCurrency,
} from '../lib/currency';
import {
  ALL_LANGUAGES,
  sanitizeLanguage,
  t as translateKey,
  type SupportedLanguage,
} from '../lib/i18n';
import { DEFAULT_MARKETPLACE_CATEGORIES } from '../lib/indiaData';
import { DEFAULT_PLATFORM_SETTINGS, SEED_PRODUCTS, SEED_STORES } from '../lib/seedData';
import type {
  AdminSection,
  CartItem,
  CategoryRecord,
  CustomerSection,
  NotificationItem,
  PlatformSettings,
  PortalView,
  Product,
  PublicSection,
  SellerSection,
  Store,
  UserProfile,
  WishlistItem,
} from '../types/commerce';

export interface IntegrationsStatus {
  geminiConfigured: boolean;
  razorpayConfigured: boolean;
  razorpayKeyId: string | null;
  razorpayWebhookConfigured: boolean;
  upiSupported?: boolean;
  shiprocketConfigured: boolean;
  whatsappConfigured?: boolean;
  whatsappWebhookConfigured?: boolean;
  fxLiveSupported?: boolean;
  codAvailable: boolean;
  currency: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  authReady: boolean;
  authError: string | null;
  pendingEmailVerification: boolean;
  isAdmin: boolean;
  isSeller: boolean;
  portal: PortalView;
  setPortal: (portal: PortalView) => void;
  publicSection: PublicSection;
  setPublicSection: (s: PublicSection) => void;
  customerSection: CustomerSection;
  setCustomerSection: (s: CustomerSection) => void;
  sellerSection: SellerSection;
  setSellerSection: (s: SellerSection) => void;
  adminSection: AdminSection;
  setAdminSection: (s: AdminSection) => void;
  navigateToPublic: (section?: PublicSection) => void;
  navigateToMarketplace: (section?: CustomerSection) => void;
  selectedStoreId: string | null;
  setSelectedStoreId: (id: string | null) => void;
  stores: Store[];
  products: Product[];
  categories: CategoryRecord[];
  platformSettings: PlatformSettings;
  integrationsStatus: IntegrationsStatus;
  catalogLoading: boolean;
  usingSampleFallback: boolean;
  cart: CartItem[];
  addToCart: (product: Product, qty?: number, selectedSize?: string, selectedColor?: string) => void;
  updateCartQty: (cartKey: string, qty: number) => void;
  removeFromCart: (cartKey: string) => void;
  clearCart: () => void;
  wishlist: WishlistItem[];
  isWishlisted: (productId: string) => boolean;
  toggleWishlist: (product: Product) => Promise<void>;
  notifications: NotificationItem[];
  signInWithGoogle: (
    intendedRole?: 'customer' | 'seller',
    businessName?: string,
    sellerOnboarding?: SellerOnboardingInput
  ) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (params: {
    email: string;
    password: string;
    displayName: string;
    intendedRole: 'customer' | 'seller';
    sellerOnboarding?: SellerOnboardingInput;
  }) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;
  updateLocalUserProfile: (patch: Partial<UserProfile>) => void;
  signOutUser: () => Promise<void>;
  becomeSeller: (businessName: string, onboarding?: SellerOnboardingInput) => Promise<void>;
  triggerMarketplaceSeed: () => Promise<boolean>;
  syncSampleMedia: () => Promise<{ stores: number; products: number; categories: number }>;
  clearSampleData: () => Promise<number>;
  refreshIntegrationsStatus: () => Promise<void>;
  currency: SupportedCurrency;
  setCurrency: (c: SupportedCurrency) => void;
  language: SupportedLanguage;
  setLanguage: (l: SupportedLanguage) => void;
  availableCurrencies: SupportedCurrency[];
  availableLanguages: SupportedLanguage[];
  fxFeed: FxFeedMeta;
  fxRates: FxRatesMap;
  refreshFxRates: (force?: boolean) => Promise<void>;
  formatPrice: (amountMinor: number, fromCurrency?: SupportedCurrency) => string;
  convertPrice: (amountMinor: number, fromCurrency?: SupportedCurrency, toCurrency?: SupportedCurrency) => number;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const VALID_PUBLIC: PublicSection[] = ['home', 'features', 'pricing', 'login', 'register'];
const VALID_CUSTOMER: CustomerSection[] = [
  'stores',
  'search',
  'wishlist',
  'cart',
  'checkout',
  'orders',
  'tracking',
];
const VALID_SELLER: SellerSection[] = [
  'overview',
  'my-store',
  'add-product',
  'products',
  'categories',
  'inventory',
  'orders',
  'shipping',
  'crm',
  'analytics',
  'earnings',
  'payouts',
  'store-builder',
  'ai-product-studio',
  'ai-marketing-studio',
  'profit-calculator',
  'store-settings',
  'settings',
];
const VALID_ADMIN: AdminSection[] = [
  'users',
  'sellers',
  'stores',
  'products',
  'categories',
  'orders',
  'payments',
  'commissions',
  'subscriptions',
  'refunds',
  'disputes',
  'reports',
  'settings',
];

export function getCartItemKey(item: Pick<CartItem, 'product' | 'selectedSize' | 'selectedColor'>): string {
  return `${item.product.id}__${item.selectedSize || ''}__${item.selectedColor || ''}`;
}

function parseHashRoute(hash: string): {
  portal: PortalView;
  publicSection?: PublicSection;
  customerSection?: CustomerSection;
  sellerSection?: SellerSection;
  adminSection?: AdminSection;
} {
  const clean = hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (!clean || clean === 'home') {
    return { portal: 'public', publicSection: 'home' };
  }
  const [head, sub] = clean.split('/');
  if (VALID_PUBLIC.includes(head as PublicSection)) {
    return { portal: 'public', publicSection: head as PublicSection };
  }
  if (head === 'marketplace' || head === 'customer') {
    const sec = VALID_CUSTOMER.includes(sub as CustomerSection)
      ? (sub as CustomerSection)
      : 'stores';
    return { portal: 'customer', customerSection: sec };
  }
  if (head === 'seller') {
    const sec = VALID_SELLER.includes(sub as SellerSection)
      ? (sub as SellerSection)
      : 'overview';
    return { portal: 'seller', sellerSection: sec };
  }
  if (head === 'admin') {
    const sec = VALID_ADMIN.includes(sub as AdminSection) ? (sub as AdminSection) : 'users';
    return { portal: 'admin', adminSection: sec };
  }
  return { portal: 'public', publicSection: 'home' };
}

function buildHashRoute(
  portal: PortalView,
  publicSection: PublicSection,
  customerSection: CustomerSection,
  sellerSection: SellerSection,
  adminSection: AdminSection
): string {
  if (portal === 'public') {
    return publicSection === 'home' ? '#/' : `#/${publicSection}`;
  }
  if (portal === 'customer') {
    return customerSection === 'stores' ? '#/marketplace' : `#/marketplace/${customerSection}`;
  }
  if (portal === 'seller') {
    return sellerSection === 'overview' ? '#/seller' : `#/seller/${sellerSection}`;
  }
  return adminSection === 'users' ? '#/admin' : `#/admin/${adminSection}`;
}

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is not yet enabled in Firebase Console -> Authentication -> Sign-in method. Enable Email/Password there, or continue immediately with Google Sign-In below.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account already exists with this email address. Please sign in instead.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email or password. Please verify your credentials or sign in with Google.';
  }
  if (code === 'auth/weak-password') {
    return 'Password should be at least 6 characters long.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in window was closed before completing authentication.';
  }
  return err instanceof Error ? err.message : 'Authentication could not be completed.';
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialRoute =
    typeof window !== 'undefined' ? parseHashRoute(window.location.hash) : { portal: 'public' as PortalView };

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pendingEmailVerification, setPendingEmailVerification] = useState(false);

  const [portal, setPortal] = useState<PortalView>(initialRoute.portal);
  const [publicSection, setPublicSection] = useState<PublicSection>(
    initialRoute.publicSection || 'home'
  );
  const [customerSection, setCustomerSection] = useState<CustomerSection>(
    initialRoute.customerSection || 'stores'
  );
  const [sellerSection, setSellerSection] = useState<SellerSection>(
    initialRoute.sellerSection || 'overview'
  );
  const [adminSection, setAdminSection] = useState<AdminSection>(
    initialRoute.adminSection || 'users'
  );
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  const navigateToPublic = useCallback((section: PublicSection = 'home') => {
    setPortal('public');
    setPublicSection(section);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const navigateToMarketplace = useCallback((section: CustomerSection = 'stores') => {
    setSelectedStoreId(null);
    setPortal('customer');
    setCustomerSection(section);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const targetHash = buildHashRoute(
      portal,
      publicSection,
      customerSection,
      sellerSection,
      adminSection
    );
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
  }, [portal, publicSection, customerSection, sellerSection, adminSection]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      const parsed = parseHashRoute(window.location.hash);
      setPortal(parsed.portal);
      if (parsed.publicSection) setPublicSection(parsed.publicSection);
      if (parsed.customerSection) setCustomerSection(parsed.customerSection);
      if (parsed.sellerSection) setSellerSection(parsed.sellerSection);
      if (parsed.adminSection) setAdminSection(parsed.adminSection);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const [liveStores, setLiveStores] = useState<Store[] | null>(null);
  const [liveProducts, setLiveProducts] = useState<Product[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);

  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    ...DEFAULT_PLATFORM_SETTINGS,
    updatedAt: new Date().toISOString(),
  });
  const [categories, setCategories] = useState<CategoryRecord[]>(
    DEFAULT_MARKETPLACE_CATEGORIES.map((c) => ({
      ...c,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))
  );
  const [integrationsStatus, setIntegrationsStatus] = useState<IntegrationsStatus>({
    geminiConfigured: false,
    razorpayConfigured: false,
    razorpayKeyId: null,
    razorpayWebhookConfigured: false,
    shiprocketConfigured: false,
    codAvailable: true,
    currency: 'INR',
  });

  const [currency, setCurrencyState] = useState<SupportedCurrency>(() => {
    try {
      return sanitizeCurrency(localStorage.getItem('sellerflow_currency'));
    } catch {
      return 'INR';
    }
  });
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      return sanitizeLanguage(localStorage.getItem('sellerflow_language'));
    } catch {
      return 'en';
    }
  });
  const [fxFeed, setFxFeed] = useState<FxFeedMeta>({
    base: 'INR',
    rates: DEFAULT_FX_RATES,
    source: 'initializing',
    fetchedAt: new Date().toISOString(),
    isLive: false,
  });

  const refreshIntegrationsStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/status');
      if (res.ok) {
        const data = (await res.json()) as IntegrationsStatus;
        setIntegrationsStatus(data);
      }
    } catch {
      // Non-fatal during server startup
    }
  }, []);

  const refreshFxRates = useCallback(async (force = false) => {
    try {
      const res = await fetch(force ? '/api/currency/rates?refresh=1' : '/api/currency/rates');
      if (res.ok) {
        const data = (await res.json()) as FxFeedMeta;
        if (data?.rates?.INR && data?.rates?.USD && data?.rates?.EUR) {
          setFxFeed(data);
        }
      }
    } catch {
      // Retain default/last known rates
    }
  }, []);

  useEffect(() => {
    void refreshIntegrationsStatus();
    void refreshFxRates();
  }, [refreshIntegrationsStatus, refreshFxRates]);

  // Show live Firestore stores/products when available; otherwise show clearly-flagged Sample Catalog fallback
  const usingSampleFallback =
    (liveStores !== null && liveStores.length === 0) || liveStores === null;
  const stores: Store[] =
    liveStores && liveStores.length > 0
      ? liveStores
      : SEED_STORES.map((s) => ({
          ...s,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
  const products: Product[] =
    liveProducts && liveProducts.length > 0
      ? liveProducts
      : SEED_PRODUCTS.map((p) => ({
          ...p,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('sellerflow_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sellerflow_cart', JSON.stringify(cart));
    } catch {
      // Ignore storage quota errors
    }
  }, [cart]);

  // Subscribe to public settings, categories, stores & published products
  useEffect(() => {
    const unsubSettings = subscribePlatformSettings(setPlatformSettings);
    const unsubCats = subscribeCategories(setCategories);
    const unsubStores = subscribeActiveStores(
      (rows) => {
        setLiveStores(rows);
        setCatalogLoading(false);
      },
      () => setCatalogLoading(false)
    );
    const unsubProducts = subscribePublishedProducts(
      (rows) => {
        setLiveProducts(rows);
        setCatalogLoading(false);
      },
      () => setCatalogLoading(false)
    );
    return () => {
      unsubSettings();
      unsubCats();
      unsubStores();
      unsubProducts();
    };
  }, []);

  const hydrateAuthenticatedProfile = useCallback(async (user: User) => {
    if (!user.email) return null;
    if (!user.emailVerified) {
      await user.reload();
    }
    if (!user.emailVerified) {
      setPendingEmailVerification(true);
      setUserProfile(null);
      return null;
    }
    setPendingEmailVerification(false);
    await user.getIdToken(true);

    const pendingRole = sessionStorage.getItem('sellerflow_pending_role') as
      | 'customer'
      | 'seller'
      | null;
    const pendingBiz = sessionStorage.getItem('sellerflow_pending_biz') || undefined;
    const pendingOnboardingRaw = sessionStorage.getItem('sellerflow_pending_onboarding');
    let pendingOnboarding: SellerOnboardingInput | undefined;
    if (pendingOnboardingRaw) {
      try {
        pendingOnboarding = JSON.parse(pendingOnboardingRaw) as SellerOnboardingInput;
      } catch {
        pendingOnboarding = undefined;
      }
    }
    sessionStorage.removeItem('sellerflow_pending_role');
    sessionStorage.removeItem('sellerflow_pending_biz');
    sessionStorage.removeItem('sellerflow_pending_onboarding');

    const profile = await syncUserProfile({
      uid: user.uid,
      email: user.email,
      displayName: pendingOnboarding?.fullName || user.displayName || user.email.split('@')[0],
      avatarUrl: user.photoURL || undefined,
      phone: pendingOnboarding?.mobile,
      intendedRole: pendingRole || undefined,
      businessName: pendingBiz,
      sellerOnboarding: pendingOnboarding,
    });
    setUserProfile(profile);
    if (profile.preferredCurrency) {
      setCurrencyState(profile.preferredCurrency);
      try {
        localStorage.setItem('sellerflow_currency', profile.preferredCurrency);
      } catch {
        // ignore
      }
    }
    if (profile.preferredLanguage) {
      setLanguageState(profile.preferredLanguage);
      try {
        localStorage.setItem('sellerflow_language', profile.preferredLanguage);
      } catch {
        // ignore
      }
    }
    setAuthError(null);
    return profile;
  }, []);

  // Auth listener
  useEffect(() => {
    let unsubNotif: (() => void) | null = null;
    let unsubWish: (() => void) | null = null;

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (unsubNotif) {
        unsubNotif();
        unsubNotif = null;
      }
      if (unsubWish) {
        unsubWish();
        unsubWish = null;
      }

      if (user && user.email) {
        try {
          const profile = await hydrateAuthenticatedProfile(user);
          if (profile) {
            unsubNotif = subscribeNotifications(user.uid, setNotifications);
            unsubWish = subscribeCustomerWishlist(user.uid, setWishlist);
          }
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'Failed to synchronize account profile.');
        }
      } else {
        setPendingEmailVerification(false);
        setUserProfile(null);
        setNotifications([]);
        setWishlist([]);
      }
      setAuthReady(true);
    });

    return () => {
      unsub();
      if (unsubNotif) unsubNotif();
      if (unsubWish) unsubWish();
    };
  }, [hydrateAuthenticatedProfile]);

  const isAdmin = Boolean(
    userProfile?.role === 'admin' ||
      (firebaseUser?.emailVerified &&
        firebaseUser?.email?.toLowerCase() === 'rahmananowar67@gmail.com')
  );
  const isSeller = Boolean(userProfile?.role === 'seller' || isAdmin);

  const routeAfterSignIn = useCallback(
    (profile: UserProfile, intendedRole?: 'customer' | 'seller') => {
      if (profile.role === 'admin' && intendedRole !== 'seller') {
        setPortal('admin');
      } else if (profile.role === 'seller' || intendedRole === 'seller') {
        setPortal('seller');
        setSellerSection('overview');
      } else {
        setPortal('customer');
      }
    },
    []
  );

  const signInWithGoogle = useCallback(
    async (
      intendedRole?: 'customer' | 'seller',
      businessName?: string,
      sellerOnboarding?: SellerOnboardingInput
    ) => {
      setAuthError(null);
      if (intendedRole) {
        sessionStorage.setItem('sellerflow_pending_role', intendedRole);
      } else {
        sessionStorage.removeItem('sellerflow_pending_role');
      }
      if (businessName) {
        sessionStorage.setItem('sellerflow_pending_biz', businessName);
      } else {
        sessionStorage.removeItem('sellerflow_pending_biz');
      }
      if (sellerOnboarding) {
        sessionStorage.setItem('sellerflow_pending_onboarding', JSON.stringify(sellerOnboarding));
      } else {
        sessionStorage.removeItem('sellerflow_pending_onboarding');
      }

      try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        if (user && user.email) {
          if (!user.emailVerified) {
            await user.reload();
          }
          await user.getIdToken(true);
          sessionStorage.removeItem('sellerflow_pending_role');
          sessionStorage.removeItem('sellerflow_pending_biz');
          sessionStorage.removeItem('sellerflow_pending_onboarding');

          const profile = await syncUserProfile({
            uid: user.uid,
            email: user.email,
            displayName: sellerOnboarding?.fullName || user.displayName || user.email.split('@')[0],
            avatarUrl: user.photoURL || undefined,
            phone: sellerOnboarding?.mobile,
            intendedRole,
            businessName: sellerOnboarding?.businessName || businessName,
            sellerOnboarding,
          });
          setUserProfile(profile);
          setPendingEmailVerification(false);
          routeAfterSignIn(profile, intendedRole);
        }
      } catch (err) {
        const message = mapFirebaseAuthError(err);
        setAuthError(message);
        throw new Error(message);
      }
    },
    [routeAfterSignIn]
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        const profile = await hydrateAuthenticatedProfile(cred.user);
        if (profile) {
          routeAfterSignIn(profile);
        }
      } catch (err) {
        const message = mapFirebaseAuthError(err);
        setAuthError(message);
        throw new Error(message);
      }
    },
    [hydrateAuthenticatedProfile, routeAfterSignIn]
  );

  const registerWithEmail = useCallback(
    async (params: {
      email: string;
      password: string;
      displayName: string;
      intendedRole: 'customer' | 'seller';
      sellerOnboarding?: SellerOnboardingInput;
    }) => {
      setAuthError(null);
      sessionStorage.setItem('sellerflow_pending_role', params.intendedRole);
      if (params.sellerOnboarding?.businessName) {
        sessionStorage.setItem('sellerflow_pending_biz', params.sellerOnboarding.businessName);
      }
      if (params.sellerOnboarding) {
        sessionStorage.setItem(
          'sellerflow_pending_onboarding',
          JSON.stringify(params.sellerOnboarding)
        );
      }

      try {
        const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
        await updateProfile(cred.user, {
          displayName: params.sellerOnboarding?.fullName || params.displayName,
        });
        await sendEmailVerification(cred.user);
        if (cred.user.emailVerified) {
          const profile = await hydrateAuthenticatedProfile(cred.user);
          if (profile) routeAfterSignIn(profile, params.intendedRole);
        } else {
          setPendingEmailVerification(true);
        }
      } catch (err) {
        sessionStorage.removeItem('sellerflow_pending_role');
        sessionStorage.removeItem('sellerflow_pending_biz');
        sessionStorage.removeItem('sellerflow_pending_onboarding');
        const message = mapFirebaseAuthError(err);
        setAuthError(message);
        throw new Error(message);
      }
    },
    [hydrateAuthenticatedProfile, routeAfterSignIn]
  );

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshEmailVerification = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      const profile = await hydrateAuthenticatedProfile(auth.currentUser);
      if (profile) {
        routeAfterSignIn(profile);
      }
      return true;
    }
    return false;
  }, [hydrateAuthenticatedProfile, routeAfterSignIn]);

  const resetPassword = useCallback(async (email: string) => {
    const clean = email.trim();
    if (!clean || !clean.includes('@')) {
      throw new Error('Enter a valid email address to receive a password reset link.');
    }
    try {
      await sendPasswordResetEmail(auth, clean);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  }, []);

  const updateLocalUserProfile = useCallback((patch: Partial<UserProfile>) => {
    setUserProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setPendingEmailVerification(false);
    setUserProfile(null);
    setPortal('public');
    setPublicSection('home');
  }, []);

  const becomeSeller = useCallback(
    async (businessName: string, onboarding?: SellerOnboardingInput) => {
      if (!firebaseUser || !firebaseUser.email) {
        throw new Error('Please sign in first.');
      }
      await upgradeCustomerToSeller(firebaseUser.uid, firebaseUser.email, businessName, onboarding);
      setUserProfile((prev) => (prev ? { ...prev, role: 'seller' } : prev));
      setPortal('seller');
      setSellerSection('overview');
    },
    [firebaseUser]
  );

  const triggerMarketplaceSeed = useCallback(async () => {
    return await seedMarketplaceIfEmpty();
  }, []);

  const syncSampleMedia = useCallback(async () => {
    return await syncSampleCatalogMedia();
  }, []);

  const clearSampleData = useCallback(async () => {
    return await clearSampleMarketplaceData();
  }, []);

  const availableCurrencies: SupportedCurrency[] =
    platformSettings.enabledCurrencies && platformSettings.enabledCurrencies.length > 0
      ? platformSettings.enabledCurrencies.filter((c): c is SupportedCurrency =>
          ALL_CURRENCIES.includes(c as SupportedCurrency)
        )
      : ALL_CURRENCIES;

  const availableLanguages: SupportedLanguage[] =
    platformSettings.enabledLanguages && platformSettings.enabledLanguages.length > 0
      ? platformSettings.enabledLanguages.filter((l): l is SupportedLanguage =>
          ALL_LANGUAGES.includes(l as SupportedLanguage)
        )
      : ALL_LANGUAGES;

  useEffect(() => {
    if (availableCurrencies.length > 0 && !availableCurrencies.includes(currency)) {
      const fallback =
        platformSettings.defaultCurrency && availableCurrencies.includes(platformSettings.defaultCurrency)
          ? platformSettings.defaultCurrency
          : availableCurrencies[0];
      setCurrencyState(fallback);
    }
  }, [availableCurrencies, currency, platformSettings.defaultCurrency]);

  useEffect(() => {
    if (availableLanguages.length > 0 && !availableLanguages.includes(language)) {
      const fallback =
        platformSettings.defaultLanguage && availableLanguages.includes(platformSettings.defaultLanguage)
          ? platformSettings.defaultLanguage
          : availableLanguages[0];
      setLanguageState(fallback);
    }
  }, [availableLanguages, language, platformSettings.defaultLanguage]);

  const setCurrency = useCallback(
    (next: SupportedCurrency) => {
      const clean = sanitizeCurrency(next);
      setCurrencyState(clean);
      try {
        localStorage.setItem('sellerflow_currency', clean);
      } catch {
        // ignore
      }
      if (firebaseUser?.uid && userProfile) {
        void updateUserPreferences(firebaseUser.uid, { preferredCurrency: clean });
      }
    },
    [firebaseUser?.uid, userProfile]
  );

  const setLanguage = useCallback(
    (next: SupportedLanguage) => {
      const clean = sanitizeLanguage(next);
      setLanguageState(clean);
      try {
        localStorage.setItem('sellerflow_language', clean);
      } catch {
        // ignore
      }
      if (firebaseUser?.uid && userProfile) {
        void updateUserPreferences(firebaseUser.uid, { preferredLanguage: clean });
      }
    },
    [firebaseUser?.uid, userProfile]
  );

  const formatPrice = useCallback(
    (amountMinor: number, fromCurrency: SupportedCurrency = 'INR') =>
      formatCurrency(amountMinor, fromCurrency, currency, fxFeed.rates),
    [currency, fxFeed.rates]
  );

  const convertPrice = useCallback(
    (
      amountMinor: number,
      fromCurrency: SupportedCurrency = 'INR',
      toCurrency: SupportedCurrency = currency
    ) => convertCurrencyMinorUnits(amountMinor, fromCurrency, toCurrency, fxFeed.rates),
    [currency, fxFeed.rates]
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translateKey(language, key, vars),
    [language]
  );

  const addToCart = useCallback(
    (product: Product, qty = 1, selectedSize?: string, selectedColor?: string) => {
      const size = selectedSize || product.sizes?.[0];
      const color = selectedColor || product.colors?.[0];
      const targetKey = `${product.id}__${size || ''}__${color || ''}`;
      setCart((prev) => {
        const existing = prev.find((i) => getCartItemKey(i) === targetKey);
        if (existing) {
          return prev.map((i) =>
            getCartItemKey(i) === targetKey
              ? { ...i, quantity: Math.min(product.stock || 99, i.quantity + qty) }
              : i
          );
        }
        return [
          ...prev,
          { product, quantity: Math.max(1, qty), selectedSize: size, selectedColor: color },
        ];
      });
    },
    []
  );

  const updateCartQty = useCallback((cartKey: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => getCartItemKey(i) !== cartKey && i.product.id !== cartKey));
      return;
    }
    setCart((prev) =>
      prev.map((i) => {
        if (getCartItemKey(i) !== cartKey && i.product.id !== cartKey) return i;
        const maxStock = i.product.stock > 0 ? i.product.stock : 1;
        return { ...i, quantity: Math.min(maxStock, qty) };
      })
    );
  }, []);

  const removeFromCart = useCallback((cartKey: string) => {
    setCart((prev) => prev.filter((i) => getCartItemKey(i) !== cartKey && i.product.id !== cartKey));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const isWishlisted = useCallback(
    (productId: string) => wishlist.some((w) => w.productId === productId),
    [wishlist]
  );

  const toggleWishlist = useCallback(
    async (product: Product) => {
      if (!userProfile) {
        throw new Error('Please sign in to save items to your wishlist.');
      }
      const saved = wishlist.some((w) => w.productId === product.id);
      await toggleWishlistItem(userProfile.uid, product, saved);
    },
    [userProfile, wishlist]
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        authReady,
        authError,
        pendingEmailVerification,
        isAdmin,
        isSeller,
        portal,
        setPortal,
        publicSection,
        setPublicSection,
        customerSection,
        setCustomerSection,
        sellerSection,
        setSellerSection,
        adminSection,
        setAdminSection,
        navigateToPublic,
        navigateToMarketplace,
        selectedStoreId,
        setSelectedStoreId,
        stores,
        products,
        categories,
        platformSettings,
        integrationsStatus,
        catalogLoading,
        usingSampleFallback,
        cart,
        addToCart,
        updateCartQty,
        removeFromCart,
        clearCart,
        wishlist,
        isWishlisted,
        toggleWishlist,
        notifications,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        resendVerificationEmail,
        refreshEmailVerification,
        resetPassword,
        updateLocalUserProfile,
        signOutUser,
        becomeSeller,
        triggerMarketplaceSeed,
        syncSampleMedia,
        clearSampleData,
        refreshIntegrationsStatus,
        currency,
        setCurrency,
        language,
        setLanguage,
        availableCurrencies,
        availableLanguages,
        fxFeed,
        fxRates: fxFeed.rates,
        refreshFxRates,
        formatPrice,
        convertPrice,
        t,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

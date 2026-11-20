import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  Building2,
  CheckCircle2,
  Coins,
  CreditCard,
  Download,
  ExternalLink,
  FolderTree,
  Globe,
  Home,
  KeyRound,
  LogOut,
  Menu,
  PackageCheck,
  Percent,
  RefreshCw,
  Repeat,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store as StoreIcon,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  adminBroadcastNotification,
  adminModerateProduct,
  adminUpdateCommissionStatus,
  adminUpdateDisputeStatus,
  adminUpdateOrderStatus,
  adminUpdatePaymentStatus,
  adminUpdatePayoutStatus,
  adminUpdateRefundStatus,
  adminUpdateSellerStatus,
  adminUpdateStoreStatus,
  adminUpdateSubscriptionStatus,
  adminUpdateUserStatus,
  deleteCategoryById,
  deleteCouponById,
  deleteProductById,
  logAuditEvent,
  saveCategory,
  saveCoupon,
  savePlatformSettings,
  seedDefaultCategoriesIfEmpty,
  subscribeAllAdminData,
  subscribeAllCoupons,
  subscribeAuditLogs,
} from '../lib/firestoreService';
import {
  ALL_CURRENCIES,
  CURRENCY_META,
  sanitizeCurrency,
  type SupportedCurrency,
} from '../lib/currency';
import {
  ALL_LANGUAGES,
  LANGUAGE_META,
  sanitizeLanguage,
  type SupportedLanguage,
} from '../lib/i18n';
import { computeGstBreakup, ORDER_LIFECYCLE_STEPS } from '../lib/indiaData';
import {
  makeSlug,
  sanitizeId,
  type AdminSection,
  type AuditLogRecord,
  type CategoryRecord,
  type CommissionRecord,
  type CouponRecord,
  type DisputeRecord,
  type Order,
  type OrderStatus,
  type PaymentRecord,
  type PayoutRecord,
  type Product,
  type ProductModerationStatus,
  type RefundRecord,
  type SellerAccount,
  type Store,
  type SubscriptionRecord,
  type UserProfile,
} from '../types/commerce';
import { LocaleControls } from './LocaleControls';
import { ProductVisual } from './ProductVisual';

export const AdminPortal: React.FC = () => {
  const {
    userProfile,
    isAdmin,
    adminSection,
    setAdminSection,
    setPortal,
    navigateToPublic,
    navigateToMarketplace,
    signOutUser,
    categories,
    platformSettings,
    integrationsStatus,
    fxFeed,
    refreshFxRates,
    formatPrice,
    t,
    syncSampleMedia,
    clearSampleData,
    triggerMarketplaceSeed,
    refreshIntegrationsStatus,
  } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [sellers, setSellers] = useState<SellerAccount[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Moderation & inline edit states
  const [productFilter, setProductFilter] = useState<'all' | ProductModerationStatus>('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [commissionRateDrafts, setCommissionRateDrafts] = useState<Record<string, string>>({});
  const [utrDrafts, setUtrDrafts] = useState<Record<string, string>>({});
  const [refundNoteDrafts, setRefundNoteDrafts] = useState<Record<string, string>>({});
  const [disputeNoteDrafts, setDisputeNoteDrafts] = useState<Record<string, string>>({});
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Coupon & Broadcast management state
  const [couponCode, setCouponCode] = useState('');
  const [couponDesc, setCouponDesc] = useState('');
  const [couponType, setCouponType] = useState<'percent' | 'fixed'>('percent');
  const [couponValue, setCouponValue] = useState('10');
  const [couponMinInr, setCouponMinInr] = useState('499');
  const [couponMaxInr, setCouponMaxInr] = useState('500');
  const [couponBusy, setCouponBusy] = useState(false);

  const [broadcastTarget, setBroadcastTarget] = useState<'all_users' | 'approved_sellers'>('all_users');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastBusy, setBroadcastBusy] = useState(false);

  // Category editor state
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catSubsText, setCatSubsText] = useState('');
  const [catGstPct, setCatGstPct] = useState('18');
  const [catActive, setCatActive] = useState(true);
  const [savingCat, setSavingCat] = useState(false);

  // Platform settings editor state
  const [reqProductApproval, setReqProductApproval] = useState(platformSettings.requireProductApproval);
  const [reqSellerApproval, setReqSellerApproval] = useState(platformSettings.requireSellerApproval);
  const [defaultGstPct, setDefaultGstPct] = useState(String(platformSettings.defaultGstPct));
  const [freeShipInr, setFreeShipInr] = useState(
    String(Math.round(platformSettings.freeShippingThresholdCents / 100))
  );
  const [defaultShipInr, setDefaultShipInr] = useState(
    String(Math.round(platformSettings.defaultShippingCents / 100))
  );
  const [starterPriceInr, setStarterPriceInr] = useState(
    String(Math.round(platformSettings.starterPriceCents / 100))
  );
  const [starterCommPct, setStarterCommPct] = useState(
    String((platformSettings.starterCommissionRate * 100).toFixed(1))
  );
  const [starterSkuLimit, setStarterSkuLimit] = useState(String(platformSettings.starterSkuLimit));
  const [growthPriceInr, setGrowthPriceInr] = useState(
    String(Math.round(platformSettings.growthPriceCents / 100))
  );
  const [growthCommPct, setGrowthCommPct] = useState(
    String((platformSettings.growthCommissionRate * 100).toFixed(1))
  );
  const [growthSkuLimit, setGrowthSkuLimit] = useState(String(platformSettings.growthSkuLimit));
  const [proPriceInr, setProPriceInr] = useState(
    String(Math.round(platformSettings.proPriceCents / 100))
  );
  const [proCommPct, setProCommPct] = useState(
    String((platformSettings.proCommissionRate * 100).toFixed(1))
  );
  const [proSkuLimit, setProSkuLimit] = useState(String(platformSettings.proSkuLimit));
  const [enabledCurrencies, setEnabledCurrencies] = useState<SupportedCurrency[]>(
    platformSettings.enabledCurrencies ?? ALL_CURRENCIES
  );
  const [enabledLanguages, setEnabledLanguages] = useState<SupportedLanguage[]>(
    platformSettings.enabledLanguages ?? ALL_LANGUAGES
  );
  const [defaultCurrency, setDefaultCurrency] = useState<SupportedCurrency>(
    sanitizeCurrency(platformSettings.defaultCurrency)
  );
  const [defaultLanguage, setDefaultLanguage] = useState<SupportedLanguage>(
    sanitizeLanguage(platformSettings.defaultLanguage)
  );
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setReqProductApproval(platformSettings.requireProductApproval);
    setReqSellerApproval(platformSettings.requireSellerApproval);
    setDefaultGstPct(String(platformSettings.defaultGstPct));
    setFreeShipInr(String(Math.round(platformSettings.freeShippingThresholdCents / 100)));
    setDefaultShipInr(String(Math.round(platformSettings.defaultShippingCents / 100)));
    setStarterPriceInr(String(Math.round(platformSettings.starterPriceCents / 100)));
    setStarterCommPct(String((platformSettings.starterCommissionRate * 100).toFixed(1)));
    setStarterSkuLimit(String(platformSettings.starterSkuLimit));
    setGrowthPriceInr(String(Math.round(platformSettings.growthPriceCents / 100)));
    setGrowthCommPct(String((platformSettings.growthCommissionRate * 100).toFixed(1)));
    setGrowthSkuLimit(String(platformSettings.growthSkuLimit));
    setProPriceInr(String(Math.round(platformSettings.proPriceCents / 100)));
    setProCommPct(String((platformSettings.proCommissionRate * 100).toFixed(1)));
    setProSkuLimit(String(platformSettings.proSkuLimit));
    setEnabledCurrencies(
      platformSettings.enabledCurrencies?.length
        ? platformSettings.enabledCurrencies
        : ALL_CURRENCIES
    );
    setEnabledLanguages(
      platformSettings.enabledLanguages?.length
        ? platformSettings.enabledLanguages
        : ALL_LANGUAGES
    );
    setDefaultCurrency(sanitizeCurrency(platformSettings.defaultCurrency));
    setDefaultLanguage(sanitizeLanguage(platformSettings.defaultLanguage));
  }, [platformSettings]);

  const showToast = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const recordAdminAudit = async (
    action: string,
    targetType: string,
    targetId: string,
    summary: string,
    severity: AuditLogRecord['severity'] = 'info'
  ) => {
    if (!userProfile) return;
    await logAuditEvent({
      actorUid: userProfile.uid,
      actorEmail: userProfile.email,
      actorRole: userProfile.role,
      action,
      targetType,
      targetId,
      summary,
      severity,
    });
  };

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeAllAdminData({
      onUsers: setUsers,
      onSellers: setSellers,
      onStores: setStores,
      onProducts: setProducts,
      onPayments: setPayments,
      onSubscriptions: setSubscriptions,
      onOrders: setOrders,
      onCommissions: setCommissions,
      onPayouts: setPayouts,
      onRefunds: setRefunds,
      onDisputes: setDisputes,
    });
    const unsubCoupons = subscribeAllCoupons(setCoupons);
    const unsubAudit = subscribeAuditLogs(setAuditLogs);
    return () => {
      unsub();
      unsubCoupons();
      unsubAudit();
    };
  }, [isAdmin]);

  // Separate Live Marketplace metrics from Sample Catalog counts
  const liveStores = useMemo(() => stores.filter((s) => !s.isSample), [stores]);
  const sampleStoresCount = useMemo(() => stores.filter((s) => s.isSample).length, [stores]);
  const liveProducts = useMemo(() => products.filter((p) => !p.isSample), [products]);
  const sampleProductsCount = useMemo(() => products.filter((p) => p.isSample).length, [products]);

  const liveGmvCents = useMemo(
    () => orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.totalCents, 0),
    [orders]
  );

  const liveCommissionCents = useMemo(
    () =>
      commissions
        .filter((c) => c.status !== 'reversed')
        .reduce((s, c) => s + c.commissionCents, 0),
    [commissions]
  );

  const fallbackPlatformFeesCents = useMemo(
    () => payments.filter((p) => p.status !== 'refunded').reduce((s, p) => s + p.platformFeeCents, 0),
    [payments]
  );

  const effectiveCommissionTotalCents =
    commissions.length > 0 ? liveCommissionCents : fallbackPlatformFeesCents;

  const mrrCents = useMemo(
    () =>
      subscriptions
        .filter((s) => s.status === 'active')
        .reduce((sum, s) => sum + s.monthlyPriceCents, 0),
    [subscriptions]
  );

  const pendingPayoutsCents = useMemo(
    () =>
      payouts
        .filter((p) => p.status === 'requested' || p.status === 'processing')
        .reduce((s, p) => s + p.amountCents, 0),
    [payouts]
  );

  const handleExportReportCsv = () => {
    const header = [
      'OrderId',
      'InvoiceNumber',
      'Store',
      'Customer',
      'Mobile',
      'State',
      'PIN',
      'Status',
      'PaymentMethod',
      'PaymentStatus',
      'TotalINR',
      'CreatedAt',
    ];
    const rows = orders.map((o) => [
      o.id,
      o.invoiceNumber || '',
      `"${o.storeName.replace(/"/g, '""')}"`,
      `"${o.customerEmail}"`,
      o.customerMobile || '',
      `"${o.state || ''}"`,
      o.pinCode || '',
      o.status,
      `"${o.paymentMethod}"`,
      o.paymentStatus,
      (o.totalCents / 100).toFixed(2),
      o.createdAt,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sellerflow-india-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetCategoryForm = () => {
    setEditingCatId(null);
    setCatName('');
    setCatSlug('');
    setCatSubsText('');
    setCatGstPct('18');
    setCatActive(true);
  };

  const startEditCategory = (cat: CategoryRecord) => {
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatSlug(cat.slug);
    setCatSubsText(cat.subcategories.join(', '));
    setCatGstPct(String(cat.gstRatePct));
    setCatActive(cat.active);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      showToast('err', 'Category name is required.');
      return;
    }
    setSavingCat(true);
    try {
      const isNew = !editingCatId;
      const id = editingCatId || sanitizeId(`cat-${makeSlug(catName)}`);
      const subcategories = catSubsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await saveCategory(
        {
          id,
          name: catName.trim(),
          slug: makeSlug(catSlug || catName),
          subcategories,
          gstRatePct: Number(catGstPct) || 18,
          active: catActive,
        },
        isNew
      );
      resetCategoryForm();
      showToast('ok', isNew ? 'Category created.' : 'Category updated.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Failed to save category.');
    } finally {
      setSavingCat(false);
    }
  };

  const handleSavePlatformSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const safeCurrencies: SupportedCurrency[] =
        enabledCurrencies.length > 0 ? enabledCurrencies : ['INR'];
      const safeLanguages: SupportedLanguage[] =
        enabledLanguages.length > 0 ? enabledLanguages : ['en'];
      const safeDefaultCurrency = safeCurrencies.includes(defaultCurrency)
        ? defaultCurrency
        : safeCurrencies[0];
      const safeDefaultLanguage = safeLanguages.includes(defaultLanguage)
        ? defaultLanguage
        : safeLanguages[0];

      await savePlatformSettings({
        requireProductApproval: reqProductApproval,
        requireSellerApproval: reqSellerApproval,
        defaultGstPct: Math.max(0, Math.min(28, Number(defaultGstPct) || 18)),
        freeShippingThresholdCents: Math.max(0, Math.round((Number(freeShipInr) || 0) * 100)),
        defaultShippingCents: Math.max(0, Math.round((Number(defaultShipInr) || 0) * 100)),
        starterPriceCents: Math.max(0, Math.round((Number(starterPriceInr) || 0) * 100)),
        starterCommissionRate: Math.max(0, Math.min(0.5, (Number(starterCommPct) || 5) / 100)),
        starterSkuLimit: Math.max(1, Math.round(Number(starterSkuLimit) || 25)),
        growthPriceCents: Math.max(0, Math.round((Number(growthPriceInr) || 0) * 100)),
        growthCommissionRate: Math.max(0, Math.min(0.5, (Number(growthCommPct) || 3) / 100)),
        growthSkuLimit: Math.max(1, Math.round(Number(growthSkuLimit) || 500)),
        proPriceCents: Math.max(0, Math.round((Number(proPriceInr) || 0) * 100)),
        proCommissionRate: Math.max(0, Math.min(0.5, (Number(proCommPct) || 1.8) / 100)),
        proSkuLimit: Math.max(1, Math.round(Number(proSkuLimit) || 10000)),
        enabledCurrencies: safeCurrencies,
        enabledLanguages: safeLanguages,
        defaultCurrency: safeDefaultCurrency,
        defaultLanguage: safeDefaultLanguage,
        updatedBy: userProfile?.uid || 'admin',
      });
      void recordAdminAudit(
        'SETTINGS_UPDATED',
        'settings',
        'platform',
        `Updated marketplace settings (currencies: ${safeCurrencies.join(',')}, languages: ${safeLanguages.join(',')})`
      );
      showToast('ok', 'Marketplace settings saved to Firestore.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = couponCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (cleanCode.length < 3) {
      showToast('err', 'Coupon code must be at least 3 alphanumeric characters.');
      return;
    }
    setCouponBusy(true);
    try {
      const couponId = sanitizeId(`cpn-${cleanCode.toLowerCase()}`);
      const existing = coupons.find((c) => c.id === couponId);
      await saveCoupon(
        {
          id: couponId,
          code: cleanCode,
          description: couponDesc.trim() || `${cleanCode} marketplace offer`,
          discountType: couponType,
          discountValue: Math.max(1, Number(couponValue) || 10),
          minOrderCents: Math.max(0, Math.round((Number(couponMinInr) || 0) * 100)),
          maxDiscountCents: Math.max(0, Math.round((Number(couponMaxInr) || 0) * 100)),
          active: true,
          usageCount: existing?.usageCount ?? 0,
        },
        !existing
      );
      void recordAdminAudit(
        'COUPON_SAVED',
        'coupons',
        couponId,
        `${existing ? 'Updated' : 'Created'} coupon ${cleanCode}`
      );
      setCouponCode('');
      setCouponDesc('');
      showToast('ok', `Coupon ${cleanCode} saved.`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Failed to save coupon.');
    } finally {
      setCouponBusy(false);
    }
  };

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      showToast('err', 'Enter both broadcast title and message.');
      return;
    }
    setBroadcastBusy(true);
    try {
      const recipientUids =
        broadcastTarget === 'approved_sellers'
          ? sellers.filter((s) => s.status === 'approved').map((s) => s.uid)
          : users.map((u) => u.uid);
      if (recipientUids.length === 0) {
        showToast('err', 'No matching recipients found.');
        return;
      }
      const sentCount = await adminBroadcastNotification({
        recipientUids,
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        category: 'system',
      });
      void recordAdminAudit(
        'BROADCAST_SENT',
        'notifications',
        broadcastTarget,
        `Broadcast "${broadcastTitle.trim()}" sent to ${sentCount} recipients`
      );
      setBroadcastTitle('');
      setBroadcastMessage('');
      showToast('ok', `Broadcast delivered to ${sentCount} account(s).`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Broadcast failed.');
    } finally {
      setBroadcastBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md text-center">
          <ShieldCheck className="w-8 h-8 text-red-700 mx-auto mb-3" />
          <h1 className="font-display text-lg font-bold text-slate-900 mb-2">
            Administrator Access Required
          </h1>
          <p className="text-xs text-slate-600 mb-5">
            This portal is restricted to verified platform administrators.
          </p>
          <button
            type="button"
            onClick={() => navigateToPublic('home')}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg cursor-pointer"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  const pendingProductsCount = products.filter(
    (p) => (p.moderationStatus || (p.published ? 'published' : 'draft')) === 'pending'
  ).length;
  const pendingSellersCount = sellers.filter((s) => s.status === 'pending').length;
  const openDisputesCount = disputes.filter(
    (d) => d.status === 'open' || d.status === 'under_review'
  ).length;
  const pendingRefundsCount = refunds.filter((r) => r.status === 'requested').length;

  const navItems: {
    key: AdminSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { key: 'users', label: 'User Management', icon: Users },
    { key: 'sellers', label: 'Seller Management', icon: Building2, badge: pendingSellersCount },
    { key: 'stores', label: 'Store Management', icon: StoreIcon },
    { key: 'products', label: 'Product Moderation', icon: PackageCheck, badge: pendingProductsCount },
    { key: 'categories', label: 'Category Management', icon: FolderTree },
    { key: 'orders', label: 'Order Management', icon: ShoppingBag },
    { key: 'payments', label: 'Payment Management', icon: CreditCard },
    { key: 'commissions', label: 'Commission Ledger', icon: Percent },
    { key: 'subscriptions', label: 'Subscriptions', icon: Repeat },
    { key: 'refunds', label: 'Refund Requests', icon: RotateCcw, badge: pendingRefundsCount },
    { key: 'disputes', label: 'Dispute Resolution', icon: AlertTriangle, badge: openDisputesCount },
    { key: 'reports', label: 'Reports & Payouts', icon: BarChart3 },
    { key: 'settings', label: 'System Settings', icon: Settings },
  ];

  const q = searchTerm.trim().toLowerCase();

  const filteredProducts = products
    .filter((p) => {
      const modStatus: ProductModerationStatus =
        p.moderationStatus || (p.published ? 'published' : 'draft');
      if (productFilter !== 'all' && modStatus !== productFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.storeName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const am = a.moderationStatus === 'pending' ? 0 : 1;
      const bm = b.moderationStatus === 'pending' ? 0 : 1;
      if (am !== bm) return am - bm;
      return b.createdAt.localeCompare(a.createdAt);
    });

  return (
    <div className="min-h-screen flex bg-[#F8F9FA] text-slate-900">
      <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between">
        <div>
          <div className="h-16 px-6 flex items-center border-b border-slate-200">
            <button
              type="button"
              onClick={() => navigateToPublic('home')}
              className="inline-flex items-center gap-2.5 font-display text-base font-bold tracking-tight text-slate-900 hover:text-blue-700 transition-colors whitespace-nowrap cursor-pointer"
              aria-label="SellerFlow AI Home"
            >
              <span className="w-7 h-7 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </span>
              <span>SellerFlow AI</span>
            </button>
          </div>

          <div className="p-4">
            <p className="px-3 text-xs font-medium text-slate-400 mb-2">Admin Governance</p>
            <nav className="space-y-1">
              {navItems.map(({ key, label, icon: Icon, badge }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAdminSection(key)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    adminSection === key
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap truncate">{label}</span>
                  </span>
                  {badge !== undefined && badge > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-mono text-[10px] font-semibold">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            <div className="mt-6 pt-5 border-t border-slate-100 space-y-1">
              <p className="px-3 text-xs font-medium text-slate-400 mb-2">Public Website</p>
              <button
                type="button"
                onClick={() => navigateToPublic('home')}
                className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
              >
                <Home className="w-3.5 h-3.5 shrink-0" />
                <span>Home</span>
              </button>
              <button
                type="button"
                onClick={() => navigateToPublic('features')}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Features
              </button>
              <button
                type="button"
                onClick={() => navigateToPublic('pricing')}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Pricing
              </button>
              <button
                type="button"
                onClick={() => navigateToPublic('home')}
                className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span>View Public Website</span>
              </button>
            </div>

            <div className="mt-5 pt-5 border-t border-slate-100 space-y-1">
              <p className="px-3 text-xs font-medium text-slate-400 mb-2">Switch Portal</p>
              <button
                type="button"
                onClick={() => setPortal('seller')}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Seller Dashboard
              </button>
              <button
                type="button"
                onClick={() => navigateToMarketplace('stores')}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Marketplace
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">
              {userProfile?.displayName}
            </p>
            <p className="text-[11px] text-slate-500 truncate">Platform Admin</p>
          </div>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 text-sm min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer shrink-0"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => navigateToPublic('home')}
              className="lg:hidden inline-flex items-center gap-2 font-display text-sm sm:text-base font-bold tracking-tight text-slate-900 hover:text-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="SellerFlow AI Home"
            >
              <span className="w-6 h-6 rounded-md bg-blue-700 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <span>SellerFlow AI</span>
            </button>

            <div className="hidden lg:flex items-center gap-2 min-w-0">
              <span className="text-slate-400 whitespace-nowrap">Admin</span>
              <span className="text-slate-300">/</span>
              <span className="font-display font-semibold text-slate-900 truncate">
                {navItems.find((n) => n.key === adminSection)?.label}
              </span>
            </div>
          </div>

          <nav className="hidden xl:flex items-center gap-4 text-xs font-medium text-slate-600 shrink-0">
            <button
              type="button"
              onClick={() => navigateToPublic('home')}
              className="inline-flex items-center gap-1 hover:text-blue-700 whitespace-nowrap cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              Home
            </button>
            <button
              type="button"
              onClick={() => navigateToMarketplace('stores')}
              className="hover:text-blue-700 whitespace-nowrap cursor-pointer"
            >
              Marketplace
            </button>
            <button
              type="button"
              onClick={() => navigateToPublic('features')}
              className="hover:text-blue-700 whitespace-nowrap cursor-pointer"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => navigateToPublic('pricing')}
              className="hover:text-blue-700 whitespace-nowrap cursor-pointer"
            >
              Pricing
            </button>
          </nav>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="hidden md:block">
              <LocaleControls compact />
            </div>
            <button
              type="button"
              onClick={() => navigateToPublic('home')}
              className="hidden sm:inline-flex xl:hidden items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-blue-700 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              {t('nav.home')}
            </button>
            <button
              type="button"
              onClick={() => navigateToPublic('home')}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-blue-700 text-white text-[11px] sm:text-xs font-medium rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span>{t('nav.viewPublicWebsite')}</span>
            </button>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter records..."
              className="hidden sm:block px-3 py-1.5 text-xs border border-slate-300 rounded-lg w-36 md:w-44"
            />
          </div>
        </header>

        {/* Responsive Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-4 space-y-4 shadow-sm">
            <LocaleControls fullWidth />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateToPublic('home');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                {t('nav.home')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateToMarketplace('stores');
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                {t('nav.marketplace')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateToPublic('features');
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                {t('nav.features')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateToPublic('pricing');
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                {t('nav.pricing')}
              </button>
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
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter admin records..."
                className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigateToPublic('home');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {t('nav.viewPublicWebsite')}
                </button>
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs font-medium text-slate-700 rounded-lg cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {t('nav.signOut')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Section Tab Strip */}
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {navItems.map(({ key, label, badge }) => (
            <button
              key={key}
              type="button"
              onClick={() => setAdminSection(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                adminSection === key ? 'bg-blue-700 text-white' : 'text-slate-600 bg-slate-100'
              }`}
            >
              <span>{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 font-mono text-[10px]">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
          {feedback && (
            <div
              className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              <span>{feedback.text}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-current opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 1. USER MANAGEMENT */}
          {adminSection === 'users' && (
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-6">
                User Management ({users.length})
              </h1>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4">Email & Mobile</th>
                        <th className="py-3 px-4">Location</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Moderation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {users
                        .filter(
                          (u) =>
                            !q ||
                            u.displayName.toLowerCase().includes(q) ||
                            u.email.toLowerCase().includes(q) ||
                            (u.phone || '').toLowerCase().includes(q)
                        )
                        .map((u) => (
                          <tr key={u.uid}>
                            <td className="py-3 px-4 font-medium text-slate-900">
                              {u.displayName}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600">
                              <p>{u.email}</p>
                              {u.phone && <p className="font-mono text-slate-400">{u.phone}</p>}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600">
                              {[u.city, u.state].filter(Boolean).join(', ') || '—'}
                            </td>
                            <td className="py-3 px-4 text-xs uppercase font-mono text-blue-700">
                              {u.role}
                            </td>
                            <td className="py-3 px-4 text-xs font-medium">
                              <span
                                className={
                                  u.status === 'active' ? 'text-emerald-700' : 'text-red-700'
                                }
                              >
                                {u.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {u.uid !== userProfile?.uid && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminUpdateUserStatus(
                                      u.uid,
                                      u.status === 'active' ? 'suspended' : 'active'
                                    ).then(() =>
                                      showToast(
                                        'ok',
                                        `User ${u.status === 'active' ? 'suspended' : 'reactivated'}.`
                                      )
                                    )
                                  }
                                  className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                                >
                                  {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. SELLER MANAGEMENT */}
          {adminSection === 'sellers' && (
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-6">
                Seller Verification & KYC Management ({sellers.length})
              </h1>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="py-3 px-4">Business & Owner</th>
                        <th className="py-3 px-4">Contact & Location</th>
                        <th className="py-3 px-4">GSTIN / Plan</th>
                        <th className="py-3 px-4">Fee Rate (%)</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Verification Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {sellers
                        .filter(
                          (s) =>
                            !q ||
                            s.businessName.toLowerCase().includes(q) ||
                            s.email.toLowerCase().includes(q) ||
                            (s.gstin || '').toLowerCase().includes(q)
                        )
                        .map((s) => {
                          const ratePct =
                            commissionRateDrafts[s.uid] ??
                            String((s.commissionRate * 100).toFixed(1));
                          return (
                            <tr key={s.uid} className="align-top">
                              <td className="py-3 px-4">
                                <p className="font-medium text-slate-900">{s.businessName}</p>
                                <p className="text-xs text-slate-500">
                                  {s.fullName || 'Merchant Owner'}
                                </p>
                                {s.rejectionReason && (
                                  <p className="text-[11px] text-red-600 mt-1">
                                    Note: {s.rejectionReason}
                                  </p>
                                )}
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-600">
                                <p>{s.email}</p>
                                {s.mobile && <p className="font-mono">+91 {s.mobile}</p>}
                                {(s.city || s.state) && (
                                  <p className="text-slate-400">
                                    {[s.city, s.state, s.pinCode].filter(Boolean).join(', ')}
                                  </p>
                                )}
                              </td>
                              <td className="py-3 px-4 text-xs">
                                <p className="font-mono text-slate-700">
                                  {s.gstin || 'Unregistered GST'}
                                </p>
                                <p className="capitalize text-blue-700 font-medium">{s.plan}</p>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="35"
                                    value={ratePct}
                                    onChange={(e) =>
                                      setCommissionRateDrafts((prev) => ({
                                        ...prev,
                                        [s.uid]: e.target.value,
                                      }))
                                    }
                                    className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const parsed = Math.max(
                                        0,
                                        Math.min(0.35, (Number(ratePct) || 5) / 100)
                                      );
                                      void adminUpdateSellerStatus(s.uid, s.status, parsed).then(
                                        () => showToast('ok', 'Seller commission rate updated.')
                                      );
                                    }}
                                    className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded font-medium cursor-pointer"
                                  >
                                    Save
                                  </button>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-xs font-medium capitalize">
                                <span
                                  className={
                                    s.status === 'approved'
                                      ? 'text-emerald-700'
                                      : s.status === 'pending'
                                      ? 'text-amber-700'
                                      : 'text-red-700'
                                  }
                                >
                                  {s.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right space-y-2">
                                <div className="flex justify-end gap-2">
                                  {s.status !== 'approved' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void adminUpdateSellerStatus(
                                          s.uid,
                                          'approved',
                                          undefined,
                                          ''
                                        ).then(() => {
                                          void recordAdminAudit(
                                            'SELLER_APPROVED',
                                            'sellers',
                                            s.uid,
                                            `Approved merchant ${s.businessName}`
                                          );
                                          showToast('ok', `${s.businessName} approved & storefront activated.`);
                                        })
                                      }
                                      className="px-2.5 py-1 bg-emerald-700 text-white text-xs font-medium rounded hover:bg-emerald-800 cursor-pointer"
                                    >
                                      Approve
                                    </button>
                                  )}
                                  {s.status !== 'suspended' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void adminUpdateSellerStatus(s.uid, 'suspended').then(() => {
                                          void recordAdminAudit(
                                            'SELLER_SUSPENDED',
                                            'sellers',
                                            s.uid,
                                            `Suspended merchant ${s.businessName}`,
                                            'warning'
                                          );
                                          showToast('ok', `${s.businessName} suspended.`);
                                        })
                                      }
                                      className="px-2.5 py-1 border border-red-200 text-red-700 text-xs font-medium rounded hover:bg-red-50 cursor-pointer"
                                    >
                                      Suspend
                                    </button>
                                  )}
                                </div>
                                {s.status !== 'rejected' && (
                                  <div className="flex justify-end gap-1.5">
                                    <input
                                      type="text"
                                      value={reasonDrafts[s.uid] || ''}
                                      onChange={(e) =>
                                        setReasonDrafts((prev) => ({
                                          ...prev,
                                          [s.uid]: e.target.value,
                                        }))
                                      }
                                      placeholder="Rejection reason..."
                                      className="w-36 px-2 py-1 text-[11px] border border-slate-300 rounded"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const note = reasonDrafts[s.uid] || 'KYC verification incomplete';
                                        void adminUpdateSellerStatus(
                                          s.uid,
                                          'rejected',
                                          undefined,
                                          note
                                        ).then(() => {
                                          void recordAdminAudit(
                                            'SELLER_REJECTED',
                                            'sellers',
                                            s.uid,
                                            `Rejected ${s.businessName}: ${note}`,
                                            'warning'
                                          );
                                          showToast('ok', `${s.businessName} marked rejected.`);
                                        });
                                      }}
                                      className="px-2 py-1 text-[11px] font-medium text-red-700 hover:underline cursor-pointer"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 3. STORE MANAGEMENT */}
          {adminSection === 'stores' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Store Management ({stores.length})
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Live merchant stores: {liveStores.length} · Sample catalog stores: {sampleStoresCount}
                  </p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="py-3 px-4">Storefront</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Location</th>
                        <th className="py-3 px-4">Origin</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Moderation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {stores
                        .filter(
                          (st) =>
                            !q ||
                            st.name.toLowerCase().includes(q) ||
                            st.category.toLowerCase().includes(q)
                        )
                        .map((st) => (
                          <tr key={st.id}>
                            <td className="py-3 px-4">
                              <p className="font-medium text-slate-900">{st.name}</p>
                              <p className="text-xs font-mono text-slate-500">/{st.slug}</p>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600">{st.category}</td>
                            <td className="py-3 px-4 text-xs text-slate-600">{st.location}</td>
                            <td className="py-3 px-4 text-xs">
                              {st.isSample ? (
                                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-medium text-[11px]">
                                  Sample
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium text-[11px]">
                                  Live Seller
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs font-medium capitalize">
                              <span
                                className={
                                  st.status === 'active'
                                    ? 'text-emerald-700'
                                    : st.status === 'pending'
                                    ? 'text-amber-700'
                                    : st.status === 'draft'
                                    ? 'text-slate-500'
                                    : 'text-red-700'
                                }
                              >
                                {st.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right space-x-3">
                              {st.status !== 'active' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminUpdateStoreStatus(st.id, 'active').then(() =>
                                      showToast('ok', `${st.name} activated.`)
                                    )
                                  }
                                  className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                                >
                                  Activate
                                </button>
                              )}
                              {st.status !== 'draft' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminUpdateStoreStatus(st.id, 'draft').then(() =>
                                      showToast('ok', `${st.name} moved to draft.`)
                                    )
                                  }
                                  className="text-xs font-medium text-slate-600 hover:underline cursor-pointer"
                                >
                                  Draft
                                </button>
                              )}
                              {st.status !== 'suspended' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminUpdateStoreStatus(st.id, 'suspended').then(() =>
                                      showToast('ok', `${st.name} suspended.`)
                                    )
                                  }
                                  className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
                                >
                                  Suspend
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 4. PRODUCT MODERATION */}
          {adminSection === 'products' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Product Moderation & Catalog ({products.length})
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Only products marked <span className="font-semibold">Published</span> appear on the customer marketplace.
                    Live listings: {liveProducts.length} · Sample: {sampleProductsCount}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['all', 'pending', 'published', 'draft', 'rejected'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setProductFilter(tab)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize cursor-pointer ${
                        productFilter === tab
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {filteredProducts.length === 0 ? (
                  <p className="text-sm text-slate-500 p-10 text-center">
                    No products match the selected filter.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredProducts.map((p) => {
                      const modStatus: ProductModerationStatus =
                        p.moderationStatus || (p.published ? 'published' : 'draft');
                      return (
                        <div
                          key={p.id}
                          className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div className="flex items-start gap-4 min-w-0">
                            <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                              <ProductVisual
                                variant={p.visualVariant}
                                imageDataUrl={p.imageDataUrl}
                                title={p.title}
                                className="w-full h-full"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-sm text-slate-900 truncate">
                                  {p.title}
                                </p>
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                                    modStatus === 'published'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : modStatus === 'pending'
                                      ? 'bg-amber-50 text-amber-800'
                                      : modStatus === 'rejected'
                                      ? 'bg-red-50 text-red-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {modStatus}
                                </span>
                                {p.isSample && (
                                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px]">
                                    Sample
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {p.storeName} · SKU <span className="font-mono">{p.sku}</span> ·{' '}
                                {p.category}
                                {p.subcategory ? ` / ${p.subcategory}` : ''}
                              </p>
                              <p className="text-xs font-mono text-slate-700 mt-1">
                                {formatPrice(p.priceCents, sanitizeCurrency(p.currency))}
                                {p.originalPriceCents && p.originalPriceCents > p.priceCents && (
                                  <span className="line-through text-slate-400 ml-2">
                                    {formatPrice(p.originalPriceCents, sanitizeCurrency(p.currency))}
                                  </span>
                                )}
                                <span className="ml-3 text-slate-500">Stock: {p.stock}</span>
                              </p>
                              {p.rejectionReason && (
                                <p className="text-[11px] text-red-600 mt-1">
                                  Rejection Note: {p.rejectionReason}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {modStatus !== 'published' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void adminModerateProduct(p.id, 'published', '').then(() => {
                                    void recordAdminAudit(
                                      'PRODUCT_PUBLISHED',
                                      'products',
                                      p.id,
                                      `Approved & published "${p.title}"`
                                    );
                                    showToast('ok', `"${p.title}" approved & published.`);
                                  })
                                }
                                className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-medium rounded-lg hover:bg-emerald-800 cursor-pointer"
                              >
                                Approve & Publish
                              </button>
                            )}
                            {modStatus === 'published' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void adminModerateProduct(p.id, 'draft').then(() => {
                                    void recordAdminAudit(
                                      'PRODUCT_UNPUBLISHED',
                                      'products',
                                      p.id,
                                      `Unpublished "${p.title}"`
                                    );
                                    showToast('ok', `"${p.title}" unpublished to draft.`);
                                  })
                                }
                                className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                              >
                                Unpublish
                              </button>
                            )}
                            <input
                              type="text"
                              value={reasonDrafts[p.id] || ''}
                              onChange={(e) =>
                                setReasonDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                              }
                              placeholder="Reject reason..."
                              className="w-36 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const note = reasonDrafts[p.id] || 'Listing does not meet catalog guidelines';
                                void adminModerateProduct(p.id, 'rejected', note).then(() => {
                                  void recordAdminAudit(
                                    'PRODUCT_REJECTED',
                                    'products',
                                    p.id,
                                    `Rejected "${p.title}": ${note}`,
                                    'warning'
                                  );
                                  showToast('ok', `"${p.title}" rejected.`);
                                });
                              }}
                              className="px-2.5 py-1.5 border border-red-200 text-red-700 text-xs font-medium rounded-lg hover:bg-red-50 cursor-pointer"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void deleteProductById(p.id).then(() => {
                                  void recordAdminAudit(
                                    'PRODUCT_DELETED',
                                    'products',
                                    p.id,
                                    `Deleted product "${p.title}"`,
                                    'warning'
                                  );
                                  showToast('ok', `"${p.title}" deleted.`);
                                })
                              }
                              className="p-1.5 text-slate-400 hover:text-red-700 rounded-lg hover:bg-red-50 cursor-pointer"
                              title="Delete Product"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. CATEGORY MANAGEMENT */}
          {adminSection === 'categories' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Marketplace Categories & GST Slabs ({categories.length})
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Configure product categories, subcategories, and Indian GST rates used across seller product upload and checkout.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void seedDefaultCategoriesIfEmpty().then(() =>
                      showToast('ok', 'Default Indian marketplace categories verified.')
                    )
                  }
                  className="px-3.5 py-2 border border-slate-300 bg-white text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Seed Default Indian Categories
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <form
                  onSubmit={(e) => void handleSaveCategory(e)}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
                >
                  <h2 className="font-display text-base font-bold text-slate-900">
                    {editingCatId ? 'Edit Category' : 'Add Category'}
                  </h2>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Category Name
                    </label>
                    <input
                      type="text"
                      value={catName}
                      onChange={(e) => {
                        setCatName(e.target.value);
                        if (!editingCatId) setCatSlug(makeSlug(e.target.value));
                      }}
                      placeholder="e.g., Handloom & Textiles"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Slug</label>
                    <input
                      type="text"
                      value={catSlug}
                      onChange={(e) => setCatSlug(e.target.value)}
                      placeholder="handloom-textiles"
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Subcategories (comma-separated)
                    </label>
                    <textarea
                      rows={3}
                      value={catSubsText}
                      onChange={(e) => setCatSubsText(e.target.value)}
                      placeholder="Kurtas, Sarees, Stoles"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        GST Rate (%)
                      </label>
                      <select
                        value={catGstPct}
                        onChange={(e) => setCatGstPct(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="0">0% Exempt</option>
                        <option value="5">5% GST</option>
                        <option value="12">12% GST</option>
                        <option value="18">18% GST</option>
                        <option value="28">28% GST</option>
                      </select>
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={catActive}
                          onChange={(e) => setCatActive(e.target.checked)}
                        />
                        Active
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={savingCat}
                      className="flex-1 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                    >
                      {savingCat ? 'Saving...' : editingCatId ? 'Update Category' : 'Create Category'}
                    </button>
                    {editingCatId && (
                      <button
                        type="button"
                        onClick={resetCategoryForm}
                        className="px-3 py-2 border border-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>

                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {categories.map((cat) => (
                      <div key={cat.id} className="p-4 flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm text-slate-900">{cat.name}</p>
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[11px]">
                              {cat.gstRatePct}% GST
                            </span>
                            {!cat.active && (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[11px]">
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-slate-400">/{cat.slug}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {cat.subcategories.map((sub) => (
                              <span
                                key={sub}
                                className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] rounded"
                              >
                                {sub}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditCategory(cat)}
                            className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void deleteCategoryById(cat.id).then(() =>
                                showToast('ok', `Deleted category "${cat.name}".`)
                              )
                            }
                            className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer"
                            title="Delete Category"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. ORDER MANAGEMENT */}
          {adminSection === 'orders' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Order Management ({orders.length})
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pending COD Collection:{' '}
                    <span className="font-mono font-semibold text-slate-900">
                      {formatPrice(
                        orders
                          .filter(
                            (o) =>
                              o.paymentMethod.toLowerCase().includes('cash') &&
                              o.paymentStatus !== 'paid' &&
                              o.status !== 'cancelled'
                          )
                          .reduce((s, o) => s + o.totalCents, 0)
                      )}
                    </span>
                  </p>
                </div>
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">All Order Statuses</option>
                  <option value="cod">Cash on Delivery (COD)</option>
                  {ORDER_LIFECYCLE_STEPS.map((st) => (
                    <option key={st} value={st}>
                      {st.replace(/_/g, ' ')}
                    </option>
                  ))}
                  <option value="cancelled">cancelled</option>
                  <option value="returned">returned</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'All Orders' },
                  { id: 'cod', label: 'COD Orders' },
                  { id: 'pending', label: 'Pending' },
                  { id: 'delivered', label: 'Delivered' },
                  { id: 'cancelled', label: 'Cancelled' },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setOrderStatusFilter(chip.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                      orderStatusFilter === chip.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {orders.length === 0 ? (
                  <p className="text-sm text-slate-500 p-10 text-center">No customer orders yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {orders
                      .filter((o) => {
                        if (orderStatusFilter === 'cod') {
                          if (!o.paymentMethod.toLowerCase().includes('cash')) return false;
                        } else if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) {
                          return false;
                        }
                        if (!q) return true;
                        return (
                          o.id.toLowerCase().includes(q) ||
                          (o.invoiceNumber || '').toLowerCase().includes(q) ||
                          o.storeName.toLowerCase().includes(q) ||
                          o.customerEmail.toLowerCase().includes(q)
                        );
                      })
                      .map((o) => {
                        const gst = computeGstBreakup(o.subtotalCents, o.gstRatePct ?? 18);
                        const isOpen = expandedOrderId === o.id;
                        return (
                          <div key={o.id} className="p-4 space-y-3">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-slate-900">
                                    {o.invoiceNumber || o.id}
                                  </span>
                                  <span className="text-xs text-slate-500">· {o.storeName}</span>
                                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] capitalize font-medium">
                                    {o.status.replace(/_/g, ' ')}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] capitalize font-medium ${
                                      o.paymentStatus === 'paid'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : o.paymentStatus === 'refunded'
                                        ? 'bg-red-50 text-red-700'
                                        : 'bg-amber-50 text-amber-800'
                                    }`}
                                  >
                                    Pay: {o.paymentStatus}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 mt-1">
                                  {o.customerName} ({o.customerEmail}
                                  {o.customerMobile ? ` · +91 ${o.customerMobile}` : ''}) ·{' '}
                                  {[o.city, o.state, o.pinCode].filter(Boolean).join(', ')}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold text-sm text-slate-900 mr-2">
                                  {formatPrice(o.totalCents)}
                                </span>
                                <select
                                  value={o.status}
                                  onChange={(e) => {
                                    const nextSt = e.target.value as OrderStatus;
                                    void adminUpdateOrderStatus(o.id, nextSt).then(() => {
                                      void recordAdminAudit(
                                        'ORDER_STATUS_OVERRIDE',
                                        'orders',
                                        o.id,
                                        `Updated order ${o.invoiceNumber || o.id} to ${nextSt}`
                                      );
                                      showToast('ok', `Order ${o.id} status updated.`);
                                    });
                                  }}
                                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                                >
                                  {ORDER_LIFECYCLE_STEPS.map((st) => (
                                    <option key={st} value={st}>
                                      {st.replace(/_/g, ' ')}
                                    </option>
                                  ))}
                                  <option value="cancelled">cancelled</option>
                                  <option value="returned">returned</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => setExpandedOrderId(isOpen ? null : o.id)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 cursor-pointer"
                                >
                                  {isOpen ? 'Hide GST' : 'GST & Details'}
                                </button>
                              </div>
                            </div>

                            {isOpen && (
                              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <p className="font-semibold text-slate-700 mb-1">Line Items</p>
                                  {o.items.map((it, idx) => (
                                    <p key={idx} className="text-slate-600">
                                      {it.quantity} × {it.title} ({formatPrice(it.unitPriceCents)})
                                    </p>
                                  ))}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-700 mb-1">
                                    GST Breakup ({o.gstRatePct ?? 18}%)
                                  </p>
                                  <p className="text-slate-600">
                                    Taxable: {formatPrice(gst.taxableValuePaise)}
                                  </p>
                                  <p className="text-slate-600">
                                    CGST: {formatPrice(gst.cgstPaise)} · SGST:{' '}
                                    {formatPrice(gst.sgstPaise)}
                                  </p>
                                  <p className="text-slate-600">
                                    Shipping: {formatPrice(o.shippingCents)}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-700 mb-1">
                                    Logistics & Payment
                                  </p>
                                  <p className="text-slate-600">Method: {o.paymentMethod}</p>
                                  <p className="font-mono text-slate-600">
                                    Courier: {o.courierName || 'Not booked'} · AWB:{' '}
                                    {o.awbCode || o.trackingCode}
                                  </p>
                                  {o.razorpayPaymentId && (
                                    <p className="font-mono text-slate-500">
                                      RZP: {o.razorpayPaymentId}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 7. PAYMENT MANAGEMENT */}
          {adminSection === 'payments' && (
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-6">
                Payment Gateway & Settlement Ledger ({payments.length})
              </h1>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {payments.length === 0 ? (
                  <p className="text-sm text-slate-500 p-10 text-center">
                    No customer payment transactions recorded yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Gateway Ref</th>
                          <th className="py-3 px-4">Method</th>
                          <th className="py-3 px-4 text-right">Gross</th>
                          <th className="py-3 px-4 text-right">Platform Fee</th>
                          <th className="py-3 px-4 text-right">Net Seller</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {payments.map((pay) => (
                          <tr key={pay.id}>
                            <td className="py-3 px-4 font-mono text-xs">{pay.gatewayRef}</td>
                            <td className="py-3 px-4 text-xs text-slate-600">{pay.method}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {formatPrice(pay.amountCents)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-blue-700">
                              {formatPrice(pay.platformFeeCents)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                              {formatPrice(pay.netPayoutCents)}
                            </td>
                            <td className="py-3 px-4 text-xs capitalize font-medium">
                              {pay.status}
                            </td>
                            <td className="py-3 px-4 text-right space-x-3">
                              {(pay.status === 'captured' || pay.status === 'pending') && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminUpdatePaymentStatus(pay.id, 'settled').then(() =>
                                      showToast('ok', 'Payment marked settled.')
                                    )
                                  }
                                  className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                                >
                                  Settle Payout
                                </button>
                              )}
                              {pay.status !== 'refunded' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminUpdatePaymentStatus(pay.id, 'refunded').then(() =>
                                      showToast('ok', 'Payment marked refunded.')
                                    )
                                  }
                                  className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
                                >
                                  Refund
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 8. COMMISSION LEDGER */}
          {adminSection === 'commissions' && (
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-6">
                Marketplace Commission Ledger ({commissions.length})
              </h1>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {commissions.length === 0 ? (
                  <p className="text-sm text-slate-500 p-10 text-center">
                    No commission ledger entries recorded yet. Commissions are generated automatically on checkout.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Order & Store</th>
                          <th className="py-3 px-4 text-right">Gross</th>
                          <th className="py-3 px-4 text-right">Rate</th>
                          <th className="py-3 px-4 text-right">Commission</th>
                          <th className="py-3 px-4 text-right">Net Seller</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Settlement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {commissions.map((c) => (
                          <tr key={c.id}>
                            <td className="py-3 px-4">
                              <p className="font-medium text-slate-900">{c.storeName}</p>
                              <p className="text-xs font-mono text-slate-400">{c.orderId}</p>
                            </td>
                            <td className="py-3 px-4 text-right font-mono">
                              {formatPrice(c.grossAmountCents)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs">
                              {(c.commissionRate * 100).toFixed(1)}%
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-blue-700 font-semibold">
                              {formatPrice(c.commissionCents)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono">
                              {formatPrice(c.netSellerCents)}
                            </td>
                            <td className="py-3 px-4 text-xs capitalize font-medium">{c.status}</td>
                            <td className="py-3 px-4 text-right space-x-2">
                              {c.status !== 'settled' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminUpdateCommissionStatus(c.id, 'settled').then(() =>
                                      showToast('ok', 'Commission settled.')
                                    )
                                  }
                                  className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                                >
                                  Mark Settled
                                </button>
                              )}
                              {c.status !== 'reversed' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminUpdateCommissionStatus(c.id, 'reversed').then(() =>
                                      showToast('ok', 'Commission reversed.')
                                    )
                                  }
                                  className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
                                >
                                  Reverse
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 9. SUBSCRIPTION MANAGEMENT */}
          {adminSection === 'subscriptions' && (
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-6">
                Merchant Subscription Management ({subscriptions.length})
              </h1>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {subscriptions.length === 0 ? (
                  <p className="text-sm text-slate-500 p-10 text-center">
                    No seller SaaS subscriptions recorded yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Merchant</th>
                          <th className="py-3 px-4">Plan Tier</th>
                          <th className="py-3 px-4 text-right">Monthly MRR</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Controls</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {subscriptions.map((sub) => (
                          <tr key={sub.id}>
                            <td className="py-3 px-4 font-medium text-slate-900">
                              {sub.sellerName}
                            </td>
                            <td className="py-3 px-4 text-xs uppercase font-mono text-blue-700">
                              {sub.planId}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {formatPrice(sub.monthlyPriceCents)}
                            </td>
                            <td className="py-3 px-4 text-xs capitalize font-medium">
                              {sub.status}
                            </td>
                            <td className="py-3 px-4 text-right space-x-3">
                              {sub.status !== 'active' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminUpdateSubscriptionStatus(sub.id, 'active').then(() =>
                                      showToast('ok', 'Subscription activated.')
                                    )
                                  }
                                  className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                                >
                                  Activate
                                </button>
                              )}
                              {sub.status !== 'past_due' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminUpdateSubscriptionStatus(sub.id, 'past_due').then(() =>
                                      showToast('ok', 'Marked past due.')
                                    )
                                  }
                                  className="text-xs font-medium text-amber-700 hover:underline cursor-pointer"
                                >
                                  Past Due
                                </button>
                              )}
                              {sub.status !== 'cancelled' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminUpdateSubscriptionStatus(sub.id, 'cancelled').then(() =>
                                      showToast('ok', 'Subscription cancelled.')
                                    )
                                  }
                                  className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
                                >
                                  Cancel
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 10. REFUND REQUESTS */}
          {adminSection === 'refunds' && (
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-6">
                Customer Refund Requests ({refunds.length})
              </h1>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {refunds.length === 0 ? (
                  <p className="text-sm text-slate-500 p-10 text-center">
                    No customer refund requests submitted yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {refunds.map((rf) => (
                      <div
                        key={rf.id}
                        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold">{rf.orderId}</span>
                            <span className="text-xs font-semibold text-slate-900">
                              {rf.customerName}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-xs font-mono">
                              {formatPrice(rf.amountCents)}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] capitalize font-medium">
                              {rf.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">Reason: {rf.reason}</p>
                          {rf.adminNotes && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Admin note: {rf.adminNotes}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <input
                            type="text"
                            value={refundNoteDrafts[rf.id] || ''}
                            onChange={(e) =>
                              setRefundNoteDrafts((prev) => ({ ...prev, [rf.id]: e.target.value }))
                            }
                            placeholder="Admin refund note..."
                            className="w-40 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                          {rf.status === 'requested' && (
                            <button
                              type="button"
                              onClick={() => {
                                const note = refundNoteDrafts[rf.id] || 'Approved for settlement';
                                void adminUpdateRefundStatus(rf.id, 'approved', note).then(() => {
                                  void recordAdminAudit(
                                    'REFUND_APPROVED',
                                    'refunds',
                                    rf.id,
                                    `Approved refund for order ${rf.orderId}: ${note}`
                                  );
                                  showToast('ok', 'Refund approved.');
                                });
                              }}
                              className="px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                            >
                              Approve
                            </button>
                          )}
                          {(rf.status === 'requested' || rf.status === 'approved') && (
                            <button
                              type="button"
                              onClick={() => {
                                const note =
                                  refundNoteDrafts[rf.id] || 'Refund processed to source method';
                                void adminUpdateRefundStatus(rf.id, 'processed', note).then(() => {
                                  void recordAdminAudit(
                                    'REFUND_PROCESSED',
                                    'refunds',
                                    rf.id,
                                    `Processed refund for order ${rf.orderId}`
                                  );
                                  showToast('ok', 'Refund marked processed.');
                                });
                              }}
                              className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                            >
                              Mark Processed
                            </button>
                          )}
                          {rf.status !== 'rejected' && rf.status !== 'processed' && (
                            <button
                              type="button"
                              onClick={() => {
                                const note =
                                  refundNoteDrafts[rf.id] || 'Outside 7-day return eligibility';
                                void adminUpdateRefundStatus(rf.id, 'rejected', note).then(() => {
                                  void recordAdminAudit(
                                    'REFUND_REJECTED',
                                    'refunds',
                                    rf.id,
                                    `Rejected refund for order ${rf.orderId}: ${note}`,
                                    'warning'
                                  );
                                  showToast('ok', 'Refund rejected.');
                                });
                              }}
                              className="px-3 py-1.5 border border-red-200 text-red-700 text-xs font-medium rounded-lg cursor-pointer"
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 11. DISPUTE RESOLUTION */}
          {adminSection === 'disputes' && (
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-6">
                Order Dispute Resolution ({disputes.length})
              </h1>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {disputes.length === 0 ? (
                  <p className="text-sm text-slate-500 p-10 text-center">
                    No customer-seller disputes raised yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {disputes.map((dsp) => (
                      <div
                        key={dsp.id}
                        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="max-w-xl">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-slate-900">
                              {dsp.subject}
                            </span>
                            <span className="font-mono text-xs text-slate-500">
                              Order {dsp.orderId}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 text-[11px] capitalize font-medium">
                              {dsp.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            {dsp.customerName} vs {dsp.storeName}
                          </p>
                          <p className="text-xs text-slate-700 mt-1">{dsp.description}</p>
                          {dsp.resolution && (
                            <p className="text-xs text-emerald-700 mt-1">
                              Resolution: {dsp.resolution}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <input
                            type="text"
                            value={disputeNoteDrafts[dsp.id] || ''}
                            onChange={(e) =>
                              setDisputeNoteDrafts((prev) => ({
                                ...prev,
                                [dsp.id]: e.target.value,
                              }))
                            }
                            placeholder="Resolution notes..."
                            className="w-44 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                          {dsp.status === 'open' && (
                            <button
                              type="button"
                              onClick={() =>
                                void adminUpdateDisputeStatus(
                                  dsp.id,
                                  'under_review',
                                  disputeNoteDrafts[dsp.id]
                                ).then(() => showToast('ok', 'Dispute marked under review.'))
                              }
                              className="px-2.5 py-1.5 border border-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                            >
                              Under Review
                            </button>
                          )}
                          {dsp.status !== 'resolved' && dsp.status !== 'closed' && (
                            <button
                              type="button"
                              onClick={() =>
                                void adminUpdateDisputeStatus(
                                  dsp.id,
                                  'resolved',
                                  disputeNoteDrafts[dsp.id] || 'Resolved in coordination with seller & customer'
                                ).then(() => showToast('ok', 'Dispute resolved.'))
                              }
                              className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                            >
                              Resolve
                            </button>
                          )}
                          {dsp.status !== 'closed' && (
                            <button
                              type="button"
                              onClick={() =>
                                void adminUpdateDisputeStatus(
                                  dsp.id,
                                  'closed',
                                  disputeNoteDrafts[dsp.id] || 'Ticket closed'
                                ).then(() => showToast('ok', 'Dispute closed.'))
                              }
                              className="px-2.5 py-1.5 text-xs text-slate-600 hover:underline cursor-pointer"
                            >
                              Close
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 12. REPORTS & PAYOUT SETTLEMENT */}
          {adminSection === 'reports' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Platform Reports & Seller Payout Queue
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Metrics below reflect real recorded transactions cleanly separated from Sample Catalog fixtures.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportReportCsv}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Orders CSV (INR)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500 mb-1">Gross Merchandise Volume</p>
                  <p className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                    {formatPrice(liveGmvCents)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">{orders.length} total orders</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500 mb-1">Platform Commission Fees</p>
                  <p className="font-mono tabular-nums text-2xl font-bold text-blue-700">
                    {formatPrice(effectiveCommissionTotalCents)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {commissions.length} ledger entries
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500 mb-1">Recurring SaaS MRR</p>
                  <p className="font-mono tabular-nums text-2xl font-bold text-emerald-700">
                    {formatPrice(mrrCents)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Pending payouts: {formatPrice(pendingPayoutsCents)}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500 mb-1">Live Storefronts / SKUs</p>
                  <p className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                    {liveStores.filter((s) => s.status === 'active').length} / {liveProducts.length}
                  </p>
                  <p className="text-[11px] text-amber-700 mt-1">
                    Sample catalog: {sampleStoresCount} stores, {sampleProductsCount} SKUs
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Seller Payout Requests ({payouts.length})
                  </h2>
                </div>
                {payouts.length === 0 ? (
                  <p className="text-sm text-slate-500 p-8 text-center">
                    No seller payout withdrawal requests yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {payouts.map((p) => (
                      <div
                        key={p.id}
                        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-900">
                              {p.storeName}
                            </span>
                            <span className="font-mono text-sm font-bold text-emerald-700">
                              {formatPrice(p.amountCents)}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] capitalize">
                              {p.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {p.method} · Account: <span className="font-mono">{p.payoutAccount}</span>
                          </p>
                          {p.bankRef && (
                            <p className="text-[11px] font-mono text-emerald-700 mt-0.5">
                              UTR / Bank Ref: {p.bankRef}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <input
                            type="text"
                            value={utrDrafts[p.id] || ''}
                            onChange={(e) =>
                              setUtrDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            placeholder="UTR / IMPS Ref..."
                            className="w-40 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                          {p.status === 'requested' && (
                            <button
                              type="button"
                              onClick={() =>
                                void adminUpdatePayoutStatus(p.id, 'processing').then(() =>
                                  showToast('ok', 'Payout marked processing.')
                                )
                              }
                              className="px-2.5 py-1.5 border border-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                            >
                              Processing
                            </button>
                          )}
                          {p.status !== 'paid' && p.status !== 'rejected' && (
                            <button
                              type="button"
                              onClick={() => {
                                const ref = utrDrafts[p.id] || `UTR-${Date.now().toString(36).toUpperCase()}`;
                                void adminUpdatePayoutStatus(p.id, 'paid', ref).then(() => {
                                  void recordAdminAudit(
                                    'PAYOUT_PAID',
                                    'payouts',
                                    p.id,
                                    `Settled payout for ${p.storeName} (${ref})`
                                  );
                                  showToast('ok', 'Payout marked settled (Paid).');
                                });
                              }}
                              className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                            >
                              Mark Paid
                            </button>
                          )}
                          {p.status !== 'rejected' && p.status !== 'paid' && (
                            <button
                              type="button"
                              onClick={() =>
                                void adminUpdatePayoutStatus(
                                  p.id,
                                  'rejected',
                                  undefined,
                                  'Bank/UPI validation failed'
                                ).then(() => {
                                  void recordAdminAudit(
                                    'PAYOUT_REJECTED',
                                    'payouts',
                                    p.id,
                                    `Rejected payout for ${p.storeName}`,
                                    'warning'
                                  );
                                  showToast('ok', 'Payout rejected.');
                                })
                              }
                              className="px-2.5 py-1.5 text-xs text-red-600 hover:underline cursor-pointer"
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Coupon & Discount Governance */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-700" />
                    <h2 className="font-display text-base font-bold text-slate-900">
                      {t('admin.coupons')} ({coupons.length})
                    </h2>
                  </div>
                  <form onSubmit={(e) => void handleSaveCoupon(e)} className="grid grid-cols-2 gap-3 text-xs">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Code (e.g. FESTIVE15)"
                      className="px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                    />
                    <select
                      value={couponType}
                      onChange={(e) => setCouponType(e.target.value as 'percent' | 'fixed')}
                      className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="percent">% Percentage Off</option>
                      <option value="fixed">₹ Fixed INR Off</option>
                    </select>
                    <input
                      type="number"
                      value={couponValue}
                      onChange={(e) => setCouponValue(e.target.value)}
                      placeholder={couponType === 'percent' ? 'Discount %' : 'Amount ₹'}
                      className="px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                    <input
                      type="number"
                      value={couponMinInr}
                      onChange={(e) => setCouponMinInr(e.target.value)}
                      placeholder="Min Order (₹)"
                      className="px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                    <input
                      type="number"
                      value={couponMaxInr}
                      onChange={(e) => setCouponMaxInr(e.target.value)}
                      placeholder="Max Cap (₹, 0 = none)"
                      className="px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                    <input
                      type="text"
                      value={couponDesc}
                      onChange={(e) => setCouponDesc(e.target.value)}
                      placeholder="Description..."
                      className="px-3 py-2 border border-slate-300 rounded-lg"
                    />
                    <button
                      type="submit"
                      disabled={couponBusy}
                      className="col-span-2 py-2 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                    >
                      {couponBusy ? 'Saving Coupon...' : 'Save Marketplace Coupon'}
                    </button>
                  </form>

                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto text-xs">
                    {coupons.map((cpn) => (
                      <div key={cpn.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-mono font-bold text-slate-900">
                            {cpn.code}{' '}
                            <span className="font-sans font-normal text-slate-500">
                              ({cpn.discountType === 'percent' ? `${cpn.discountValue}%` : `₹${cpn.discountValue}`})
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Min {formatPrice(cpn.minOrderCents)} · Used {cpn.usageCount}×
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void saveCoupon({ ...cpn, active: !cpn.active }, false).then(() =>
                                showToast('ok', `Coupon ${cpn.code} ${cpn.active ? 'paused' : 'activated'}.`)
                              )
                            }
                            className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                              cpn.active
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {cpn.active ? 'Active' : 'Paused'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteCouponById(cpn.id)}
                            className="text-red-600 hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Platform Notification Broadcast */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-blue-700" />
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Platform Notification Broadcast
                    </h2>
                  </div>
                  <form
                    onSubmit={(e) => void handleBroadcastNotification(e)}
                    className="space-y-3 text-xs"
                  >
                    <select
                      value={broadcastTarget}
                      onChange={(e) =>
                        setBroadcastTarget(e.target.value as 'all_users' | 'approved_sellers')
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="all_users">All Registered Users ({users.length})</option>
                      <option value="approved_sellers">
                        Approved Sellers Only ({sellers.filter((s) => s.status === 'approved').length})
                      </option>
                    </select>
                    <input
                      type="text"
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                      placeholder="Announcement title (e.g. Diwali Sale Dispatch Cutoff)"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                    <textarea
                      rows={3}
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      placeholder="Message delivered directly to in-app notification drawers..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                    <button
                      type="submit"
                      disabled={broadcastBusy}
                      className="w-full py-2 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                    >
                      {broadcastBusy ? 'Sending...' : 'Send Broadcast Notification'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Automated Fraud Flags & Security Audit Logs */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-blue-700" />
                    <h2 className="font-display text-base font-bold text-slate-900">
                      {t('admin.auditLogs')} & Risk Signals
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    {auditLogs.length} audit events
                  </span>
                </div>

                {(() => {
                  const highValueCodOrders = orders.filter(
                    (o) =>
                      o.paymentMethod.toLowerCase().includes('cash') &&
                      o.totalCents >= 2500000 &&
                      o.status !== 'cancelled'
                  );
                  const rejectedPayouts = payouts.filter((p) => p.status === 'rejected');
                  const refundCounts = refunds.reduce<Record<string, number>>((acc, r) => {
                    acc[r.customerId] = (acc[r.customerId] || 0) + 1;
                    return acc;
                  }, {});
                  const repeatRefundCustomers = Object.values(refundCounts).filter((c) => c >= 2).length;
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <p className="text-slate-500">High-Value COD (&gt; ₹25,000)</p>
                        <p className="font-mono text-lg font-bold text-slate-900">
                          {highValueCodOrders.length}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <p className="text-slate-500">Repeat Refund Accounts (2+)</p>
                        <p className="font-mono text-lg font-bold text-slate-900">
                          {repeatRefundCustomers}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <p className="text-slate-500">Flagged / Rejected Payouts</p>
                        <p className="font-mono text-lg font-bold text-slate-900">
                          {rejectedPayouts.length}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto text-xs">
                  {auditLogs.length === 0 ? (
                    <p className="py-6 text-center text-slate-500">
                      Administrative governance actions will appear here automatically.
                    </p>
                  ) : (
                    auditLogs.slice(0, 25).map((log) => (
                      <div key={log.id} className="py-2.5 flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-900">
                            <span className="font-mono text-blue-700 mr-2">{log.action}</span>
                            {log.summary}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            By {log.actorEmail} · Target {log.targetType}/{log.targetId}
                          </p>
                        </div>
                        <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 13. SYSTEM SETTINGS & INTEGRATIONS */}
          {adminSection === 'settings' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  System Settings & Integration Readiness
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Configure moderation workflows, multi-currency/language governance, Indian GST defaults, and inspect live server credentials.
                </p>
              </div>

              {/* Integration Readiness Matrix */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-blue-700" />
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Backend Integration Readiness
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshIntegrationsStatus()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh Status
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    {
                      label: 'Gemini AI Studio',
                      ready: integrationsStatus.geminiConfigured,
                      env: 'GEMINI_API_KEY',
                    },
                    {
                      label: 'Razorpay Checkout',
                      ready: integrationsStatus.razorpayConfigured,
                      env: 'RAZORPAY_KEY_ID / SECRET',
                    },
                    {
                      label: 'Razorpay Webhook',
                      ready: integrationsStatus.razorpayWebhookConfigured,
                      env: 'RAZORPAY_WEBHOOK_SECRET',
                    },
                    {
                      label: 'Shiprocket API',
                      ready: integrationsStatus.shiprocketConfigured,
                      env: 'SHIPROCKET_EMAIL / PASS',
                    },
                    {
                      label: 'WhatsApp Cloud API',
                      ready: integrationsStatus.whatsappConfigured,
                      env: 'WHATSAPP_ACCESS_TOKEN / PHONE_ID',
                    },
                    {
                      label: 'WhatsApp Webhook',
                      ready: integrationsStatus.whatsappWebhookConfigured,
                      env: 'WHATSAPP_VERIFY_TOKEN',
                    },
                    {
                      label: 'Cash on Delivery (INR)',
                      ready: integrationsStatus.codAvailable,
                      env: 'Active',
                    },
                    {
                      label: 'Live Currency FX',
                      ready: fxFeed.isLive || integrationsStatus.fxLiveSupported,
                      env: fxFeed.source,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-slate-900">{item.label}</span>
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            item.ready ? 'text-emerald-600' : 'text-amber-500'
                          }`}
                        />
                      </div>
                      <p className="text-[11px] font-medium text-slate-600">
                        {item.ready ? 'Configured & Live' : 'Keys Missing'}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400 truncate">{item.env}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Platform Settings Form */}
              <form
                onSubmit={(e) => void handleSavePlatformSettings(e)}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reqProductApproval}
                      onChange={(e) => setReqProductApproval(e.target.checked)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        Require Admin Product Approval
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Seller submissions enter Pending Moderation until approved here.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reqSellerApproval}
                      onChange={(e) => setReqSellerApproval(e.target.checked)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        Require Admin Seller KYC Approval
                      </p>
                      <p className="text-[11px] text-slate-500">
                        New sellers and storefronts require admin approval before going live.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Multi-Currency & Multi-Language Governance */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-blue-700" />
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        {t('admin.currencyLangGovernance')}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshFxRates(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Refresh FX ({fxFeed.isLive ? 'Live' : 'Ref'})
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-2">
                      <p className="font-semibold text-slate-800">Enabled Marketplace Currencies</p>
                      <div className="flex flex-wrap gap-3">
                        {ALL_CURRENCIES.map((code) => {
                          const checked = enabledCurrencies.includes(code);
                          return (
                            <label key={code} className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEnabledCurrencies((prev) =>
                                      prev.includes(code) ? prev : [...prev, code]
                                    );
                                  } else if (enabledCurrencies.length > 1) {
                                    setEnabledCurrencies((prev) => prev.filter((c) => c !== code));
                                  }
                                }}
                              />
                              <span>{CURRENCY_META[code].nativeLabel}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Default Display Currency
                        </label>
                        <select
                          value={defaultCurrency}
                          onChange={(e) => setDefaultCurrency(sanitizeCurrency(e.target.value))}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                        >
                          {enabledCurrencies.map((code) => (
                            <option key={code} value={code}>
                              {CURRENCY_META[code].label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="font-semibold text-slate-800">Enabled UI Languages</p>
                      <div className="flex flex-wrap gap-3">
                        {ALL_LANGUAGES.map((code) => {
                          const checked = enabledLanguages.includes(code);
                          return (
                            <label key={code} className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEnabledLanguages((prev) =>
                                      prev.includes(code) ? prev : [...prev, code]
                                    );
                                  } else if (enabledLanguages.length > 1) {
                                    setEnabledLanguages((prev) => prev.filter((l) => l !== code));
                                  }
                                }}
                              />
                              <span>{LANGUAGE_META[code].nativeName}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Default Platform Language
                        </label>
                        <select
                          value={defaultLanguage}
                          onChange={(e) => setDefaultLanguage(sanitizeLanguage(e.target.value))}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                        >
                          {enabledLanguages.map((code) => (
                            <option key={code} value={code}>
                              {LANGUAGE_META[code].nativeName} ({LANGUAGE_META[code].label})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Default GST Rate (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="28"
                      value={defaultGstPct}
                      onChange={(e) => setDefaultGstPct(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Free Shipping Threshold (₹ INR)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={freeShipInr}
                      onChange={(e) => setFreeShipInr(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Standard Shipping Fee (₹ INR)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={defaultShipInr}
                      onChange={(e) => setDefaultShipInr(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                    Seller Subscription Plan Pricing, Commission (%) & SKU Limits
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border border-slate-200 space-y-2.5">
                      <p className="text-xs font-bold text-slate-900">Starter Tier</p>
                      <div>
                        <label className="block text-[11px] text-slate-500">Monthly ₹</label>
                        <input
                          type="number"
                          value={starterPriceInr}
                          onChange={(e) => setStarterPriceInr(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500">Commission %</label>
                        <input
                          type="number"
                          step="0.1"
                          value={starterCommPct}
                          onChange={(e) => setStarterCommPct(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500">Max SKUs</label>
                        <input
                          type="number"
                          value={starterSkuLimit}
                          onChange={(e) => setStarterSkuLimit(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                        />
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-slate-200 space-y-2.5">
                      <p className="text-xs font-bold text-slate-900">Growth Tier</p>
                      <div>
                        <label className="block text-[11px] text-slate-500">Monthly ₹</label>
                        <input
                          type="number"
                          value={growthPriceInr}
                          onChange={(e) => setGrowthPriceInr(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500">Commission %</label>
                        <input
                          type="number"
                          step="0.1"
                          value={growthCommPct}
                          onChange={(e) => setGrowthCommPct(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500">Max SKUs</label>
                        <input
                          type="number"
                          value={growthSkuLimit}
                          onChange={(e) => setGrowthSkuLimit(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                        />
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-slate-200 space-y-2.5">
                      <p className="text-xs font-bold text-slate-900">Pro Tier</p>
                      <div>
                        <label className="block text-[11px] text-slate-500">Monthly ₹</label>
                        <input
                          type="number"
                          value={proPriceInr}
                          onChange={(e) => setProPriceInr(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500">Commission %</label>
                        <input
                          type="number"
                          step="0.1"
                          value={proCommPct}
                          onChange={(e) => setProCommPct(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500">Max SKUs</label>
                        <input
                          type="number"
                          value={proSkuLimit}
                          onChange={(e) => setProSkuLimit(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
                  <p className="text-[11px] text-slate-400">
                    Last updated: {new Date(platformSettings.updatedAt).toLocaleString('en-IN')}
                  </p>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="px-5 py-2.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                  >
                    {savingSettings ? 'Saving...' : 'Save Platform Settings'}
                  </button>
                </div>
              </form>

              {/* Sample Catalog Separation Controls */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Sample Catalog Management
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Sample stores ({sampleStoresCount}) and products ({sampleProductsCount}) are flagged with{' '}
                    <code className="font-mono">isSample: true</code>. Clear sample fixtures once live sellers onboard.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void syncSampleMedia().then((res) =>
                        showToast(
                          'ok',
                          `Synced ${res.products} products, ${res.stores} stores, ${res.categories} categories with fresh catalog photos.`
                        )
                      )
                    }
                    className="px-3.5 py-2 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium rounded-lg hover:bg-blue-100 cursor-pointer"
                  >
                    {t('admin.syncSamplePhotos')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void triggerMarketplaceSeed().then((seeded) =>
                        showToast(
                          'ok',
                          seeded
                            ? 'Sample stores & products loaded.'
                            : 'Catalog already populated with active stores.'
                        )
                      )
                    }
                    className="px-3.5 py-2 border border-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    Load Sample Catalog
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void clearSampleData().then((count) =>
                        showToast('ok', `Removed ${count} sample store/product records.`)
                      )
                    }
                    className="px-3.5 py-2 border border-red-200 text-red-700 text-xs font-medium rounded-lg hover:bg-red-50 cursor-pointer"
                  >
                    Clear Sample Catalog Data
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

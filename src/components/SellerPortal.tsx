import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bell,
  Boxes,
  Calculator,
  Camera,
  Check,
  Copy,
  ExternalLink,
  FileText,
  FolderTree,
  Home,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Package,
  Palette,
  Plus,
  PlusCircle,
  Send,
  Settings,
  ShoppingBag,
  Sparkles,
  Store as StoreIcon,
  Trash2,
  Truck,
  Upload,
  Users,
  Wallet,
  X,
  XCircle,
  ZoomIn,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  adjustProductStock,
  advanceOrderStatus,
  deleteAssetFile,
  deleteProductById,
  ensureSellerWorkspace,
  markNotificationRead,
  requestSellerPayout,
  saveCustomerCRM,
  saveProduct,
  saveStore,
  subscribeSellerAccount,
  subscribeSellerAssets,
  subscribeSellerCommissions,
  subscribeSellerCRM,
  subscribeSellerOrders,
  subscribeSellerPayments,
  subscribeSellerPayouts,
  subscribeSellerProducts,
  subscribeSellerStores,
  updateSellerProfileAndPayout,
  updateSellerSubscriptionPlan,
  uploadAssetFile,
} from '../lib/firestoreService';
import {
  ALL_CURRENCIES,
  CURRENCY_META,
  sanitizeCurrency,
  type SupportedCurrency,
} from '../lib/currency';
import { computeGstBreakup, COURIER_PARTNERS, INDIAN_STATES } from '../lib/indiaData';
import { SUBSCRIPTION_PLANS } from '../lib/seedData';
import {
  makeSlug,
  sanitizeId,
  type AssetFile,
  type CommissionRecord,
  type CustomerCRM,
  type Order,
  type OrderStatus,
  type PaymentRecord,
  type PayoutRecord,
  type Product,
  type ProductModerationStatus,
  type SellerAccount,
  type SellerSection,
  type Store,
} from '../types/commerce';
import { LocaleControls } from './LocaleControls';
import { ProductVisual } from './ProductVisual';

interface ProductFormState {
  id?: string;
  title: string;
  sku: string;
  category: string;
  subcategory: string;
  description: string;
  bulletsText: string;
  tagsText: string;
  seoText: string;
  currency: SupportedCurrency;
  priceInr: string;
  originalPriceInr: string;
  costInr: string;
  shippingChargeInr: string;
  gstRatePct: string;
  stock: string;
  reorderPoint: string;
  sizesText: string;
  colorsText: string;
  weightGrams: string;
  dimensions: string;
  shippingInfo: string;
  returnPolicy: string;
  visualVariant: string;
  imageDataUrl?: string;
  imageAssetIds: string[];
  moderationStatus: ProductModerationStatus;
  published: boolean;
}

const DEFAULT_PRODUCT_FORM = (
  store?: Store | null,
  defaultCat = 'Home & Living',
  defaultGst = 18
): ProductFormState => ({
  title: '',
  sku: `SF-${Date.now().toString(36).slice(-5).toUpperCase()}`,
  category: store?.category || defaultCat,
  subcategory: '',
  description: '',
  bulletsText: '',
  tagsText: '',
  seoText: '',
  currency: 'INR',
  priceInr: '1499',
  originalPriceInr: '1899',
  costInr: '550',
  shippingChargeInr: '0',
  gstRatePct: String(defaultGst),
  stock: '25',
  reorderPoint: '8',
  sizesText: 'Standard',
  colorsText: 'Natural',
  weightGrams: '450',
  dimensions: '20 x 15 x 10 cm',
  shippingInfo: store?.shippingPolicy || 'Dispatched within 48 hours via Shiprocket PAN-India',
  returnPolicy: store?.returnPolicy || '7-day replacement for transit damage or defects',
  visualVariant: 'vessel',
  imageDataUrl: undefined,
  imageAssetIds: [],
  moderationStatus: 'draft',
  published: false,
});

export const SellerPortal: React.FC = () => {
  const {
    userProfile,
    isAdmin,
    setPortal,
    navigateToPublic,
    navigateToMarketplace,
    sellerSection,
    setSellerSection,
    categories,
    notifications,
    platformSettings,
    integrationsStatus,
    formatPrice,
    t,
    signOutUser,
  } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const uid = userProfile?.uid || '';

  const [sellerAccount, setSellerAccount] = useState<SellerAccount | null>(null);
  const [sellerStores, setSellerStores] = useState<Store[]>([]);
  const [sellerProducts, setSellerProducts] = useState<Product[]>([]);
  const [sellerOrders, setSellerOrders] = useState<Order[]>([]);
  const [crmCustomers, setCrmCustomers] = useState<CustomerCRM[]>([]);
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [sellerPayments, setSellerPayments] = useState<PaymentRecord[]>([]);
  const [sellerCommissions, setSellerCommissions] = useState<CommissionRecord[]>([]);
  const [sellerPayouts, setSellerPayouts] = useState<PayoutRecord[]>([]);

  // Full Product Upload / Edit Form State
  const [prodForm, setProdForm] = useState<ProductFormState>(() =>
    DEFAULT_PRODUCT_FORM(
      null,
      categories[0]?.name || 'Home & Living',
      categories[0]?.gstRatePct ?? platformSettings.defaultGstPct ?? 18
    )
  );
  const [prodImagePreviews, setProdImagePreviews] = useState<AssetFile[]>([]);
  const [prodImageUploading, setProdImageUploading] = useState(false);
  const [prodSaving, setProdSaving] = useState(false);
  const [prodFeedback, setProdFeedback] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Order & Shipping state
  const [orderFilter, setOrderFilter] = useState<string>('all');
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectReasonDraft, setRejectReasonDraft] = useState('');
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [dispatchForm, setDispatchForm] = useState({
    courierName: COURIER_PARTNERS[0] as string,
    awbCode: '',
  });
  const [shippingMsg, setShippingMsg] = useState<string | null>(null);
  const [shippingBusyId, setShippingBusyId] = useState<string | null>(null);
  const [cancelShipBusyId, setCancelShipBusyId] = useState<string | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);

  // AI Seller Assistant Q&A state
  const [aiChatQuestion, setAiChatQuestion] = useState('');
  const [aiChatBusy, setAiChatBusy] = useState(false);
  const [aiChatAnswer, setAiChatAnswer] = useState<string | null>(null);
  const [aiChatError, setAiChatError] = useState<string | null>(null);

  // CRM modal
  const [showCrmModal, setShowCrmModal] = useState(false);
  const [crmForm, setCrmForm] = useState<{
    id?: string;
    name: string;
    email: string;
    segment: CustomerCRM['segment'];
    notes: string;
  }>({ name: '', email: '', segment: 'new', notes: '' });

  // Store Settings state
  const [storeForm, setStoreForm] = useState<Store | null>(null);
  const [storeSaveMsg, setStoreSaveMsg] = useState<string | null>(null);

  // Profile / KYC Settings state
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    businessName: '',
    mobile: '',
    address: '',
    city: '',
    state: 'Karnataka',
    pinCode: '',
    businessCategory: 'Home & Living',
    gstin: '',
    panNumber: '',
    upiId: '',
    bankAccountName: '',
    bankAccountNumber: '',
    ifscCode: '',
  });
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Payout Request form
  const [payoutForm, setPayoutForm] = useState<{
    amountInr: string;
    method: PayoutRecord['method'];
    payoutAccount: string;
    notes: string;
  }>({
    amountInr: '',
    method: 'UPI',
    payoutAccount: '',
    notes: '',
  });
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);

  // AI Business Insights state
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insightsData, setInsightsData] = useState<{
    executiveSummary: string;
    priorityActions: string[];
    pricingOpportunity: string;
    inventoryAlertNote: string;
  } | null>(null);

  // AI Product Studio state (INR)
  const [aiProdInput, setAiProdInput] = useState({
    productIdea: '',
    category: categories[0]?.name || 'Home & Living',
    targetAudience: 'Urban Indian online shoppers',
    costInr: '550',
    tone: 'Refined editorial, factual Indian English',
  });
  const [aiProdBusy, setAiProdBusy] = useState(false);
  const [aiProdError, setAiProdError] = useState<string | null>(null);
  const [aiProdOutput, setAiProdOutput] = useState<{
    title: string;
    skuSuggestion: string;
    subtitle: string;
    categorySuggestion: string;
    subcategorySuggestion: string;
    description: string;
    bulletPoints: string[];
    seoKeywords: string[];
    tags: string[];
    marketingCopy: string;
    suggestedPriceCents: number;
    suggestedMrpCents: number;
    marginAssessment: string;
    merchandisingTip: string;
  } | null>(null);
  const [aiPublishMsg, setAiPublishMsg] = useState<string | null>(null);

  // AI Marketing Studio state
  const [aiMktInput, setAiMktInput] = useState({
    productName: '',
    valueProposition: '',
    channel: 'WhatsApp & Instagram Launch',
    objective: 'First-time Indian buyer conversion',
  });
  const [aiMktBusy, setAiMktBusy] = useState(false);
  const [aiMktError, setAiMktError] = useState<string | null>(null);
  const [aiMktOutput, setAiMktOutput] = useState<{
    campaignTitle: string;
    emailSubject: string;
    emailBody: string;
    socialAdCopy: string;
    searchHeadlines: string[];
    callToAction: string;
    targetPersonaNote: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // INR Profit Calculator state
  const [calcState, setCalcState] = useState({
    retailPriceInr: 1499,
    landedCogsInr: 550,
    shippingCostInr: 85,
    packagingCostInr: 35,
    adSpendCpaInr: 160,
    gstPct: 18,
    gatewayPct: 2.0,
    commissionPct: 5.0,
    returnPct: 3.0,
  });

  // Asset upload state
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const u1 = subscribeSellerAccount(uid, setSellerAccount);
    const u2 = subscribeSellerStores(uid, setSellerStores);
    const u3 = subscribeSellerProducts(uid, setSellerProducts);
    const u4 = subscribeSellerOrders(uid, setSellerOrders);
    const u5 = subscribeSellerCRM(uid, setCrmCustomers);
    const u6 = subscribeSellerAssets(uid, setAssets);
    const u7 = subscribeSellerPayments(uid, setSellerPayments);
    const u8 = subscribeSellerCommissions(uid, setSellerCommissions);
    const u9 = subscribeSellerPayouts(uid, setSellerPayouts);
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
      u8();
      u9();
    };
  }, [uid]);

  useEffect(() => {
    if (sellerStores[0] && !storeForm) {
      setStoreForm(sellerStores[0]);
    }
  }, [sellerStores, storeForm]);

  useEffect(() => {
    if (sellerAccount) {
      setProfileForm({
        fullName: sellerAccount.fullName || userProfile?.displayName || '',
        businessName: sellerAccount.businessName || '',
        mobile: sellerAccount.mobile || '',
        address: sellerAccount.address || '',
        city: sellerAccount.city || '',
        state: sellerAccount.state || 'Karnataka',
        pinCode: sellerAccount.pinCode || '',
        businessCategory: sellerAccount.businessCategory || categories[0]?.name || 'Home & Living',
        gstin: sellerAccount.gstin || '',
        panNumber: sellerAccount.panNumber || '',
        upiId: sellerAccount.upiId || '',
        bankAccountName: sellerAccount.bankAccountName || '',
        bankAccountNumber: sellerAccount.bankAccountNumber || '',
        ifscCode: sellerAccount.ifscCode || '',
      });
      setCalcState((prev) => ({
        ...prev,
        commissionPct: Number(((sellerAccount.commissionRate || 0.05) * 100).toFixed(1)),
      }));
      if (!payoutForm.payoutAccount) {
        setPayoutForm((p) => ({
          ...p,
          payoutAccount: sellerAccount.upiId || sellerAccount.payoutAccount || '',
        }));
      }
    }
  }, [sellerAccount, userProfile?.displayName, categories, payoutForm.payoutAccount]);

  const activeStore = sellerStores[0] ?? null;

  useEffect(() => {
    if (sellerProducts[0] && !aiMktInput.productName) {
      setAiMktInput((prev) => ({
        ...prev,
        productName: sellerProducts[0].title,
        valueProposition: sellerProducts[0].description.slice(0, 140),
      }));
    }
  }, [sellerProducts, aiMktInput.productName]);

  // Metrics & Earnings
  const grossRevenueCents = useMemo(
    () =>
      sellerOrders
        .filter((o) => o.status !== 'cancelled' && o.status !== 'returned')
        .reduce((sum, o) => sum + o.totalCents, 0),
    [sellerOrders]
  );

  const totalCommissionCents = useMemo(
    () =>
      sellerCommissions
        .filter((c) => c.status !== 'reversed')
        .reduce((sum, c) => sum + c.commissionCents, 0),
    [sellerCommissions]
  );

  const netEarningsCents = useMemo(
    () =>
      sellerCommissions
        .filter((c) => c.status !== 'reversed')
        .reduce((sum, c) => sum + c.netSellerCents, 0),
    [sellerCommissions]
  );

  const paidOrRequestedPayoutsCents = useMemo(
    () =>
      sellerPayouts
        .filter((p) => p.status !== 'rejected')
        .reduce((sum, p) => sum + p.amountCents, 0),
    [sellerPayouts]
  );

  const withdrawableBalanceCents = Math.max(0, netEarningsCents - paidOrRequestedPayoutsCents);

  const lowStockProducts = useMemo(
    () => sellerProducts.filter((p) => p.stock <= p.reorderPoint),
    [sellerProducts]
  );

  const inventoryValueCents = useMemo(
    () => sellerProducts.reduce((sum, p) => sum + p.stock * p.costCents, 0),
    [sellerProducts]
  );

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const navItems: {
    key: SellerSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { key: 'overview', label: t('sell.overview'), icon: LayoutDashboard },
    { key: 'my-store', label: t('sell.myStore'), icon: StoreIcon },
    { key: 'add-product', label: t('sell.addProduct'), icon: PlusCircle },
    { key: 'products', label: t('sell.products'), icon: Package },
    { key: 'categories', label: t('sell.categories'), icon: FolderTree },
    { key: 'inventory', label: t('sell.inventory'), icon: Boxes },
    { key: 'orders', label: t('sell.orders'), icon: ShoppingBag },
    { key: 'shipping', label: t('sell.shipping'), icon: Truck },
    { key: 'crm', label: t('sell.crm'), icon: Users },
    { key: 'analytics', label: t('sell.analytics'), icon: BarChart3 },
    { key: 'earnings', label: t('sell.earnings'), icon: IndianRupee },
    { key: 'payouts', label: t('sell.payouts'), icon: Wallet },
    { key: 'ai-product-studio', label: t('sell.aiProduct'), icon: Sparkles },
    { key: 'ai-marketing-studio', label: t('sell.aiMarketing'), icon: Megaphone },
    { key: 'profit-calculator', label: t('sell.profitCalc'), icon: Calculator },
    { key: 'store-settings', label: t('sell.storeSettings'), icon: Palette },
    { key: 'settings', label: t('sell.profileSettings'), icon: Settings },
  ];

  // Product Form Helpers
  const startNewProductForm = () => {
    const targetCat = activeStore?.category || categories[0]?.name || 'Home & Living';
    const matchedCat = categories.find((c) => c.name === targetCat);
    setProdForm(
      DEFAULT_PRODUCT_FORM(
        activeStore,
        targetCat,
        matchedCat?.gstRatePct ?? platformSettings.defaultGstPct ?? 18
      )
    );
    setProdImagePreviews([]);
    setProdFeedback(null);
    setSellerSection('add-product');
  };

  const startEditProductForm = (p: Product) => {
    const matchedCat = categories.find((c) => c.name === p.category);
    setProdForm({
      id: p.id,
      title: p.title,
      sku: p.sku,
      category: p.category,
      subcategory: p.subcategory || '',
      description: p.description,
      bulletsText: (p.bulletPoints ?? []).join('\n'),
      tagsText: (p.tags ?? []).join(', '),
      seoText: (p.seoKeywords ?? []).join(', '),
      currency: sanitizeCurrency(p.currency),
      priceInr: (p.priceCents / 100).toFixed(2),
      originalPriceInr: ((p.originalPriceCents ?? p.priceCents) / 100).toFixed(2),
      costInr: (p.costCents / 100).toFixed(2),
      shippingChargeInr: ((p.shippingFeeCents ?? 0) / 100).toFixed(2),
      gstRatePct: String(p.gstRatePct ?? matchedCat?.gstRatePct ?? platformSettings.defaultGstPct ?? 18),
      stock: String(p.stock),
      reorderPoint: String(p.reorderPoint),
      sizesText: (p.sizes ?? []).join(', '),
      colorsText: (p.colors ?? []).join(', '),
      weightGrams: String(p.weightGrams ?? 400),
      dimensions: p.dimensions || '20 x 15 x 10 cm',
      shippingInfo: p.shippingInfo || '',
      returnPolicy: p.returnPolicy || '',
      visualVariant: p.visualVariant || 'vessel',
      imageDataUrl: p.imageDataUrl,
      imageAssetIds: p.imageAssetIds ?? [],
      moderationStatus: p.moderationStatus || (p.published ? 'published' : 'draft'),
      published: p.published,
    });
    const matchedAssets = assets.filter((a) => (p.imageAssetIds ?? []).includes(a.id));
    setProdImagePreviews(matchedAssets);
    setProdFeedback(null);
    setSellerSection('add-product');
  };

  const handleMultiProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !uid) return;
    setProdImageUploading(true);
    setProdFeedback(null);
    try {
      const uploaded: AssetFile[] = [];
      for (const file of files.slice(0, 6)) {
        const asset = await uploadAssetFile({ ownerId: uid, storeId: activeStore?.id, file });
        uploaded.push(asset);
      }
      setProdImagePreviews((prev) => [...prev, ...uploaded].slice(0, 8));
      setProdForm((prev) => ({
        ...prev,
        imageDataUrl: prev.imageDataUrl || uploaded[0]?.dataUrl,
        imageAssetIds: [...prev.imageAssetIds, ...uploaded.map((u) => u.id)].slice(0, 8),
      }));
      setProdFeedback(`Uploaded ${uploaded.length} image(s) to persistent asset storage.`);
    } catch (err) {
      setProdFeedback(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setProdImageUploading(false);
      e.target.value = '';
    }
  };

  const submitProductForm = async (targetAction: 'draft' | 'pending' | 'published') => {
    if (!activeStore || !uid) {
      setProdFeedback('Please wait for your storefront workspace to initialize.');
      return;
    }
    if (prodForm.title.trim().length < 2) {
      setProdFeedback('Product Name must be at least 2 characters.');
      return;
    }
    const priceCents = Math.max(0, Math.round(parseFloat(prodForm.priceInr || '0') * 100));
    const originalPriceCents = Math.max(
      priceCents,
      Math.round(parseFloat(prodForm.originalPriceInr || prodForm.priceInr || '0') * 100)
    );
    const discountPct =
      originalPriceCents > priceCents
        ? Math.round(((originalPriceCents - priceCents) / originalPriceCents) * 100)
        : 0;
    const costCents = Math.max(0, Math.round(parseFloat(prodForm.costInr || '0') * 100));
    const shippingFeeCents = Math.max(0, Math.round(parseFloat(prodForm.shippingChargeInr || '0') * 100));
    const gstRatePct = Math.min(50, Math.max(0, parseFloat(prodForm.gstRatePct || '18') || 0));

    const effectiveMod: ProductModerationStatus =
      targetAction === 'published' && platformSettings.requireProductApproval && !isAdmin
        ? 'pending'
        : targetAction;

    setProdSaving(true);
    setProdFeedback(null);
    try {
      const isNew = !prodForm.id;
      const productId =
        prodForm.id ||
        sanitizeId(`prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`);

      await saveProduct(
        {
          id: productId,
          storeId: activeStore.id,
          storeName: activeStore.name,
          sellerId: uid,
          title: prodForm.title.trim(),
          sku: prodForm.sku.trim() || `SF-${Date.now().toString(36).toUpperCase()}`,
          category: prodForm.category || activeStore.category,
          subcategory: prodForm.subcategory.trim(),
          description: prodForm.description.trim(),
          bulletPoints: prodForm.bulletsText
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          tags: prodForm.tagsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          seoKeywords: prodForm.seoText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          currency: prodForm.currency,
          priceCents,
          originalPriceCents,
          discountPct,
          shippingFeeCents,
          gstRatePct,
          costCents,
          stock: Math.max(0, parseInt(prodForm.stock || '0', 10) || 0),
          reorderPoint: Math.max(0, parseInt(prodForm.reorderPoint || '5', 10) || 5),
          published: effectiveMod === 'published',
          moderationStatus: effectiveMod,
          sizes: prodForm.sizesText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          colors: prodForm.colorsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          weightGrams: Math.max(0, parseInt(prodForm.weightGrams || '0', 10) || 0),
          dimensions: prodForm.dimensions.trim(),
          shippingInfo: prodForm.shippingInfo.trim(),
          returnPolicy: prodForm.returnPolicy.trim(),
          visualVariant: prodForm.visualVariant || 'vessel',
          imageDataUrl: prodForm.imageDataUrl,
          imageAssetIds: prodForm.imageAssetIds,
        },
        isNew
      );

      setProdFeedback(
        effectiveMod === 'published'
          ? `Published "${prodForm.title}" live to the marketplace!`
          : effectiveMod === 'pending'
          ? `Submitted "${prodForm.title}" for Admin verification & catalog approval.`
          : `Saved "${prodForm.title}" as Draft.`
      );
      setSellerSection('products');
    } catch (err) {
      setProdFeedback(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setProdSaving(false);
    }
  };

  // Shipping & Order Handlers
  const handleBookShiprocket = async (ord: Order) => {
    setShippingBusyId(ord.id);
    setShippingMsg(null);
    try {
      const res = await fetch('/api/shipping/shiprocket/create-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: ord }),
      });
      const data = await res.json();
      if (!res.ok) {
        setShippingMsg(data.error || 'Shiprocket booking failed.');
        return;
      }
      await advanceOrderStatus(ord, 'shipped', {
        courierName: data.courierName,
        awbCode: data.awbCode,
        trackingCode: data.awbCode,
        shiprocketOrderId: data.shiprocketOrderId,
        shipmentStatus: data.shipmentStatus,
      });
      setShippingMsg(`Booked Shiprocket AWB ${data.awbCode} (${data.courierName}).`);
    } catch (err) {
      setShippingMsg(err instanceof Error ? err.message : 'Shiprocket request failed.');
    } finally {
      setShippingBusyId(null);
    }
  };

  const handleCancelShiprocket = async (ord: Order) => {
    if (!ord.shiprocketOrderId) return;
    setCancelShipBusyId(ord.id);
    setShippingMsg(null);
    try {
      const res = await fetch('/api/shipping/shiprocket/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiprocketOrderId: ord.shiprocketOrderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setShippingMsg(data.error || 'Shiprocket cancellation failed.');
        return;
      }
      await advanceOrderStatus(ord, 'cancelled', {
        shipmentStatus: 'CANCELLED',
        notes: 'Shiprocket shipment cancelled by seller',
      });
      setShippingMsg(`Cancelled Shiprocket shipment ${ord.shiprocketOrderId}.`);
    } catch (err) {
      setShippingMsg(err instanceof Error ? err.message : 'Shiprocket cancellation error.');
    } finally {
      setCancelShipBusyId(null);
    }
  };

  const handleRejectOrderConfirm = async (ord: Order) => {
    const reason = rejectReasonDraft.trim() || 'Rejected by seller due to stock or serviceability limits';
    await advanceOrderStatus(ord, 'cancelled', { notes: reason });
    setRejectingOrderId(null);
    setRejectReasonDraft('');
  };

  const handleManualDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchOrder) return;
    const tracking = dispatchForm.awbCode.trim() || dispatchOrder.trackingCode;
    await advanceOrderStatus(dispatchOrder, 'shipped', {
      courierName: dispatchForm.courierName,
      awbCode: tracking,
      trackingCode: tracking,
      shipmentStatus: 'DISPATCHED',
    });
    setShippingMsg(`Dispatched ${dispatchOrder.id.slice(-8)} via ${dispatchForm.courierName} (${tracking}).`);
    setDispatchOrder(null);
  };

  // AI Handlers
  const handleRunInsights = async () => {
    setInsightsBusy(true);
    setInsightsError(null);
    try {
      const res = await fetch('/api/ai/business-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: activeStore?.name || userProfile?.displayName || 'Seller Studio',
          productCount: sellerProducts.length,
          lowStockCount: lowStockProducts.length,
          totalOrders: sellerOrders.length,
          revenueCents: grossRevenueCents,
          topCategories: Array.from(new Set(sellerProducts.map((p) => p.category))),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate insights.');
      setInsightsData(data.result);
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : 'Insights unavailable.');
    } finally {
      setInsightsBusy(false);
    }
  };

  const handleAskAiSellerAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiChatQuestion.trim()) return;
    setAiChatBusy(true);
    setAiChatError(null);
    try {
      const res = await fetch('/api/ai/seller-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: activeStore?.name || userProfile?.displayName || 'Seller Studio',
          question: aiChatQuestion.trim(),
          contextSummary: `Live SKUs: ${sellerProducts.length}, Low stock: ${lowStockProducts.length}, Orders: ${sellerOrders.length}, Gross GMV paise: ${grossRevenueCents}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Assistant unavailable.');
      setAiChatAnswer(data.answer || 'No recommendation returned.');
    } catch (err) {
      setAiChatError(err instanceof Error ? err.message : 'AI Seller Assistant failed.');
    } finally {
      setAiChatBusy(false);
    }
  };

  const handleGenerateAiProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiProdBusy(true);
    setAiProdError(null);
    setAiPublishMsg(null);
    try {
      const costCents = Math.round(parseFloat(aiProdInput.costInr || '550') * 100);
      const res = await fetch('/api/ai/product-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIdea: aiProdInput.productIdea,
          category: aiProdInput.category,
          targetAudience: aiProdInput.targetAudience,
          costCents,
          tone: aiProdInput.tone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI generation failed.');
      setAiProdOutput(data.result);
    } catch (err) {
      setAiProdError(err instanceof Error ? err.message : 'AI Product Studio error.');
    } finally {
      setAiProdBusy(false);
    }
  };

  const handleLoadAiIntoProductForm = () => {
    if (!aiProdOutput) return;
    setProdForm({
      ...DEFAULT_PRODUCT_FORM(activeStore, aiProdOutput.categorySuggestion || aiProdInput.category),
      title: aiProdOutput.title,
      sku: aiProdOutput.skuSuggestion,
      category: aiProdOutput.categorySuggestion || aiProdInput.category,
      subcategory: aiProdOutput.subcategorySuggestion || '',
      description: `${aiProdOutput.description}\n\n${aiProdOutput.marketingCopy}`,
      bulletsText: aiProdOutput.bulletPoints.join('\n'),
      tagsText: (aiProdOutput.tags ?? []).join(', '),
      seoText: (aiProdOutput.seoKeywords ?? []).join(', '),
      priceInr: (aiProdOutput.suggestedPriceCents / 100).toFixed(2),
      originalPriceInr: ((aiProdOutput.suggestedMrpCents || aiProdOutput.suggestedPriceCents) / 100).toFixed(2),
      costInr: aiProdInput.costInr || '550',
    });
    setProdImagePreviews([]);
    setSellerSection('add-product');
  };

  const handleSaveAiProduct = async (mode: 'draft' | 'pending') => {
    if (!aiProdOutput || !activeStore || !uid) return;
    const costCents = Math.max(100, Math.round(parseFloat(aiProdInput.costInr || '550') * 100));
    const mrp = Math.max(aiProdOutput.suggestedPriceCents, aiProdOutput.suggestedMrpCents || 0);
    const discountPct =
      mrp > aiProdOutput.suggestedPriceCents
        ? Math.round(((mrp - aiProdOutput.suggestedPriceCents) / mrp) * 100)
        : 0;
    const productId = sanitizeId(`prod-${Date.now().toString(36)}`);
    await saveProduct(
      {
        id: productId,
        storeId: activeStore.id,
        storeName: activeStore.name,
        sellerId: uid,
        title: aiProdOutput.title,
        sku: aiProdOutput.skuSuggestion,
        category: aiProdOutput.categorySuggestion || aiProdInput.category,
        subcategory: aiProdOutput.subcategorySuggestion || '',
        description: `${aiProdOutput.description}\n\n${aiProdOutput.marketingCopy}`,
        bulletPoints: aiProdOutput.bulletPoints,
        seoKeywords: aiProdOutput.seoKeywords,
        tags: aiProdOutput.tags,
        priceCents: aiProdOutput.suggestedPriceCents,
        originalPriceCents: mrp,
        discountPct,
        costCents,
        stock: 25,
        reorderPoint: 8,
        published: false,
        moderationStatus: mode,
        visualVariant:
          aiProdInput.category.includes('Audio')
            ? 'audio'
            : aiProdInput.category.includes('Beauty')
            ? 'serum'
            : aiProdInput.category.includes('Watch')
            ? 'watch'
            : 'vessel',
      },
      true
    );
    setAiPublishMsg(
      mode === 'pending'
        ? `Submitted "${aiProdOutput.title}" for Admin approval.`
        : `Saved "${aiProdOutput.title}" as Draft in Manage Products.`
    );
  };

  const handleGenerateAiMarketing = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiMktBusy(true);
    setAiMktError(null);
    try {
      const res = await fetch('/api/ai/marketing-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: aiMktInput.productName,
          storeName: activeStore?.name || 'Indian Brand Studio',
          valueProposition: aiMktInput.valueProposition,
          channel: aiMktInput.channel,
          objective: aiMktInput.objective,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Marketing Studio failed.');
      setAiMktOutput(data.result);
    } catch (err) {
      setAiMktError(err instanceof Error ? err.message : 'Marketing generation failed.');
    } finally {
      setAiMktBusy(false);
    }
  };

  const handleUploadAsset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      await uploadAssetFile({ ownerId: uid, storeId: activeStore?.id, file });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadBusy(false);
      e.target.value = '';
    }
  };

  const handleCopy = (label: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1600);
  };

  // INR Profit Calculator calculations
  const gstExclusivePrice = calcState.retailPriceInr / (1 + calcState.gstPct / 100);
  const gstAmountInr = calcState.retailPriceInr - gstExclusivePrice;
  const gatewayFeeInr = calcState.retailPriceInr * (calcState.gatewayPct / 100);
  const commissionFeeInr = calcState.retailPriceInr * (calcState.commissionPct / 100);
  const returnReserveInr = calcState.retailPriceInr * (calcState.returnPct / 100);
  const totalUnitCostInr =
    calcState.landedCogsInr +
    calcState.shippingCostInr +
    calcState.packagingCostInr +
    calcState.adSpendCpaInr +
    gstAmountInr +
    gatewayFeeInr +
    commissionFeeInr +
    returnReserveInr;
  const netProfitPerUnitInr = calcState.retailPriceInr - totalUnitCostInr;
  const netMarginPct =
    calcState.retailPriceInr > 0 ? (netProfitPerUnitInr / calcState.retailPriceInr) * 100 : 0;
  const contributionBeforeAds =
    calcState.retailPriceInr -
    (calcState.landedCogsInr +
      calcState.shippingCostInr +
      calcState.packagingCostInr +
      gstAmountInr +
      gatewayFeeInr +
      commissionFeeInr +
      returnReserveInr);
  const breakEvenRoas =
    contributionBeforeAds > 0 ? calcState.retailPriceInr / contributionBeforeAds : 0;

  if (!userProfile) return null;

  const selectedCategoryObj = categories.find((c) => c.name === prodForm.category);

  return (
    <div className="min-h-screen flex bg-[#F8F9FA] text-slate-900">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between">
        <div>
          <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200">
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
            <p className="px-3 text-xs font-medium text-slate-400 mb-2">Seller Studio</p>
            <nav className="space-y-0.5 max-h-[65vh] overflow-y-auto pr-1">
              {navItems.map(({ key, label, icon: Icon }) => {
                const isActive =
                  sellerSection === key ||
                  (key === 'store-settings' && sellerSection === 'store-builder');
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (key === 'add-product' && !prodForm.id) {
                        startNewProductForm();
                      } else {
                        setSellerSection(key);
                      }
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap truncate">{label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-5 pt-4 border-t border-slate-100 space-y-1">
              <p className="px-3 text-xs font-medium text-slate-400 mb-1.5">Navigation & Portals</p>
              <button
                type="button"
                onClick={() => navigateToPublic('home')}
                className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
              >
                <Home className="w-3.5 h-3.5 shrink-0" />
                <span>{t('nav.home')}</span>
              </button>
              <button
                type="button"
                onClick={() => navigateToMarketplace('stores')}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                {t('nav.marketplace')}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setPortal('admin')}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                >
                  Admin Dashboard
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">
              {activeStore?.name || userProfile.displayName}
            </p>
            <p className="text-[11px] text-slate-500 capitalize">
              {sellerAccount?.plan || 'starter'} · {sellerAccount?.status || 'pending'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
            title={t('nav.signOut')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
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
              className="lg:hidden inline-flex items-center gap-2 font-display text-sm font-bold tracking-tight text-slate-900 hover:text-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="w-6 h-6 rounded-md bg-blue-700 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <span>SellerFlow AI</span>
            </button>

            <div className="hidden lg:flex items-center gap-2 min-w-0">
              <span className="text-slate-400">{t('sell.portal')}</span>
              <span className="text-slate-300">/</span>
              <span className="font-display font-semibold text-slate-900 truncate">
                {navItems.find((n) => n.key === sellerSection)?.label || 'Workspace'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:block">
              <LocaleControls compact />
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifDrawer((v) => !v)}
                className="relative p-2 text-slate-600 hover:text-blue-700 hover:bg-slate-50 rounded-lg cursor-pointer"
                aria-label="Seller notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-700 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>

              {showNotifDrawer && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">
                      Notifications ({notifications.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNotifDrawer(false)}
                      className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500 text-center">No notifications yet.</p>
                    ) : (
                      notifications.slice(0, 12).map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => !notif.read && void markNotificationRead(notif.id)}
                          className={`p-3 text-xs cursor-pointer hover:bg-slate-50 ${
                            notif.read ? 'opacity-70' : 'bg-blue-50/40'
                          }`}
                        >
                          <p className="font-semibold text-slate-900">{notif.title}</p>
                          <p className="text-slate-600 mt-0.5">{notif.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigateToPublic('home')}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-blue-700 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              {t('nav.home')}
            </button>
            <button
              type="button"
              onClick={() => navigateToPublic('home')}
              className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('nav.viewPublicWebsite')}
            </button>
            {!activeStore && (
              <button
                type="button"
                onClick={() =>
                  void ensureSellerWorkspace(
                    uid,
                    userProfile.email,
                    `${userProfile.displayName} Studio`
                  )
                }
                className="px-3 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                Initialize Storefront
              </button>
            )}
            <button
              type="button"
              onClick={startNewProductForm}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('sell.addProduct')}</span>
            </button>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-3 shadow-sm">
            <LocaleControls fullWidth />
            <div className="flex flex-wrap gap-2">
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
        )}

        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {navItems.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSellerSection(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                sellerSection === key ? 'bg-blue-700 text-white' : 'text-slate-600 bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
          {/* Seller Verification Banner */}
          {sellerAccount && sellerAccount.status !== 'approved' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  Seller Verification Status: <span className="uppercase">{sellerAccount.status}</span>
                </p>
                <p className="mt-0.5">
                  {sellerAccount.status === 'pending'
                    ? 'Your merchant account is awaiting Admin verification. You can build your storefront, upload draft SKUs, and submit products for approval right now.'
                    : sellerAccount.rejectionReason || 'Contact platform administration for verification updates.'}
                </p>
              </div>
            </div>
          )}

          {/* 1. DASHBOARD OVERVIEW */}
          {sellerSection === 'overview' && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    {activeStore?.name || 'Seller Business Overview'}
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeStore?.location || 'India'} · Commission Rate{' '}
                    {((sellerAccount?.commissionRate ?? 0.05) * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={startNewProductForm}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('sell.addProduct')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSellerSection('ai-product-studio')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {t('sell.aiProduct')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Gross Store Revenue"
                  value={formatPrice(grossRevenueCents)}
                  sub={`${sellerOrders.length} total orders`}
                />
                <StatCard
                  label="Withdrawable Earnings"
                  value={formatPrice(withdrawableBalanceCents)}
                  sub={`Net after ${formatPrice(totalCommissionCents)} fees`}
                />
                <StatCard
                  label="Catalog SKUs"
                  value={`${sellerProducts.filter((p) => p.published).length} Live / ${sellerProducts.length}`}
                  sub={`Inventory cost ${formatPrice(inventoryValueCents)}`}
                />
                <StatCard
                  label="Low Stock Alerts"
                  value={String(lowStockProducts.length)}
                  sub={lowStockProducts.length > 0 ? 'Requires restock review' : 'All SKUs healthy'}
                  alert={lowStockProducts.length > 0}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        AI Business & Operations Advisor
                      </h2>
                      <p className="text-xs text-slate-500">
                        Evaluates your live store metrics, inventory, and orders via Gemini.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={insightsBusy}
                      onClick={() => void handleRunInsights()}
                      className="px-3.5 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {insightsBusy ? 'Analyzing...' : 'Run AI Analysis'}
                    </button>
                  </div>

                  {insightsError && (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                      {insightsError}
                    </p>
                  )}

                  {insightsData ? (
                    <div className="space-y-4 text-sm">
                      <p className="text-slate-700 leading-relaxed">{insightsData.executiveSummary}</p>
                      <div className="pt-3 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-900 mb-2">Priority Actions</p>
                        <ul className="space-y-1.5 text-xs text-slate-700">
                          {insightsData.priorityActions.map((a) => (
                            <li key={a}>· {a}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-xs">
                        <div>
                          <p className="font-semibold text-slate-900 mb-1">Pricing Opportunity</p>
                          <p className="text-slate-600">{insightsData.pricingOpportunity}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 mb-1">Inventory Guidance</p>
                          <p className="text-slate-600">{insightsData.inventoryAlertNote}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 py-3">
                      Click “Run AI Analysis” to receive pricing, restock, and catalog recommendations
                      grounded in your live store metrics.
                    </p>
                  )}

                  <form
                    onSubmit={(e) => void handleAskAiSellerAssistant(e)}
                    className="pt-4 border-t border-slate-100 space-y-2.5"
                  >
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-700" />
                      Ask AI Store Operations Copilot
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={aiChatQuestion}
                        onChange={(e) => setAiChatQuestion(e.target.value)}
                        placeholder="Ask about pricing, GST slabs, Shiprocket dispatch, or festival bundles..."
                        className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                      />
                      <button
                        type="submit"
                        disabled={aiChatBusy || !aiChatQuestion.trim()}
                        className="px-3.5 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                      >
                        {aiChatBusy ? 'Thinking...' : 'Ask'}
                      </button>
                    </div>
                    {aiChatError && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                        {aiChatError}
                      </p>
                    )}
                    {aiChatAnswer && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                        {aiChatAnswer}
                      </div>
                    )}
                  </form>
                </div>

                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
                    Recent Store Orders
                  </h2>
                  {sellerOrders.length === 0 ? (
                    <p className="text-xs text-slate-500 py-8">
                      Orders placed by customers for your store will appear here.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {sellerOrders.slice(0, 5).map((ord) => (
                        <div key={ord.id} className="py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {ord.customerName}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500">
                              {ord.id.slice(-8)} · {ord.status.replace(/_/g, ' ')}
                            </p>
                          </div>
                          <span className="font-mono tabular-nums text-xs font-semibold text-slate-900">
                            {formatPrice(ord.totalCents)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 2. MY STORE */}
          {sellerSection === 'my-store' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">My Storefront</h1>
                  <p className="text-sm text-slate-600">
                    Live preview of how shoppers see your store on the SellerFlow AI marketplace.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSellerSection('store-settings')}
                    className="px-4 py-2 border border-slate-300 bg-white text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    Edit Store Settings
                  </button>
                  <button
                    type="button"
                    onClick={startNewProductForm}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add New Product
                  </button>
                </div>
              </div>

              {activeStore ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  {activeStore.bannerDataUrl && (
                    <img
                      src={activeStore.bannerDataUrl}
                      alt={activeStore.name}
                      className="w-full h-48 object-cover border-b border-slate-200"
                    />
                  )}
                  <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      {activeStore.logoDataUrl && (
                        <img
                          src={activeStore.logoDataUrl}
                          alt={activeStore.name}
                          className="w-16 h-16 rounded-xl object-cover border border-slate-200"
                        />
                      )}
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                          <span>/{activeStore.slug}</span>
                          <span>·</span>
                          <span>{activeStore.category}</span>
                          <span>·</span>
                          <span className="capitalize font-semibold text-blue-700">
                            {activeStore.status}
                          </span>
                        </div>
                        <h2 className="font-display text-xl font-bold text-slate-900">
                          {activeStore.name}
                        </h2>
                        <p className="text-sm text-slate-600 mt-1">{activeStore.description}</p>
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs text-slate-600">
                      <p>{sellerProducts.length} Total SKUs</p>
                      <p>{sellerProducts.filter((p) => p.published).length} Published</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                  <p className="text-sm text-slate-600 mb-3">Your storefront is not initialized yet.</p>
                  <button
                    type="button"
                    onClick={() =>
                      void ensureSellerWorkspace(uid, userProfile.email, `${userProfile.displayName} Studio`)
                    }
                    className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                  >
                    Create Storefront Now
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. FULL PRODUCT UPLOAD / EDIT SYSTEM */}
          {sellerSection === 'add-product' && (
            <div className="max-w-4xl space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    {prodForm.id ? t('prodForm.editTitle') : t('prodForm.title')}
                  </h1>
                  <p className="text-sm text-slate-600">
                    Upload persisted multi-image photos, set listing currency, shipping & GST, and
                    submit for marketplace publishing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSellerSection('products')}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  ← Back to Catalog
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                {/* Section 1: Basic Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.name')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={prodForm.title}
                      onChange={(e) => setProdForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder="e.g. Jaipur Handcrafted Brass & Terracotta Kettle"
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.description')} *
                    </label>
                    <textarea
                      rows={4}
                      value={prodForm.description}
                      onChange={(e) => setProdForm((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Describe craft materials, dimensions, usage, and care instructions..."
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.category')} *
                    </label>
                    <select
                      value={prodForm.category}
                      onChange={(e) => {
                        const nextCat = e.target.value;
                        const matched = categories.find((c) => c.name === nextCat);
                        setProdForm((p) => ({
                          ...p,
                          category: nextCat,
                          subcategory: '',
                          gstRatePct:
                            !p.id && matched ? String(matched.gstRatePct) : p.gstRatePct,
                        }));
                      }}
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name} (GST {c.gstRatePct}%)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.subcategory')}
                    </label>
                    {selectedCategoryObj && selectedCategoryObj.subcategories.length > 0 ? (
                      <select
                        value={prodForm.subcategory}
                        onChange={(e) => setProdForm((p) => ({ ...p, subcategory: e.target.value }))}
                        className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
                      >
                        <option value="">Select Subcategory</option>
                        {selectedCategoryObj.subcategories.map((sub) => (
                          <option key={sub} value={sub}>
                            {sub}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={prodForm.subcategory}
                        onChange={(e) => setProdForm((p) => ({ ...p, subcategory: e.target.value }))}
                        placeholder="e.g. Tableware"
                        className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.sku')} *
                    </label>
                    <input
                      type="text"
                      value={prodForm.sku}
                      onChange={(e) => setProdForm((p) => ({ ...p, sku: e.target.value.toUpperCase() }))}
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Fallback Studio Artwork Style
                    </label>
                    <select
                      value={prodForm.visualVariant}
                      onChange={(e) => setProdForm((p) => ({ ...p, visualVariant: e.target.value }))}
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="vessel">Ceramics / Vessel</option>
                      <option value="audio">Electronics / Audio</option>
                      <option value="serum">Beauty / Bottle</option>
                      <option value="watch">Horology / Watch</option>
                      <option value="lamp">Lighting / Lamp</option>
                    </select>
                  </div>
                </div>

                {/* Section 2: Multi-Image Upload (Gallery + Camera + Zoom) */}
                <div className="pt-4 border-t border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        {t('prodForm.images')}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Compressed automatically to WebP & saved permanently in Firestore /assets.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{prodImageUploading ? 'Uploading...' : t('prodForm.uploadGallery')}</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => void handleMultiProductImageUpload(e)}
                          className="hidden"
                        />
                      </label>
                      <label className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 bg-white text-slate-800 text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer">
                        <Camera className="w-3.5 h-3.5" />
                        <span>{t('prodForm.takeCamera')}</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => void handleMultiProductImageUpload(e)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {(prodForm.imageDataUrl || prodImagePreviews.length > 0) && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {prodImagePreviews.map((ast) => (
                        <div
                          key={ast.id}
                          className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 relative group"
                        >
                          <img src={ast.dataUrl} alt={ast.name} className="w-full h-24 object-cover" />
                          <button
                            type="button"
                            onClick={() => setPreviewImageUrl(ast.dataUrl)}
                            className="absolute top-1.5 right-1.5 p-1 bg-white/90 text-slate-700 rounded shadow-xs hover:text-blue-700 cursor-pointer"
                            aria-label="Zoom image preview"
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                          </button>
                          <div className="p-2 flex items-center justify-between text-[11px]">
                            <button
                              type="button"
                              onClick={() =>
                                setProdForm((p) => ({ ...p, imageDataUrl: ast.dataUrl }))
                              }
                              className={`font-medium cursor-pointer ${
                                prodForm.imageDataUrl === ast.dataUrl
                                  ? 'text-emerald-700'
                                  : 'text-blue-700 hover:underline'
                              }`}
                            >
                              {prodForm.imageDataUrl === ast.dataUrl ? 'Primary' : 'Set Primary'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setProdImagePreviews((prev) => prev.filter((x) => x.id !== ast.id));
                                setProdForm((p) => ({
                                  ...p,
                                  imageAssetIds: p.imageAssetIds.filter((id) => id !== ast.id),
                                  imageDataUrl:
                                    p.imageDataUrl === ast.dataUrl ? undefined : p.imageDataUrl,
                                }));
                              }}
                              className="text-red-600 cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 3: Pricing, Currency, Shipping, GST & Inventory */}
                <div className="pt-4 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.currency')}
                    </label>
                    <select
                      value={prodForm.currency}
                      onChange={(e) =>
                        setProdForm((p) => ({ ...p, currency: sanitizeCurrency(e.target.value) }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {ALL_CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {CURRENCY_META[code].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.sellingPrice')} ({CURRENCY_META[prodForm.currency].symbol}) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={prodForm.priceInr}
                      onChange={(e) => setProdForm((p) => ({ ...p, priceInr: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.originalPrice')} ({CURRENCY_META[prodForm.currency].symbol})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={prodForm.originalPriceInr}
                      onChange={(e) =>
                        setProdForm((p) => ({ ...p, originalPriceInr: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.costPrice')} ({CURRENCY_META[prodForm.currency].symbol})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={prodForm.costInr}
                      onChange={(e) => setProdForm((p) => ({ ...p, costInr: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.shippingCharge')} ({CURRENCY_META[prodForm.currency].symbol})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={prodForm.shippingChargeInr}
                      onChange={(e) =>
                        setProdForm((p) => ({ ...p, shippingChargeInr: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.gstPct')}
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="28"
                      value={prodForm.gstRatePct}
                      onChange={(e) => setProdForm((p) => ({ ...p, gstRatePct: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.stock')} *
                    </label>
                    <input
                      type="number"
                      value={prodForm.stock}
                      onChange={(e) => setProdForm((p) => ({ ...p, stock: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('prodForm.reorderPoint')}
                    </label>
                    <input
                      type="number"
                      value={prodForm.reorderPoint}
                      onChange={(e) => setProdForm((p) => ({ ...p, reorderPoint: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>

                {/* Section 4: Variants, Dimensions & Policies */}
                <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Sizes / Variants (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={prodForm.sizesText}
                      onChange={(e) => setProdForm((p) => ({ ...p, sizesText: e.target.value }))}
                      placeholder="S, M, L, XL or 250ml, 500ml"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Colors / Finishes (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={prodForm.colorsText}
                      onChange={(e) => setProdForm((p) => ({ ...p, colorsText: e.target.value }))}
                      placeholder="Terracotta, Matte Black, Brass"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Weight (grams)
                    </label>
                    <input
                      type="number"
                      value={prodForm.weightGrams}
                      onChange={(e) => setProdForm((p) => ({ ...p, weightGrams: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Product Dimensions (L x W x H cm)
                    </label>
                    <input
                      type="text"
                      value={prodForm.dimensions}
                      onChange={(e) => setProdForm((p) => ({ ...p, dimensions: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Shipping Information
                    </label>
                    <input
                      type="text"
                      value={prodForm.shippingInfo}
                      onChange={(e) => setProdForm((p) => ({ ...p, shippingInfo: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Return Policy
                    </label>
                    <input
                      type="text"
                      value={prodForm.returnPolicy}
                      onChange={(e) => setProdForm((p) => ({ ...p, returnPolicy: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Specification Bullets (1 per line)
                    </label>
                    <textarea
                      rows={3}
                      value={prodForm.bulletsText}
                      onChange={(e) => setProdForm((p) => ({ ...p, bulletsText: e.target.value }))}
                      placeholder="100% brass base&#10;Handcrafted in Jaipur"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Storefront Tags (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={prodForm.tagsText}
                        onChange={(e) => setProdForm((p) => ({ ...p, tagsText: e.target.value }))}
                        placeholder="Handmade, Festive, Bestseller"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        SEO Keywords (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={prodForm.seoText}
                        onChange={(e) => setProdForm((p) => ({ ...p, seoText: e.target.value }))}
                        placeholder="ceramic kettle india, jaipur stoneware"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {prodFeedback && (
                  <p className="text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    {prodFeedback}
                  </p>
                )}

                <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Current Status:{' '}
                    <span className="font-semibold capitalize text-slate-900">
                      {prodForm.moderationStatus}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={prodSaving}
                      onClick={() => void submitProductForm('draft')}
                      className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      {t('prodForm.saveDraft')}
                    </button>
                    <button
                      type="button"
                      disabled={prodSaving}
                      onClick={() => void submitProductForm('pending')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {t('prodForm.submitApproval')}
                    </button>
                    {(!platformSettings.requireProductApproval || isAdmin) && (
                      <button
                        type="button"
                        disabled={prodSaving}
                        onClick={() => void submitProductForm('published')}
                        className="px-4 py-2 bg-emerald-700 text-white text-xs font-medium rounded-lg hover:bg-emerald-800 cursor-pointer"
                      >
                        {t('prodForm.publishNow')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. MANAGE PRODUCTS */}
          {sellerSection === 'products' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Manage Products ({sellerProducts.length})
                  </h1>
                  <p className="text-sm text-slate-600">
                    Edit, restock, unpublish, or submit SKUs for marketplace approval.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startNewProductForm}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add New Product
                </button>
              </div>

              {prodFeedback && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg">
                  {prodFeedback}
                </div>
              )}

              {sellerProducts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                  <p className="text-sm font-semibold text-slate-900 mb-1">Your catalog is empty</p>
                  <p className="text-xs text-slate-500 mb-5">
                    Upload your first SKU or generate one with AI Product Studio.
                  </p>
                  <div className="flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={startNewProductForm}
                      className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                    >
                      Add New Product
                    </button>
                    <button
                      type="button"
                      onClick={() => setSellerSection('ai-product-studio')}
                      className="px-4 py-2 border border-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                    >
                      AI Product Studio
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Product</th>
                          <th className="py-3 px-4">SKU</th>
                          <th className="py-3 px-4 text-right">Price</th>
                          <th className="py-3 px-4 text-right">Stock</th>
                          <th className="py-3 px-4">Moderation</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {sellerProducts.map((p) => {
                          const mod = p.moderationStatus || (p.published ? 'published' : 'draft');
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/70">
                              <td className="py-3 px-4">
                                <p className="font-medium text-slate-900">{p.title}</p>
                                <p className="text-xs text-slate-500">{p.category}</p>
                              </td>
                              <td className="py-3 px-4 font-mono text-xs text-slate-500">{p.sku}</td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums">
                                {formatPrice(p.priceCents, sanitizeCurrency(p.currency))}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums">
                                {p.stock}
                              </td>
                              <td className="py-3 px-4 text-xs capitalize font-medium">
                                <span
                                  className={
                                    mod === 'published'
                                      ? 'text-emerald-700'
                                      : mod === 'pending'
                                      ? 'text-amber-700'
                                      : mod === 'rejected'
                                      ? 'text-red-700'
                                      : 'text-slate-500'
                                  }
                                >
                                  {mod}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right space-x-3 whitespace-nowrap text-xs">
                                <button
                                  type="button"
                                  onClick={() => startEditProductForm(p)}
                                  className="font-medium text-blue-700 hover:underline cursor-pointer"
                                >
                                  Edit
                                </button>
                                {p.published && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void saveProduct(
                                        { ...p, published: false, moderationStatus: 'draft' },
                                        false
                                      )
                                    }
                                    className="font-medium text-slate-600 hover:underline cursor-pointer"
                                  >
                                    Unpublish
                                  </button>
                                )}
                                {!p.published && mod === 'draft' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void saveProduct(
                                        { ...p, published: false, moderationStatus: 'pending' },
                                        false
                                      )
                                    }
                                    className="font-medium text-amber-700 hover:underline cursor-pointer"
                                  >
                                    Submit
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void deleteProductById(p.id)}
                                  className="font-medium text-red-600 hover:underline cursor-pointer"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. PRODUCT CATEGORIES */}
          {sellerSection === 'categories' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  Product Categories & GST Slabs
                </h1>
                <p className="text-sm text-slate-600">
                  Marketplace categories managed by Platform Governance with your SKU coverage.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categories.map((cat) => {
                  const count = sellerProducts.filter((p) => p.category === cat.name).length;
                  return (
                    <div key={cat.id} className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-display text-base font-semibold text-slate-900">
                          {cat.name}
                        </h3>
                        <span className="font-mono text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                          GST {cat.gstRatePct}%
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mb-3">
                        Subcategories: {cat.subcategories.join(', ') || 'General'}
                      </p>
                      <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                        <span className="text-slate-600">{count} SKUs in your store</span>
                        <button
                          type="button"
                          onClick={() => {
                            setProdForm({
                              ...DEFAULT_PRODUCT_FORM(activeStore, cat.name, cat.gstRatePct),
                              category: cat.name,
                            });
                            setSellerSection('add-product');
                          }}
                          className="text-blue-700 font-medium hover:underline cursor-pointer"
                        >
                          + Add SKU in {cat.name}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. INVENTORY MANAGEMENT */}
          {sellerSection === 'inventory' && (
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-6">
                Inventory & Stock Control
              </h1>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="py-3 px-4">SKU</th>
                        <th className="py-3 px-4">Product</th>
                        <th className="py-3 px-4 text-right">On Hand</th>
                        <th className="py-3 px-4 text-right">Reorder At</th>
                        <th className="py-3 px-4 text-right">Cost Value</th>
                        <th className="py-3 px-4">Health</th>
                        <th className="py-3 px-4 text-right">Quick Adjust</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {sellerProducts.map((p) => {
                        const statusLabel =
                          p.stock === 0
                            ? 'Out of Stock'
                            : p.stock <= p.reorderPoint
                            ? 'Low Stock'
                            : 'Healthy';
                        return (
                          <tr key={p.id}>
                            <td className="py-3 px-4 font-mono text-xs text-slate-500">{p.sku}</td>
                            <td className="py-3 px-4 font-medium text-slate-900">{p.title}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                              {p.stock}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                              {p.reorderPoint}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {formatPrice(p.stock * p.costCents, sanitizeCurrency(p.currency))}
                            </td>
                            <td className="py-3 px-4 text-xs font-medium">
                              <span
                                className={
                                  statusLabel === 'Healthy'
                                    ? 'text-emerald-700'
                                    : statusLabel === 'Low Stock'
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                                }
                              >
                                {statusLabel}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right space-x-2">
                              <button
                                type="button"
                                onClick={() => void adjustProductStock(p.id, p.stock + 10)}
                                className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                              >
                                +10
                              </button>
                              <button
                                type="button"
                                onClick={() => void adjustProductStock(p.id, Math.max(0, p.stock - 1))}
                                className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                              >
                                -1
                              </button>
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

          {/* 7. ORDER MANAGEMENT */}
          {sellerSection === 'orders' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  {t('sell.orders')} ({sellerOrders.length})
                </h1>
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
                  {[
                    'all',
                    'pending',
                    'confirmed',
                    'processing',
                    'shipped',
                    'out_for_delivery',
                    'delivered',
                    'cancelled',
                  ].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setOrderFilter(st)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize whitespace-nowrap cursor-pointer ${
                        orderFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      {st.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {sellerOrders.filter((o) => orderFilter === 'all' || o.status === orderFilter)
                  .length === 0 ? (
                  <p className="text-sm text-slate-500 p-10 text-center">
                    No orders in this fulfillment state.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Order / Invoice</th>
                          <th className="py-3 px-4">Customer</th>
                          <th className="py-3 px-4">Payment</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Total</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {sellerOrders
                          .filter((o) => orderFilter === 'all' || o.status === orderFilter)
                          .map((ord) => (
                            <React.Fragment key={ord.id}>
                              <tr>
                                <td className="py-3 px-4 font-mono text-xs">
                                  <p>{ord.invoiceNumber || ord.id.slice(-8)}</p>
                                  <p className="text-slate-400">{ord.trackingCode}</p>
                                </td>
                                <td className="py-3 px-4">
                                  <p className="font-medium text-slate-900">{ord.customerName}</p>
                                  <p className="text-xs text-slate-500">
                                    {ord.city ? `${ord.city}, ${ord.pinCode}` : ord.customerEmail}
                                  </p>
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-600">
                                  <p>{ord.paymentMethod}</p>
                                  <p className="capitalize text-slate-400">{ord.paymentStatus}</p>
                                </td>
                                <td className="py-3 px-4 text-xs font-medium capitalize text-blue-700">
                                  <p>{ord.status.replace(/_/g, ' ')}</p>
                                  {ord.notes && (
                                    <p className="text-[11px] text-slate-500 normal-case mt-0.5">
                                      {ord.notes}
                                    </p>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                                  {formatPrice(ord.totalCents)}
                                </td>
                                <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap text-xs">
                                  <button
                                    type="button"
                                    onClick={() => setInvoiceOrder(ord)}
                                    className="px-2.5 py-1 border border-slate-300 rounded-md text-slate-700 cursor-pointer"
                                  >
                                    GST Invoice
                                  </button>
                                  {(ord.status === 'pending' || ord.status === 'placed') && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => void advanceOrderStatus(ord, 'confirmed')}
                                        className="px-2.5 py-1 bg-slate-900 text-white rounded-md cursor-pointer"
                                      >
                                        {t('sell.acceptOrder')}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRejectingOrderId(
                                            rejectingOrderId === ord.id ? null : ord.id
                                          );
                                          setRejectReasonDraft('');
                                        }}
                                        className="px-2.5 py-1 border border-red-200 text-red-700 rounded-md hover:bg-red-50 cursor-pointer"
                                      >
                                        {t('sell.rejectOrder')}
                                      </button>
                                    </>
                                  )}
                                  {ord.status === 'confirmed' && (
                                    <button
                                      type="button"
                                      onClick={() => void advanceOrderStatus(ord, 'processing')}
                                      className="px-2.5 py-1 bg-slate-900 text-white rounded-md cursor-pointer"
                                    >
                                      Pack Order
                                    </button>
                                  )}
                                  {(ord.status === 'processing' || ord.status === 'packed') && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDispatchOrder(ord);
                                        setDispatchForm({
                                          courierName: COURIER_PARTNERS[0],
                                          awbCode: ord.trackingCode,
                                        });
                                        setSellerSection('shipping');
                                      }}
                                      className="px-2.5 py-1 bg-blue-700 text-white rounded-md cursor-pointer"
                                    >
                                      Dispatch
                                    </button>
                                  )}
                                  {ord.status === 'shipped' && (
                                    <button
                                      type="button"
                                      onClick={() => void advanceOrderStatus(ord, 'out_for_delivery')}
                                      className="px-2.5 py-1 bg-blue-700 text-white rounded-md cursor-pointer"
                                    >
                                      Out for Delivery
                                    </button>
                                  )}
                                  {ord.status === 'out_for_delivery' && (
                                    <button
                                      type="button"
                                      onClick={() => void advanceOrderStatus(ord, 'delivered')}
                                      className="px-2.5 py-1 bg-emerald-700 text-white rounded-md cursor-pointer"
                                    >
                                      Mark Delivered
                                    </button>
                                  )}
                                </td>
                              </tr>
                              {rejectingOrderId === ord.id && (
                                <tr className="bg-red-50/40">
                                  <td colSpan={6} className="px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      <input
                                        type="text"
                                        value={rejectReasonDraft}
                                        onChange={(e) => setRejectReasonDraft(e.target.value)}
                                        placeholder="Rejection reason for buyer notification..."
                                        className="w-72 px-3 py-1.5 text-xs border border-red-200 rounded-lg bg-white"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRejectingOrderId(null);
                                          setRejectReasonDraft('');
                                        }}
                                        className="px-3 py-1.5 text-xs text-slate-600 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleRejectOrderConfirm(ord)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                                      >
                                        <XCircle className="w-3.5 h-3.5" />
                                        Confirm Rejection
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 8. SHIPPING MANAGEMENT (Shiprocket + Manual Indian Courier) */}
          {sellerSection === 'shipping' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Shipping & Logistics Management
                  </h1>
                  <p className="text-sm text-slate-600">
                    Dispatch orders with Shiprocket API or assign Indian courier AWB numbers manually.
                  </p>
                </div>
                <div className="text-xs px-3 py-1.5 rounded-lg border bg-white border-slate-200">
                  Shiprocket API:{' '}
                  <strong
                    className={
                      integrationsStatus.shiprocketConfigured ? 'text-emerald-700' : 'text-amber-700'
                    }
                  >
                    {integrationsStatus.shiprocketConfigured
                      ? 'Configured'
                      : 'Credentials Missing (Manual Dispatch Ready)'}
                  </strong>
                </div>
              </div>

              {shippingMsg && (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                  {shippingMsg}
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="py-3 px-4">Order</th>
                        <th className="py-3 px-4">Destination PIN</th>
                        <th className="py-3 px-4">Courier & AWB</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Dispatch Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {sellerOrders.map((ord) => (
                        <tr key={ord.id}>
                          <td className="py-3 px-4 font-mono text-xs">{ord.id.slice(-8)}</td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {ord.city || 'India'} {ord.pinCode ? `(${ord.pinCode})` : ''}
                          </td>
                          <td className="py-3 px-4 text-xs font-mono">
                            {ord.courierName || 'Unassigned'} · {ord.awbCode || ord.trackingCode}
                          </td>
                          <td className="py-3 px-4 text-xs capitalize font-medium text-blue-700">
                            {ord.status.replace(/_/g, ' ')}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap text-xs">
                            {ord.status !== 'delivered' && ord.status !== 'cancelled' && (
                              <>
                                <button
                                  type="button"
                                  disabled={shippingBusyId === ord.id}
                                  onClick={() => void handleBookShiprocket(ord)}
                                  className="px-2.5 py-1 bg-slate-900 text-white rounded-md cursor-pointer"
                                >
                                  {shippingBusyId === ord.id ? 'Booking...' : 'Book via Shiprocket'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDispatchOrder(ord);
                                    setDispatchForm({
                                      courierName: ord.courierName || COURIER_PARTNERS[0],
                                      awbCode: ord.awbCode || ord.trackingCode,
                                    });
                                  }}
                                  className="px-2.5 py-1 border border-slate-300 rounded-md text-slate-700 cursor-pointer"
                                >
                                  Manual Courier
                                </button>
                                {ord.shiprocketOrderId && (
                                  <button
                                    type="button"
                                    disabled={cancelShipBusyId === ord.id}
                                    onClick={() => void handleCancelShiprocket(ord)}
                                    className="px-2.5 py-1 border border-red-200 text-red-700 rounded-md hover:bg-red-50 cursor-pointer"
                                  >
                                    {cancelShipBusyId === ord.id
                                      ? 'Cancelling...'
                                      : 'Cancel Shiprocket'}
                                  </button>
                                )}
                              </>
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

          {/* 9. CUSTOMER CRM */}
          {sellerSection === 'crm' && (
            <div>
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Customer Management ({crmCustomers.length})
                  </h1>
                  <p className="text-sm text-slate-600">
                    Automatically updated on marketplace checkouts, or add wholesale buyers manually.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCrmForm({ name: '', email: '', segment: 'new', notes: '' });
                    setShowCrmModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Customer
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {crmCustomers.length === 0 ? (
                  <p className="text-sm text-slate-500 p-10 text-center">No customer CRM records yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Customer</th>
                          <th className="py-3 px-4">Segment</th>
                          <th className="py-3 px-4 text-right">Orders</th>
                          <th className="py-3 px-4 text-right">Lifetime Spend</th>
                          <th className="py-3 px-4 text-right">Edit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {crmCustomers.map((c) => (
                          <tr key={c.id}>
                            <td className="py-3 px-4">
                              <p className="font-medium text-slate-900">{c.name}</p>
                              <p className="text-xs text-slate-500">{c.email}</p>
                            </td>
                            <td className="py-3 px-4 text-xs uppercase font-mono text-blue-700">
                              {c.segment}
                            </td>
                            <td className="py-3 px-4 text-right font-mono">{c.totalOrders}</td>
                            <td className="py-3 px-4 text-right font-mono font-semibold">
                              {formatPrice(c.lifetimeSpendCents)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setCrmForm({
                                    id: c.id,
                                    name: c.name,
                                    email: c.email,
                                    segment: c.segment,
                                    notes: c.notes || '',
                                  });
                                  setShowCrmModal(true);
                                }}
                                className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                              >
                                Edit
                              </button>
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

          {/* 10. SALES ANALYTICS */}
          {sellerSection === 'analytics' && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold text-slate-900">Sales Analytics</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Average Order Value"
                  value={formatPrice(
                    sellerOrders.length > 0 ? Math.round(grossRevenueCents / sellerOrders.length) : 0
                  )}
                  sub="Across recorded orders"
                />
                <StatCard
                  label="Catalog Sellable Value"
                  value={formatPrice(sellerProducts.reduce((s, p) => s + p.stock * p.priceCents, 0))}
                  sub="At retail catalog value"
                />
                <StatCard
                  label="Fulfillment Rate"
                  value={`${
                    sellerOrders.length > 0
                      ? Math.round(
                          (sellerOrders.filter((o) => o.status === 'delivered').length /
                            sellerOrders.length) *
                            100
                        )
                      : 0
                  }%`}
                  sub="Delivered orders"
                />
                <StatCard
                  label="Repeat Buyers"
                  value={String(
                    crmCustomers.filter((c) => c.segment === 'repeat' || c.segment === 'vip').length
                  )}
                  sub="From customer CRM"
                />
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
                  Category Revenue & Margin Mix
                </h2>
                <div className="space-y-4">
                  {Array.from(new Set(sellerProducts.map((p) => p.category))).map((cat) => {
                    const catProds = sellerProducts.filter((p) => p.category === cat);
                    const totalUnits = catProds.reduce((s, p) => s + p.stock, 0);
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-800">{cat}</span>
                          <span className="font-mono text-slate-500">
                            {catProds.length} SKUs · {totalUnits} units on hand
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-700 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round((catProds.length / Math.max(1, sellerProducts.length)) * 100)
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 11. REVENUE AND EARNINGS */}
          {sellerSection === 'earnings' && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold text-slate-900">
                Revenue & Commission Earnings
              </h1>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Gross Order Volume" value={formatPrice(grossRevenueCents)} sub="Total buyer payments" />
                <StatCard label="Platform Commission" value={formatPrice(totalCommissionCents)} sub="Marketplace fee deducted" />
                <StatCard label="Net Seller Earnings" value={formatPrice(netEarningsCents)} sub="Credited toward payouts" />
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Order-Wise Payment & Commission Ledger ({sellerPayments.length})
                  </h2>
                </div>
                {sellerCommissions.length === 0 ? (
                  <p className="text-sm text-slate-500 p-8 text-center">No earnings recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                          <th className="py-3 px-4">Order</th>
                          <th className="py-3 px-4 text-right">Gross</th>
                          <th className="py-3 px-4 text-right">Fee Rate</th>
                          <th className="py-3 px-4 text-right">Commission</th>
                          <th className="py-3 px-4 text-right">Net Earning</th>
                          <th className="py-3 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sellerCommissions.map((c) => (
                          <tr key={c.id}>
                            <td className="py-3 px-4 font-mono text-xs">{c.orderId.slice(-8)}</td>
                            <td className="py-3 px-4 text-right font-mono">{formatPrice(c.grossAmountCents)}</td>
                            <td className="py-3 px-4 text-right font-mono text-xs">
                              {(c.commissionRate * 100).toFixed(1)}%
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-red-700">
                              -{formatPrice(c.commissionCents)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700">
                              {formatPrice(c.netSellerCents)}
                            </td>
                            <td className="py-3 px-4 text-xs capitalize">{c.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 12. PAYOUT MANAGEMENT */}
          {sellerSection === 'payouts' && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold text-slate-900">
                Payout Management (UPI / IMPS / NEFT)
              </h1>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setPayoutMsg(null);
                    const amountCents = Math.round(parseFloat(payoutForm.amountInr || '0') * 100);
                    if (amountCents < 100 || amountCents > withdrawableBalanceCents) {
                      setPayoutMsg(
                        `Enter an amount between ₹1 and ${formatPrice(withdrawableBalanceCents)}.`
                      );
                      return;
                    }
                    void requestSellerPayout({
                      sellerId: uid,
                      storeName: activeStore?.name || sellerAccount?.businessName || 'Seller',
                      amountCents,
                      method: payoutForm.method,
                      payoutAccount:
                        payoutForm.payoutAccount.trim() ||
                        sellerAccount?.upiId ||
                        'Pending UPI/Bank',
                      notes: payoutForm.notes.trim(),
                    }).then(() => {
                      setPayoutMsg('Payout request submitted to Admin Settlement queue.');
                      setPayoutForm((p) => ({ ...p, amountInr: '', notes: '' }));
                    });
                  }}
                  className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                >
                  <div>
                    <p className="text-xs text-slate-500">Available Withdrawable Balance</p>
                    <p className="font-mono text-2xl font-bold text-emerald-700">
                      {formatPrice(withdrawableBalanceCents)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Withdrawal Amount (₹ INR)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={payoutForm.amountInr}
                      onChange={(e) => setPayoutForm((p) => ({ ...p, amountInr: e.target.value }))}
                      placeholder="1000"
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Transfer Rail
                    </label>
                    <select
                      value={payoutForm.method}
                      onChange={(e) =>
                        setPayoutForm((p) => ({
                          ...p,
                          method: e.target.value as PayoutRecord['method'],
                        }))
                      }
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="UPI">UPI Instant Payout</option>
                      <option value="IMPS / NEFT Bank Transfer">IMPS / NEFT Bank Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      UPI ID or Bank Account / IFSC
                    </label>
                    <input
                      type="text"
                      required
                      value={payoutForm.payoutAccount}
                      onChange={(e) =>
                        setPayoutForm((p) => ({ ...p, payoutAccount: e.target.value }))
                      }
                      placeholder="merchant@okicici or A/C + IFSC"
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  {payoutMsg && <p className="text-xs text-blue-700">{payoutMsg}</p>}
                  <button
                    type="submit"
                    disabled={withdrawableBalanceCents < 100}
                    className="w-full py-2.5 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                  >
                    Request Payout
                  </button>
                </form>

                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200">
                    <h2 className="font-display text-sm font-semibold text-slate-900">
                      Payout History ({sellerPayouts.length})
                    </h2>
                  </div>
                  {sellerPayouts.length === 0 ? (
                    <p className="text-sm text-slate-500 p-8 text-center">No payout requests yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 text-xs">
                      {sellerPayouts.map((pay) => (
                        <div key={pay.id} className="p-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {pay.method} · {pay.payoutAccount}
                            </p>
                            <p className="text-slate-500 font-mono">
                              {pay.bankRef ? `UTR: ${pay.bankRef}` : pay.id}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-bold text-slate-900">
                              {formatPrice(pay.amountCents)}
                            </p>
                            <p className="capitalize text-blue-700">{pay.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 13. AI PRODUCT STUDIO */}
          {sellerSection === 'ai-product-studio' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={(e) => void handleGenerateAiProduct(e)}
                className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit"
              >
                <div>
                  <p className="text-xs font-medium text-blue-700 mb-1">Gemini AI Merchandiser</p>
                  <h1 className="font-display text-xl font-bold text-slate-900">
                    AI Product Studio (INR)
                  </h1>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Product Idea / Materials *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={aiProdInput.productIdea}
                    onChange={(e) =>
                      setAiProdInput((p) => ({ ...p, productIdea: e.target.value }))
                    }
                    placeholder="e.g. Handwoven Kanchipuram cotton stole with natural indigo dye"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                    <select
                      value={aiProdInput.category}
                      onChange={(e) => setAiProdInput((p) => ({ ...p, category: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Landed Cost (₹ INR)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={aiProdInput.costInr}
                      onChange={(e) => setAiProdInput((p) => ({ ...p, costInr: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Target Audience
                  </label>
                  <input
                    type="text"
                    value={aiProdInput.targetAudience}
                    onChange={(e) =>
                      setAiProdInput((p) => ({ ...p, targetAudience: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                {aiProdError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                    {aiProdError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={aiProdBusy}
                  className="w-full py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {aiProdBusy ? 'Generating INR Listing...' : 'Generate Product Listing'}
                </button>
              </form>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
                {!aiProdOutput ? (
                  <div className="py-16 text-center text-xs text-slate-500">
                    Describe your Indian product concept on the left to generate title, SEO
                    keywords, tags, category, marketing caption, and editable INR pricing.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-xs font-mono text-blue-700 mb-1">
                          {aiProdOutput.skuSuggestion} · {aiProdOutput.categorySuggestion} /{' '}
                          {aiProdOutput.subcategorySuggestion}
                        </p>
                        <input
                          type="text"
                          value={aiProdOutput.title}
                          onChange={(e) =>
                            setAiProdOutput((prev) =>
                              prev ? { ...prev, title: e.target.value } : prev
                            )
                          }
                          className="w-full font-display text-lg font-bold text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1"
                        />
                      </div>
                      <div className="text-right">
                        <label className="block text-[11px] text-slate-500">
                          Selling / MRP
                        </label>
                        <p className="font-mono text-lg font-bold text-slate-900">
                          {formatPrice(aiProdOutput.suggestedPriceCents)}
                        </p>
                        <p className="font-mono text-xs text-slate-400 line-through">
                          {formatPrice(aiProdOutput.suggestedMrpCents || aiProdOutput.suggestedPriceCents)}
                        </p>
                      </div>
                    </div>

                    <textarea
                      rows={4}
                      value={aiProdOutput.description}
                      onChange={(e) =>
                        setAiProdOutput((prev) =>
                          prev ? { ...prev, description: e.target.value } : prev
                        )
                      }
                      className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg p-3"
                    />

                    <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3 text-xs">
                      <p className="font-semibold text-blue-900 mb-1">Marketing Caption</p>
                      <p className="text-slate-700">{aiProdOutput.marketingCopy}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="font-semibold text-slate-900 mb-1">SEO Keywords</p>
                        <p className="font-mono text-slate-600">
                          {aiProdOutput.seoKeywords.join(', ')}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 mb-1">Tags</p>
                        <p className="font-mono text-slate-600">
                          {(aiProdOutput.tags ?? []).join(', ')}
                        </p>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 pt-2 border-t border-slate-100">
                      {aiProdOutput.marginAssessment}
                    </div>

                    {aiPublishMsg && (
                      <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        {aiPublishMsg}
                      </p>
                    )}

                    <div className="pt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleLoadAiIntoProductForm}
                        className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 cursor-pointer"
                      >
                        Edit & Add Photos in Product Form →
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveAiProduct('draft')}
                        className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg cursor-pointer"
                      >
                        Save Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveAiProduct('pending')}
                        className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                      >
                        Submit for Approval
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 14. AI MARKETING STUDIO */}
          {sellerSection === 'ai-marketing-studio' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={(e) => void handleGenerateAiMarketing(e)}
                className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit"
              >
                <div>
                  <p className="text-xs font-medium text-blue-700 mb-1">Gemini Campaign Builder</p>
                  <h1 className="font-display text-xl font-bold text-slate-900">
                    AI Marketing Studio
                  </h1>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Product Name</label>
                  <input
                    type="text"
                    required
                    value={aiMktInput.productName}
                    onChange={(e) => setAiMktInput((p) => ({ ...p, productName: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Value Proposition
                  </label>
                  <textarea
                    rows={3}
                    value={aiMktInput.valueProposition}
                    onChange={(e) =>
                      setAiMktInput((p) => ({ ...p, valueProposition: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                {aiMktError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                    {aiMktError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={aiMktBusy}
                  className="w-full py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {aiMktBusy ? 'Composing Campaign...' : 'Generate Campaign Kit'}
                </button>
              </form>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
                {!aiMktOutput ? (
                  <p className="text-xs text-slate-500 py-16 text-center">
                    Generate email, WhatsApp/social ad copy, and search headlines for any product.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      {aiMktOutput.campaignTitle}
                    </h2>
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex justify-between mb-1">
                        <p className="text-xs font-semibold text-slate-900">
                          Email: {aiMktOutput.emailSubject}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopy('email', aiMktOutput.emailBody)}
                          className="text-xs text-blue-700 inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedField === 'email' ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          Copy
                        </button>
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-line">
                        {aiMktOutput.emailBody}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-xs font-semibold text-slate-900 mb-1">Social / WhatsApp Ad</p>
                      <p className="text-xs text-slate-700">{aiMktOutput.socialAdCopy}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 15. PROFIT CALCULATOR (INR & GST) */}
          {sellerSection === 'profit-calculator' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h1 className="font-display text-xl font-bold text-slate-900">
                  India Profit & GST Calculator (₹ INR)
                </h1>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  {[
                    { key: 'retailPriceInr', label: 'Selling Price (₹)' },
                    { key: 'landedCogsInr', label: 'Landed COGS (₹)' },
                    { key: 'shippingCostInr', label: 'Courier Shipping (₹)' },
                    { key: 'packagingCostInr', label: 'Packaging (₹)' },
                    { key: 'adSpendCpaInr', label: 'Ad CPA (₹)' },
                    { key: 'gstPct', label: 'GST Rate (%)' },
                    { key: 'commissionPct', label: 'Platform Commission (%)' },
                    { key: 'gatewayPct', label: 'Razorpay Fee (%)' },
                    { key: 'returnPct', label: 'RTO / Return Reserve (%)' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block font-medium text-slate-700 mb-1">{label}</label>
                      <input
                        type="number"
                        step="0.5"
                        value={calcState[key as keyof typeof calcState]}
                        onChange={(e) =>
                          setCalcState((prev) => ({
                            ...prev,
                            [key]: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  INR Margin Breakdown
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500">Net Profit / Unit</p>
                    <p
                      className={`font-mono text-2xl font-bold ${
                        netProfitPerUnitInr >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      ₹{netProfitPerUnitInr.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500">Net Margin %</p>
                    <p className="font-mono text-2xl font-bold text-slate-900">
                      {netMarginPct.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-xs pt-3 border-t border-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-600">GST Included ({calcState.gstPct}%)</span>
                    <span className="font-mono">₹{gstAmountInr.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Platform Commission</span>
                    <span className="font-mono">₹{commissionFeeInr.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Razorpay Gateway Fee</span>
                    <span className="font-mono">₹{gatewayFeeInr.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Break-Even ROAS</span>
                    <span className="font-mono font-semibold">{breakEvenRoas.toFixed(2)}x</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 16. STORE SETTINGS / STORE BUILDER */}
          {(sellerSection === 'store-settings' || sellerSection === 'store-builder') && storeForm && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-4xl space-y-4">
              <h1 className="font-display text-2xl font-bold text-slate-900">
                Store Settings & Brand Builder
              </h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Store Name</label>
                  <input
                    type="text"
                    value={storeForm.name}
                    onChange={(e) =>
                      setStoreForm({
                        ...storeForm,
                        name: e.target.value,
                        slug: makeSlug(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={storeForm.category}
                    onChange={(e) => setStoreForm({ ...storeForm, category: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tagline</label>
                  <input
                    type="text"
                    value={storeForm.tagline}
                    onChange={(e) => setStoreForm({ ...storeForm, tagline: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={storeForm.description}
                    onChange={(e) => setStoreForm({ ...storeForm, description: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Return Policy
                  </label>
                  <input
                    type="text"
                    value={storeForm.returnPolicy || ''}
                    onChange={(e) => setStoreForm({ ...storeForm, returnPolicy: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Shipping Policy
                  </label>
                  <input
                    type="text"
                    value={storeForm.shippingPolicy || ''}
                    onChange={(e) => setStoreForm({ ...storeForm, shippingPolicy: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Layout Style
                  </label>
                  <select
                    value={storeForm.layoutStyle}
                    onChange={(e) =>
                      setStoreForm({
                        ...storeForm,
                        layoutStyle: e.target.value as Store['layoutStyle'],
                      })
                    }
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="editorial">Editorial</option>
                    <option value="minimal">Minimal</option>
                    <option value="grid">Grid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Contact Phone / Email
                  </label>
                  <input
                    type="text"
                    value={storeForm.contactPhone || ''}
                    onChange={(e) => setStoreForm({ ...storeForm, contactPhone: e.target.value })}
                    placeholder="9876543210"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              {storeSaveMsg && <p className="text-xs text-emerald-700">{storeSaveMsg}</p>}
              <button
                type="button"
                onClick={() =>
                  void saveStore(storeForm, false).then(() => {
                    setStoreSaveMsg('Storefront configuration saved.');
                    setTimeout(() => setStoreSaveMsg(null), 2500);
                  })
                }
                className="px-5 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer"
              >
                Save Store Settings
              </button>
            </div>
          )}

          {/* 17. PROFILE SETTINGS + KYC + SUBSCRIPTION + MEDIA VAULT */}
          {sellerSection === 'settings' && (
            <div className="space-y-8">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h1 className="font-display text-xl font-bold text-slate-900">
                  Seller Profile, Indian KYC & Bank / UPI Payout Settings
                </h1>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={profileForm.fullName}
                      onChange={(e) => setProfileForm((p) => ({ ...p, fullName: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Business Name</label>
                    <input
                      type="text"
                      value={profileForm.businessName}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, businessName: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Mobile (10-digit)</label>
                    <input
                      type="text"
                      value={profileForm.mobile}
                      onChange={(e) => setProfileForm((p) => ({ ...p, mobile: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">City</label>
                    <input
                      type="text"
                      value={profileForm.city}
                      onChange={(e) => setProfileForm((p) => ({ ...p, city: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">State</label>
                    <select
                      value={profileForm.state}
                      onChange={(e) => setProfileForm((p) => ({ ...p, state: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
                    >
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">PIN Code</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={profileForm.pinCode}
                      onChange={(e) => setProfileForm((p) => ({ ...p, pinCode: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">GSTIN</label>
                    <input
                      type="text"
                      maxLength={15}
                      value={profileForm.gstin}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">PAN Number</label>
                    <input
                      type="text"
                      maxLength={10}
                      value={profileForm.panNumber}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, panNumber: e.target.value.toUpperCase() }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">UPI ID</label>
                    <input
                      type="text"
                      value={profileForm.upiId}
                      onChange={(e) => setProfileForm((p) => ({ ...p, upiId: e.target.value }))}
                      placeholder="brand@okaxis"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Bank Account Holder
                    </label>
                    <input
                      type="text"
                      value={profileForm.bankAccountName}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, bankAccountName: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Account Number</label>
                    <input
                      type="text"
                      value={profileForm.bankAccountNumber}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, bankAccountNumber: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">IFSC Code</label>
                    <input
                      type="text"
                      value={profileForm.ifscCode}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, ifscCode: e.target.value.toUpperCase() }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                    />
                  </div>
                </div>
                {profileMsg && <p className="text-xs text-emerald-700">{profileMsg}</p>}
                <button
                  type="button"
                  onClick={() =>
                    void updateSellerProfileAndPayout(uid, {
                      ...profileForm,
                      payoutAccount: profileForm.upiId || profileForm.bankAccountNumber,
                    }).then(() => {
                      setProfileMsg('Seller profile & KYC payout settings saved.');
                      setTimeout(() => setProfileMsg(null), 2500);
                    })
                  }
                  className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  Save Profile & KYC
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h2 className="font-display text-lg font-bold text-slate-900 mb-4">
                  Merchant Subscription Plan (INR)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {SUBSCRIPTION_PLANS.map((plan) => {
                    const price =
                      plan.id === 'starter'
                        ? platformSettings.starterPriceCents
                        : plan.id === 'growth'
                        ? platformSettings.growthPriceCents
                        : platformSettings.proPriceCents;
                    const active = sellerAccount?.plan === plan.id;
                    return (
                      <div
                        key={plan.id}
                        className={`p-5 rounded-xl border ${
                          active ? 'border-2 border-blue-700 bg-blue-50/30' : 'border-slate-200'
                        }`}
                      >
                        <p className="font-display font-bold text-slate-900">{plan.name}</p>
                        <p className="font-mono text-xl font-bold text-slate-900 my-2">
                          {formatPrice(price)}
                          <span className="text-xs font-normal text-slate-500">/mo</span>
                        </p>
                        <button
                          type="button"
                          disabled={active}
                          onClick={() =>
                            void updateSellerSubscriptionPlan(
                              uid,
                              activeStore?.name || userProfile.displayName,
                              plan.id,
                              price,
                              plan.commissionRate
                            )
                          }
                          className={`w-full py-2 text-xs font-medium rounded-lg cursor-pointer ${
                            active
                              ? 'bg-slate-200 text-slate-600 cursor-default'
                              : 'bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                        >
                          {active ? 'Current Plan' : `Switch to ${plan.name}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Persisted File Storage & Media Vault ({assets.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Images compressed to WebP & stored in Firestore /assets.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadBusy ? 'Compressing...' : 'Upload Image'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleUploadAsset(e)}
                      className="hidden"
                    />
                  </label>
                </div>
                {uploadError && <p className="text-xs text-red-700 mb-3">{uploadError}</p>}
                {assets.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {assets.map((ast) => (
                      <div key={ast.id} className="border border-slate-200 rounded-lg overflow-hidden">
                        <img src={ast.dataUrl} alt={ast.name} className="w-full h-28 object-cover" />
                        <div className="p-2 flex items-center justify-between text-xs">
                          <span className="truncate text-slate-600">{ast.name}</span>
                          <button
                            type="button"
                            onClick={() => void deleteAssetFile(ast.id)}
                            className="text-red-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Manual Dispatch Modal */}
      {dispatchOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleManualDispatchSubmit(e)}
            className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-slate-900">
              Manual Courier Dispatch ({dispatchOrder.id.slice(-8)})
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Indian Courier Partner
              </label>
              <select
                value={dispatchForm.courierName}
                onChange={(e) =>
                  setDispatchForm((p) => ({ ...p, courierName: e.target.value }))
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {COURIER_PARTNERS.map((cp) => (
                  <option key={cp} value={cp}>
                    {cp}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                AWB / Tracking Code
              </label>
              <input
                type="text"
                required
                value={dispatchForm.awbCode}
                onChange={(e) => setDispatchForm((p) => ({ ...p, awbCode: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDispatchOrder(null)}
                className="px-4 py-2 text-xs text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Mark Shipped
              </button>
            </div>
          </form>
        </div>
      )}

      {/* GST Invoice Modal */}
      {invoiceOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <p className="text-xs text-blue-700 font-semibold">GST TAX INVOICE</p>
                <h2 className="font-display text-lg font-bold">
                  {invoiceOrder.invoiceNumber || invoiceOrder.id}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceOrder(null)}
                className="text-xs text-slate-500 cursor-pointer"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-3">
              Customer: {invoiceOrder.customerName} ({invoiceOrder.customerMobile || invoiceOrder.customerEmail})
            </p>
            {(() => {
              const breakup = computeGstBreakup(
                invoiceOrder.subtotalCents,
                invoiceOrder.gstRatePct ?? 18
              );
              return (
                <div className="space-y-1.5 text-xs border-t border-slate-200 pt-3">
                  <div className="flex justify-between">
                    <span>Taxable Subtotal</span>
                    <span className="font-mono">{formatPrice(breakup.taxableValuePaise)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>CGST + SGST</span>
                    <span className="font-mono">{formatPrice(breakup.totalTaxPaise)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span className="font-mono">{formatPrice(invoiceOrder.shippingCents)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm pt-2 border-t border-slate-200">
                    <span>Invoice Total</span>
                    <span className="font-mono">{formatPrice(invoiceOrder.totalCents)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Uploaded Product Image Zoom Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            className="bg-white rounded-xl max-w-2xl w-full p-3 border border-slate-200 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-3 right-3 p-1.5 bg-white/95 rounded-lg border border-slate-200 text-slate-700 hover:text-slate-900 cursor-pointer"
              aria-label="Close zoom preview"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewImageUrl}
              alt="Zoomed product preview"
              className="w-full max-h-[75vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {/* CRM Add/Edit Modal */}
      {showCrmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const id =
                crmForm.id ||
                sanitizeId(`crm-${uid.slice(0, 16)}-${Date.now().toString(36)}`);
              const existing = crmCustomers.find((c) => c.id === id);
              void saveCustomerCRM(
                {
                  id,
                  sellerId: uid,
                  name: crmForm.name,
                  email: crmForm.email,
                  segment: crmForm.segment,
                  totalOrders: existing?.totalOrders ?? 0,
                  lifetimeSpendCents: existing?.lifetimeSpendCents ?? 0,
                  notes: crmForm.notes,
                },
                !crmForm.id
              ).then(() => setShowCrmModal(false));
            }}
            className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-slate-900">Customer CRM Record</h2>
            <input
              type="text"
              required
              value={crmForm.name}
              onChange={(e) => setCrmForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Customer Name"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              type="email"
              required
              value={crmForm.email}
              onChange={(e) => setCrmForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="Customer Email"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <select
              value={crmForm.segment}
              onChange={(e) =>
                setCrmForm((p) => ({ ...p, segment: e.target.value as CustomerCRM['segment'] }))
              }
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="new">New</option>
              <option value="repeat">Repeat</option>
              <option value="vip">VIP</option>
              <option value="at_risk">At Risk</option>
            </select>
            <textarea
              rows={2}
              value={crmForm.notes}
              onChange={(e) => setCrmForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Notes..."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCrmModal(false)}
                className="px-4 py-2 text-xs text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Save Customer
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; sub: string; alert?: boolean }> = ({
  label,
  value,
  sub,
  alert,
}) => (
  <div className="bg-white border border-slate-200 rounded-xl p-5">
    <p className="text-xs text-slate-500 mb-1">{label}</p>
    <p
      className={`font-mono tabular-nums text-2xl font-bold ${
        alert ? 'text-amber-700' : 'text-slate-900'
      }`}
    >
      {value}
    </p>
    <p className="text-xs text-slate-500 mt-1">{sub}</p>
  </div>
);

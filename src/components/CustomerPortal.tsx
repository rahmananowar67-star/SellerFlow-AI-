import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  CreditCard,
  FileText,
  Heart,
  Home,
  LogOut,
  MapPin,
  Maximize2,
  Menu,
  Minus,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store as StoreIcon,
  Tag,
  Trash2,
  Truck,
  X,
  ZoomIn,
} from 'lucide-react';
import { getCartItemKey, useAuth } from '../context/AuthContext';
import { sanitizeCurrency } from '../lib/currency';
import {
  cancelCustomerOrder,
  executeCustomerCheckout,
  loadAssetsByIds,
  markNotificationRead,
  openOrderDispute,
  requestOrderRefund,
  saveCustomerAddressProfile,
  submitProductReview,
  subscribeCustomerDisputes,
  subscribeCustomerOrders,
  subscribeCustomerRefunds,
  subscribeProductReviews,
  validateCouponCode,
} from '../lib/firestoreService';
import {
  computeGstBreakup,
  INDIAN_STATES,
  isValidIndianMobile,
  isValidIndianPinCode,
  normalizeIndianMobile,
  ORDER_LIFECYCLE_STEPS,
} from '../lib/indiaData';
import {
  normalizeOrderStepIndex,
  type CouponRecord,
  type CustomerSection,
  type DisputeRecord,
  type Order,
  type Product,
  type RefundRecord,
  type ReviewRecord,
  type Store,
} from '../types/commerce';
import { LocaleControls } from './LocaleControls';
import { ProductVisual } from './ProductVisual';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

async function ensureRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (window.Razorpay) return true;
  return new Promise((resolve) => {
    const existing = document.querySelector('script[data-razorpay-checkout="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export const CustomerPortal: React.FC = () => {
  const {
    userProfile,
    isAdmin,
    isSeller,
    setPortal,
    navigateToPublic,
    customerSection,
    setCustomerSection,
    selectedStoreId,
    setSelectedStoreId,
    stores,
    products,
    categories: adminCategories,
    platformSettings,
    integrationsStatus,
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
    signOutUser,
    becomeSeller,
    updateLocalUserProfile,
    currency,
    fxRates,
    formatPrice,
    convertPrice,
    t,
  } = useAuth();

  const [storeCategory, setStoreCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState('All');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc'>('featured');

  // Product inspect modal state (multi-image + zoom + lightbox + variants + reviews)
  const [inspectProduct, setInspectProduct] = useState<Product | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [imageZoomed, setImageZoomed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [productReviews, setProductReviews] = useState<ReviewRecord[]>([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', comment: '' });
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  // Customer records
  const [orders, setOrders] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [trackingSearch, setTrackingSearch] = useState('');
  const [liveTrackBusy, setLiveTrackBusy] = useState(false);
  const [liveTrackResult, setLiveTrackResult] = useState<{
    status?: string;
    detail?: string;
    error?: string;
  } | null>(null);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Invoice, Refund & Dispute Modals
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [disputeOrder, setDisputeOrder] = useState<Order | null>(null);
  const [disputeForm, setDisputeForm] = useState({ subject: '', description: '' });
  const [orderActionMsg, setOrderActionMsg] = useState<string | null>(null);

  // Indian Checkout state
  const [shippingName, setShippingName] = useState(userProfile?.displayName || '');
  const [customerMobile, setCustomerMobile] = useState(userProfile?.phone || '');
  const [shippingAddress, setShippingAddress] = useState(userProfile?.shippingAddress || '');
  const [city, setCity] = useState(userProfile?.city || '');
  const [stateName, setStateName] = useState(userProfile?.state || 'Karnataka');
  const [pinCode, setPinCode] = useState(userProfile?.pinCode || '');
  const [addressSaveMsg, setAddressSaveMsg] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponRecord | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    'Razorpay (UPI / Card / NetBanking)' | 'Cash on Delivery'
  >('Cash on Delivery');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccessOrders, setCheckoutSuccessOrders] = useState<Order[] | null>(null);
  const [cartFeedback, setCartFeedback] = useState<string | null>(null);

  // Upgrade to seller inline modal
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeBizName, setUpgradeBizName] = useState('');

  useEffect(() => {
    if (userProfile?.displayName && !shippingName) {
      setShippingName(userProfile.displayName);
    }
    if (userProfile?.phone && !customerMobile) {
      setCustomerMobile(userProfile.phone);
    }
    if (userProfile?.shippingAddress && !shippingAddress) {
      setShippingAddress(userProfile.shippingAddress);
    }
    if (userProfile?.city && !city) setCity(userProfile.city);
    if (userProfile?.state) setStateName(userProfile.state);
    if (userProfile?.pinCode && !pinCode) setPinCode(userProfile.pinCode);
  }, [userProfile, shippingName, customerMobile, shippingAddress, city, pinCode]);

  useEffect(() => {
    if (integrationsStatus.razorpayConfigured) {
      setPaymentMethod('Razorpay (UPI / Card / NetBanking)');
    }
  }, [integrationsStatus.razorpayConfigured]);

  useEffect(() => {
    if (!userProfile?.uid) {
      setOrders([]);
      setRefunds([]);
      setDisputes([]);
      return;
    }
    const u1 = subscribeCustomerOrders(userProfile.uid, setOrders);
    const u2 = subscribeCustomerRefunds(userProfile.uid, setRefunds);
    const u3 = subscribeCustomerDisputes(userProfile.uid, setDisputes);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [userProfile?.uid]);

  // Load multi-image gallery & reviews when inspecting a product
  useEffect(() => {
    setImageZoomed(false);
    setLightboxOpen(false);
    if (!inspectProduct) {
      setGalleryUrls([]);
      setProductReviews([]);
      setActiveImageIdx(0);
      return;
    }
    setSelectedSize(inspectProduct.sizes?.[0] || '');
    setSelectedColor(inspectProduct.colors?.[0] || '');
    setReviewMsg(null);
    setActiveImageIdx(0);

    const baseUrls: string[] = [];
    if (inspectProduct.imageDataUrl) baseUrls.push(inspectProduct.imageDataUrl);
    setGalleryUrls(baseUrls);

    if (inspectProduct.imageAssetIds && inspectProduct.imageAssetIds.length > 0) {
      void loadAssetsByIds(inspectProduct.imageAssetIds).then((assets) => {
        const assetUrls = assets.map((a) => a.dataUrl).filter(Boolean);
        const merged = Array.from(new Set([...baseUrls, ...assetUrls]));
        if (merged.length > 0) setGalleryUrls(merged);
      });
    }

    const unsubRev = subscribeProductReviews(inspectProduct.id, setProductReviews);
    return () => unsubRev();
  }, [inspectProduct]);

  const activeStore: Store | null = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) ?? null,
    [stores, selectedStoreId]
  );

  const categories = useMemo(() => {
    const set = new Set<string>(['All']);
    adminCategories.filter((c) => c.active).forEach((c) => set.add(c.name));
    stores.forEach((s) => set.add(s.category));
    products.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [adminCategories, stores, products]);

  const filteredStores = useMemo(() => {
    return stores.filter((s) => storeCategory === 'All' || s.category === storeCategory);
  }, [stores, storeCategory]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      if (searchCategory !== 'All' && p.category !== searchCategory) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.storeName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.subcategory || '').toLowerCase().includes(q) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
        (p.seoKeywords ?? []).some((k) => k.toLowerCase().includes(q))
      );
    });
    if (sortBy === 'price-asc') return [...list].sort((a, b) => a.priceCents - b.priceCents);
    if (sortBy === 'price-desc') return [...list].sort((a, b) => b.priceCents - a.priceCents);
    return list;
  }, [products, searchQuery, searchCategory, sortBy]);

  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const freeThreshold = platformSettings.freeShippingThresholdCents ?? 99900;
  const baseShipping = platformSettings.defaultShippingCents ?? 7900;
  const gstPct = platformSettings.defaultGstPct ?? 18;

  const { cartSubtotalCents, cartShippingCents, cartTaxCents } = useMemo(() => {
    if (cart.length === 0) {
      return { cartSubtotalCents: 0, cartShippingCents: 0, cartTaxCents: 0 };
    }
    const grouped = new Map<string, typeof cart>();
    for (const item of cart) {
      const key = `${item.product.sellerId}__${item.product.storeId}`;
      const list = grouped.get(key) ?? [];
      list.push(item);
      grouped.set(key, list);
    }
    let subTotal = 0;
    let shipTotal = 0;
    let taxTotal = 0;
    for (const items of grouped.values()) {
      let groupSub = 0;
      let hasExplicitShip = false;
      let maxExplicitShip = 0;
      for (const i of items) {
        const itemCur = sanitizeCurrency(i.product.currency);
        const unitInr = convertPrice(i.product.priceCents, itemCur, 'INR');
        const lineInr = unitInr * i.quantity;
        groupSub += lineInr;
        const itemGst = i.product.gstRatePct ?? gstPct;
        taxTotal += Math.round(lineInr * (itemGst / 100));
        if (i.product.shippingFeeCents !== undefined) {
          hasExplicitShip = true;
          maxExplicitShip = Math.max(
            maxExplicitShip,
            convertPrice(i.product.shippingFeeCents, itemCur, 'INR')
          );
        }
      }
      subTotal += groupSub;
      shipTotal +=
        groupSub >= freeThreshold ? 0 : hasExplicitShip ? maxExplicitShip : baseShipping;
    }
    return { cartSubtotalCents: subTotal, cartShippingCents: shipTotal, cartTaxCents: taxTotal };
  }, [cart, convertPrice, freeThreshold, baseShipping, gstPct]);

  const effectiveDiscountCents = useMemo(() => {
    if (!appliedCoupon || cartSubtotalCents < appliedCoupon.minOrderCents) return 0;
    let disc =
      appliedCoupon.discountType === 'percent'
        ? Math.round(cartSubtotalCents * (appliedCoupon.discountValue / 100))
        : Math.round(appliedCoupon.discountValue * 100);
    if (appliedCoupon.maxDiscountCents > 0) {
      disc = Math.min(disc, appliedCoupon.maxDiscountCents);
    }
    return Math.max(0, Math.min(disc, cartSubtotalCents));
  }, [appliedCoupon, cartSubtotalCents]);

  const cartTotalCents =
    cartSubtotalCents === 0
      ? 0
      : Math.max(100, cartSubtotalCents - effectiveDiscountCents + cartShippingCents + cartTaxCents);

  const handleApplyCoupon = async () => {
    setCouponBusy(true);
    setCouponMsg(null);
    try {
      const res = await validateCouponCode(couponInput, cartSubtotalCents);
      if (res.valid && res.coupon) {
        setAppliedCoupon(res.coupon);
        setCouponMsg({ ok: true, text: res.message });
      } else {
        setAppliedCoupon(null);
        setCouponMsg({ ok: false, text: res.message });
      }
    } catch (err) {
      setCouponMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Unable to validate coupon.',
      });
    } finally {
      setCouponBusy(false);
    }
  };

  const handleSaveAddressProfile = async () => {
    if (!userProfile) return;
    setAddressSaveMsg(null);
    try {
      const payload = {
        displayName: shippingName.trim() || userProfile.displayName,
        phone: normalizeIndianMobile(customerMobile) || customerMobile.trim(),
        shippingAddress: shippingAddress.trim(),
        city: city.trim(),
        state: stateName,
        pinCode: pinCode.trim(),
      };
      await saveCustomerAddressProfile(userProfile.uid, payload);
      updateLocalUserProfile(payload);
      setAddressSaveMsg('Delivery address saved to your profile.');
      setTimeout(() => setAddressSaveMsg(null), 3000);
    } catch (err) {
      setAddressSaveMsg(err instanceof Error ? err.message : 'Failed to save address.');
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleAddToCart = (product: Product, size?: string, color?: string) => {
    addToCart(product, 1, size, color);
    setCartFeedback(`Added ${product.title} to cart`);
    setTimeout(() => setCartFeedback(null), 2400);
  };

  const handleWishlistToggle = async (product: Product) => {
    if (!userProfile) {
      setCartFeedback('Sign in to save items to your wishlist');
      setTimeout(() => setCartFeedback(null), 2500);
      return;
    }
    await toggleWishlist(product);
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !inspectProduct) return;
    if (reviewForm.comment.trim().length < 3) {
      setReviewMsg('Please write a brief review comment.');
      return;
    }
    setReviewBusy(true);
    setReviewMsg(null);
    try {
      const verifiedPurchase = orders.some((o) =>
        o.items.some((i) => i.productId === inspectProduct.id)
      );
      await submitProductReview({
        product: inspectProduct,
        customer: userProfile,
        rating: reviewForm.rating,
        title: reviewForm.title.trim() || 'Customer Review',
        comment: reviewForm.comment.trim(),
        verifiedPurchase,
      });
      setReviewForm({ rating: 5, title: '', comment: '' });
      setReviewMsg('Review submitted. Thank you!');
    } catch (err) {
      setReviewMsg(err instanceof Error ? err.message : 'Unable to save review.');
    } finally {
      setReviewBusy(false);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);

    if (!userProfile) {
      setCheckoutError('Please sign in to complete your verified checkout.');
      return;
    }
    if (cart.length === 0) {
      setCheckoutError('Your cart is empty.');
      return;
    }
    if (!isValidIndianMobile(customerMobile)) {
      setCheckoutError('Please enter a valid 10-digit Indian mobile number (starting with 6–9).');
      return;
    }
    if (shippingAddress.trim().length < 6 || !city.trim()) {
      setCheckoutError('Please enter your complete street address and city.');
      return;
    }
    if (!isValidIndianPinCode(pinCode)) {
      setCheckoutError('Please enter a valid 6-digit Indian PIN code.');
      return;
    }

    if (
      paymentMethod === 'Razorpay (UPI / Card / NetBanking)' &&
      !integrationsStatus.razorpayConfigured
    ) {
      setCheckoutError(
        'Razorpay online payments are currently unconfigured on this server (missing RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET). Please choose Cash on Delivery or ask the Admin to configure Razorpay keys.'
      );
      return;
    }

    setCheckoutBusy(true);
    try {
      const razorpayVerifier =
        paymentMethod === 'Razorpay (UPI / Card / NetBanking)'
          ? async ({ groupOrderId, totalCents }: { groupOrderId: string; totalCents: number }) => {
              const loaded = await ensureRazorpayScript();
              if (!loaded || !window.Razorpay) {
                throw new Error('Unable to load Razorpay Checkout SDK.');
              }
              const createRes = await fetch('/api/payments/razorpay/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: groupOrderId, amountCents: totalCents }),
              });
              const createData = await createRes.json();
              if (!createRes.ok || !createData.razorpayOrder?.id) {
                throw new Error(createData.error || 'Failed to initialize Razorpay order.');
              }

              return await new Promise<{
                razorpay_order_id: string;
                razorpay_payment_id: string;
                razorpay_signature: string;
              }>((resolve, reject) => {
                const RzpCtor = window.Razorpay!;
                const rzp = new RzpCtor({
                  key: createData.keyId,
                  amount: createData.razorpayOrder.amount,
                  currency: 'INR',
                  name: 'SellerFlow AI Marketplace',
                  description: `Order ${groupOrderId}`,
                  order_id: createData.razorpayOrder.id,
                  prefill: {
                    name: shippingName || userProfile.displayName,
                    email: userProfile.email,
                    contact: normalizeIndianMobile(customerMobile),
                  },
                  theme: { color: '#1D4ED8' },
                  handler: (resp: {
                    razorpay_order_id: string;
                    razorpay_payment_id: string;
                    razorpay_signature: string;
                  }) => resolve(resp),
                  modal: {
                    ondismiss: () => reject(new Error('Razorpay payment cancelled by user.')),
                  },
                });
                rzp.open();
              });
            }
          : undefined;

      const created = await executeCustomerCheckout({
        user: { ...userProfile, displayName: shippingName || userProfile.displayName },
        cart,
        shippingAddress: shippingAddress.trim(),
        customerMobile: normalizeIndianMobile(customerMobile),
        city: city.trim(),
        state: stateName,
        pinCode: pinCode.trim(),
        paymentMethod,
        gstRatePct: gstPct,
        freeShippingThresholdCents: freeThreshold,
        defaultShippingCents: baseShipping,
        displayCurrency: currency,
        fxRates,
        coupon: appliedCoupon,
        razorpayVerifier,
      });

      setCheckoutSuccessOrders(created);
      setAppliedCoupon(null);
      setCouponInput('');
      setCouponMsg(null);
      clearCart();
      setSelectedOrderId(created[0]?.id ?? null);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundOrder || refundReason.trim().length < 3) return;
    await requestOrderRefund({ order: refundOrder, reason: refundReason.trim() });
    setOrderActionMsg(`Refund request submitted for Order ${refundOrder.id.slice(-8)}.`);
    setRefundOrder(null);
    setRefundReason('');
  };

  const handleSubmitDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeOrder || disputeForm.subject.trim().length < 3 || disputeForm.description.trim().length < 5) {
      return;
    }
    await openOrderDispute({
      order: disputeOrder,
      subject: disputeForm.subject.trim(),
      description: disputeForm.description.trim(),
    });
    setOrderActionMsg(`Support dispute opened for Order ${disputeOrder.id.slice(-8)}.`);
    setDisputeOrder(null);
    setDisputeForm({ subject: '', description: '' });
  };

  const trackedOrder = useMemo(() => {
    if (trackingSearch.trim()) {
      const q = trackingSearch.trim().toLowerCase();
      return (
        orders.find(
          (o) =>
            o.id.toLowerCase().includes(q) ||
            o.trackingCode.toLowerCase().includes(q) ||
            (o.awbCode || '').toLowerCase().includes(q)
        ) ?? null
      );
    }
    if (selectedOrderId) {
      return orders.find((o) => o.id === selectedOrderId) ?? orders[0] ?? null;
    }
    return orders[0] ?? null;
  }, [orders, selectedOrderId, trackingSearch]);

  const checkLiveShiprocketTracking = async (awbCode: string) => {
    setLiveTrackBusy(true);
    setLiveTrackResult(null);
    try {
      const res = await fetch(`/api/shipping/shiprocket/track/${encodeURIComponent(awbCode)}`);
      const data = await res.json();
      if (!res.ok) {
        setLiveTrackResult({ error: data.error || 'Shiprocket live tracking unavailable.' });
      } else {
        const summary =
          data?.tracking?.tracking_data?.shipment_track?.[0]?.current_status ||
          'Tracking response received from Shiprocket.';
        setLiveTrackResult({ status: summary, detail: `AWB ${awbCode}` });
      }
    } catch (err) {
      setLiveTrackResult({
        error: err instanceof Error ? err.message : 'Unable to reach Shiprocket tracking service.',
      });
    } finally {
      setLiveTrackBusy(false);
    }
  };

  const navItems: {
    key: CustomerSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { key: 'stores', label: t('cust.stores'), icon: StoreIcon },
    { key: 'search', label: t('cust.search'), icon: Search },
    { key: 'wishlist', label: t('cust.wishlist'), icon: Heart, badge: wishlist.length > 0 ? wishlist.length : undefined },
    { key: 'cart', label: t('cust.cart'), icon: ShoppingBag, badge: cartCount > 0 ? cartCount : undefined },
    { key: 'checkout', label: t('cust.checkout'), icon: CreditCard },
    { key: 'orders', label: t('cust.orders'), icon: Package },
    { key: 'tracking', label: t('cust.tracking'), icon: Truck },
  ];

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
            <p className="px-3 text-xs font-medium text-slate-400 mb-2">Customer Marketplace</p>
            <nav className="space-y-1">
              {navItems.map(({ key, label, icon: Icon, badge }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedStoreId(null);
                    setCustomerSection(key);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                    customerSection === key
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">{label}</span>
                  </span>
                  {badge !== undefined && (
                    <span className="font-mono tabular-nums text-xs font-semibold text-blue-700">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            <div className="mt-8 pt-6 border-t border-slate-100">
              <p className="px-3 text-xs font-medium text-slate-400 mb-2">Website & Portals</p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => navigateToPublic('home')}
                  className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs font-medium text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
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
                {isSeller ? (
                  <button
                    type="button"
                    onClick={() => setPortal('seller')}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Seller Dashboard
                  </button>
                ) : userProfile ? (
                  <button
                    type="button"
                    onClick={() => setShowUpgradeModal(true)}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                  >
                    Open Your Own Store
                  </button>
                ) : null}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setPortal('admin')}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                  >
                    Admin Dashboard
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200">
          {userProfile ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {userProfile.displayName}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{userProfile.email}</p>
              </div>
              <button
                type="button"
                onClick={() => void signOutUser()}
                title="Sign Out"
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void signInWithGoogle('customer')}
              className="w-full py-2 px-3 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 cursor-pointer"
            >
              Sign In with Google
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-6">
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

            <div className="hidden lg:flex items-center gap-3 min-w-0">
              <span className="text-slate-400">Marketplace</span>
              <span className="text-slate-300">/</span>
              <span className="font-display font-semibold text-slate-900 truncate">
                {activeStore
                  ? activeStore.name
                  : navItems.find((n) => n.key === customerSection)?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden md:block">
              <LocaleControls compact />
            </div>
            <button
              type="button"
              onClick={() => navigateToPublic('home')}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-blue-700 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              {t('nav.home')}
            </button>
            {cartFeedback && (
              <span className="hidden md:inline text-xs font-medium text-emerald-700">
                {cartFeedback}
              </span>
            )}
            {userProfile && (
              <button
                type="button"
                onClick={() => setShowNotifDrawer((v) => !v)}
                className="relative p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="ml-1 font-mono text-[11px] font-semibold text-blue-700">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setCustomerSection('cart')}
              className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              {t('cust.cart')} ({cartCount})
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
                Home
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateToPublic('features');
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Features
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateToPublic('pricing');
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Pricing
              </button>
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
              {userProfile ? (
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs font-medium text-slate-700 rounded-lg cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void signInWithGoogle('customer');
                  }}
                  className="px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  Sign In with Google
                </button>
              )}
            </div>
          </div>
        )}

        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {navItems.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSelectedStoreId(null);
                setCustomerSection(key);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                customerSection === key
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-600 bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {showNotifDrawer && (
          <div className="bg-white border-b border-slate-200 px-6 py-4">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-900">Recent Notifications</h3>
                <button
                  type="button"
                  onClick={() => setShowNotifDrawer(false)}
                  className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  Close
                </button>
              </div>
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-500">No notifications yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.slice(0, 5).map((n) => (
                    <div key={n.id} className="py-2 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                        <p className="text-xs text-slate-600">{n.message}</p>
                      </div>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => void markNotificationRead(n.id)}
                          className="text-xs font-medium text-blue-700 hover:underline shrink-0 cursor-pointer"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
          {usingSampleFallback && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900 flex items-center justify-between gap-3">
              <span>
                Displaying <strong>Sample Catalog</strong> stores because no approved live merchant
                stores have been published yet.
              </span>
            </div>
          )}

          {/* BROWSE STORES */}
          {customerSection === 'stores' && !activeStore && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Indian Independent Storefronts
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Explore verified brands shipping across Indian PIN codes.
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setStoreCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                        storeCategory === cat
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredStores.map((store) => {
                  const storeProducts = products.filter((p) => p.storeId === store.id);
                  const leadProduct = storeProducts[0];
                  return (
                    <div
                      key={store.id}
                      className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <ProductVisual
                          variant={leadProduct?.visualVariant || 'vessel'}
                          imageDataUrl={store.bannerDataUrl || leadProduct?.imageDataUrl}
                          title={store.name}
                          accentColor={store.accentColor}
                          className="w-full h-48"
                        />
                        <div className="p-6">
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                            <span className="truncate">
                              {store.category} · {store.location} · {storeProducts.length} Products
                            </span>
                            {store.isSample && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-medium rounded shrink-0">
                                Sample Catalog
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mb-2">
                            {store.logoDataUrl && (
                              <img
                                src={store.logoDataUrl}
                                alt={store.name}
                                className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                              />
                            )}
                            <h2 className="font-display text-lg font-bold text-slate-900">
                              {store.name}
                            </h2>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed mb-4">
                            {store.tagline}
                          </p>
                        </div>
                      </div>
                      <div className="px-6 pb-6 flex items-center justify-between pt-4 border-t border-slate-100">
                        <span className="text-xs text-slate-500 font-mono tabular-nums">
                          Rating {store.rating.toFixed(1)} / 5.0
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedStoreId(store.id)}
                          className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 cursor-pointer"
                        >
                          Enter Storefront
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SINGLE STOREFRONT VIEW */}
          {customerSection === 'stores' && activeStore && (
            <div>
              <button
                type="button"
                onClick={() => setSelectedStoreId(null)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 mb-6 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                All Storefronts
              </button>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-8">
                {activeStore.bannerDataUrl && (
                  <img
                    src={activeStore.bannerDataUrl}
                    alt={`${activeStore.name} banner`}
                    className="w-full h-48 object-cover border-b border-slate-200"
                  />
                )}
                <div className="p-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-start gap-4">
                      {activeStore.logoDataUrl && (
                        <img
                          src={activeStore.logoDataUrl}
                          alt={activeStore.name}
                          className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                      )}
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                          <span>{activeStore.category}</span>
                          <span>·</span>
                          <span>{activeStore.location}</span>
                          {activeStore.isSample && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                              Sample Catalog
                            </span>
                          )}
                        </div>
                        <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">
                          {activeStore.name}
                        </h1>
                        <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                          {activeStore.description}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 font-mono tabular-nums text-sm text-slate-700">
                      Store Rating: {activeStore.rating.toFixed(1)} / 5.0
                    </div>
                  </div>
                  {(activeStore.shippingPolicy || activeStore.returnPolicy) && (
                    <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
                      <div>
                        <span className="font-semibold text-slate-900">Shipping Policy: </span>
                        {activeStore.shippingPolicy || 'Standard PAN-India courier dispatch.'}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-900">Return Policy: </span>
                        {activeStore.returnPolicy || '7-day transit damage replacement.'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {products
                  .filter((p) => p.storeId === activeStore.id)
                  .map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      accentColor={activeStore.accentColor}
                      wishlisted={isWishlisted(product.id)}
                      formatPrice={formatPrice}
                      onToggleWishlist={() => void handleWishlistToggle(product)}
                      onInspect={setInspectProduct}
                      onAdd={() => handleAddToCart(product)}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* SEARCH PRODUCTS */}
          {customerSection === 'search' && (
            <div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">Search Catalog</h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Showing {filteredProducts.length} approved products across {stores.length}{' '}
                    stores.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search title, SKU, tag..."
                      className="pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg w-60 focus:outline-none focus:border-blue-700"
                    />
                  </div>
                  <select
                    value={searchCategory}
                    onChange={(e) => setSearchCategory(e.target.value)}
                    className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                  >
                    <option value="featured">Featured</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                  </select>
                </div>
              </div>

              {filteredProducts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                  <p className="text-sm font-medium text-slate-900 mb-1">
                    No matching products found
                  </p>
                  <p className="text-xs text-slate-500 mb-4">
                    Try clearing your search filter or browsing all categories.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchCategory('All');
                    }}
                    className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      wishlisted={isWishlisted(product.id)}
                      formatPrice={formatPrice}
                      onToggleWishlist={() => void handleWishlistToggle(product)}
                      onInspect={setInspectProduct}
                      onAdd={() => handleAddToCart(product)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WISHLIST */}
          {customerSection === 'wishlist' && (
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-6">
                Saved Wishlist ({wishlist.length})
              </h1>
              {!userProfile ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                  <p className="text-sm font-semibold text-slate-900 mb-2">
                    Sign in to sync your saved wishlist
                  </p>
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle('customer')}
                    className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                  >
                    Sign In with Google
                  </button>
                </div>
              ) : wishlist.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                  <p className="text-sm font-medium text-slate-900 mb-1">No wishlist items yet</p>
                  <p className="text-xs text-slate-500 mb-4">
                    Tap the heart button on any product to save it here.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCustomerSection('search')}
                    className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                  >
                    Explore Products
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {wishlist.map((item) => {
                    const matchedProduct = products.find((p) => p.id === item.productId);
                    return (
                      <div
                        key={item.id}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
                      >
                        <ProductVisual
                          variant={matchedProduct?.visualVariant || 'vessel'}
                          imageDataUrl={matchedProduct?.imageDataUrl || item.imageDataUrl}
                          title={item.title}
                          className="w-full aspect-[4/3]"
                        />
                        <div className="p-5 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="font-display text-base font-semibold text-slate-900 mb-1">
                              {item.title}
                            </h3>
                            <p className="font-mono text-sm font-semibold text-slate-900 mb-4">
                              {formatPrice(
                                matchedProduct?.priceCents ?? item.priceCents,
                                sanitizeCurrency(matchedProduct?.currency)
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                            {matchedProduct && (
                              <button
                                type="button"
                                onClick={() => handleAddToCart(matchedProduct)}
                                className="flex-1 py-2 px-3 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 cursor-pointer"
                              >
                                Move to Cart
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                matchedProduct && void handleWishlistToggle(matchedProduct)
                              }
                              className="px-3 py-2 border border-slate-300 text-xs text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SHOPPING CART */}
          {customerSection === 'cart' && (
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-6">Shopping Cart</h1>
              {cart.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                  <p className="text-sm font-medium text-slate-900 mb-1">Your cart is empty</p>
                  <p className="text-xs text-slate-500 mb-5">
                    Add items from any storefront to begin Indian checkout.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCustomerSection('search')}
                    className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 cursor-pointer"
                  >
                    Browse Products
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
                    {cart.map((cartItem) => {
                      const { product, quantity, selectedSize: sz, selectedColor: col } = cartItem;
                      const key = getCartItemKey(cartItem);
                      return (
                        <div key={key} className="p-5 flex items-center gap-5">
                          <div className="w-24 h-20 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                            <ProductVisual
                              variant={product.visualVariant}
                              imageDataUrl={product.imageDataUrl}
                              title={product.title}
                              className="w-full h-full"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-500">
                              {product.storeName} · {product.sku}
                            </p>
                            <h3 className="font-display text-sm font-semibold text-slate-900 truncate">
                              {product.title}
                            </h3>
                            {(sz || col) && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {sz ? `Size: ${sz}` : ''} {sz && col ? '·' : ''}{' '}
                                {col ? `Color: ${col}` : ''}
                              </p>
                            )}
                            <p className="font-mono tabular-nums text-xs text-slate-600 mt-1">
                              {formatPrice(product.priceCents, sanitizeCurrency(product.currency))} each
                              {product.stock > 0 && (
                                <span className="text-slate-400"> · {product.stock} in stock</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 py-1">
                            <button
                              type="button"
                              onClick={() => updateCartQty(key, quantity - 1)}
                              className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-mono tabular-nums text-xs font-semibold w-6 text-center">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              disabled={product.stock > 0 && quantity >= product.stock}
                              onClick={() => updateCartQty(key, quantity + 1)}
                              className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-40 cursor-pointer"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="text-right w-28 shrink-0">
                            <p className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                              {formatPrice(product.priceCents * quantity, sanitizeCurrency(product.currency))}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeFromCart(key)}
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 mt-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 h-fit">
                    <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
                      {t('cust.orderSummary')} ({currency})
                    </h2>
                    <div className="space-y-2.5 text-sm pb-4 border-b border-slate-200">
                      <div className="flex justify-between text-slate-600">
                        <span>{t('cust.subtotal')}</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatPrice(cartSubtotalCents)}
                        </span>
                      </div>
                      {effectiveDiscountCents > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>{t('cust.discount')} ({appliedCoupon?.code})</span>
                          <span className="font-mono tabular-nums">
                            -{formatPrice(effectiveDiscountCents)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600">
                        <span>{t('cust.shipping')}</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {cartShippingCents === 0 ? t('cust.freeShipping') : formatPrice(cartShippingCents)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>{t('cust.tax')}</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatPrice(cartTaxCents)}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-baseline py-4">
                      <span className="text-sm font-semibold text-slate-900">{t('cust.total')}</span>
                      <span className="font-mono tabular-nums text-lg font-bold text-slate-900">
                        {formatPrice(cartTotalCents)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">
                      Free PAN-India shipping automatically applies on orders above{' '}
                      {formatPrice(freeThreshold)}.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCustomerSection('checkout')}
                      className="w-full py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 cursor-pointer"
                    >
                      {t('cust.buyNow')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CHECKOUT */}
          {customerSection === 'checkout' && (
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-6">
                Indian Marketplace Checkout
              </h1>

              {checkoutSuccessOrders ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-2xl">
                  <div className="flex items-center gap-3 text-emerald-700 mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      Order Confirmed
                    </h2>
                  </div>
                  <p className="text-sm text-slate-600 mb-6">
                    Your order has been created with a GST tax invoice and queued for merchant
                    dispatch.
                  </p>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 mb-6">
                    {checkoutSuccessOrders.map((ord) => (
                      <div key={ord.id} className="p-4 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{ord.storeName}</p>
                          <p className="text-xs font-mono text-slate-500">
                            {ord.invoiceNumber} · Tracking {ord.trackingCode} ({ord.paymentStatus})
                          </p>
                        </div>
                        <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                          {formatPrice(ord.totalCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCheckoutSuccessOrders(null);
                        setCustomerSection('tracking');
                      }}
                      className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 cursor-pointer"
                    >
                      Track Shipment
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCheckoutSuccessOrders(null);
                        setCustomerSection('orders');
                      }}
                      className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      View My Orders
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => void handleCheckoutSubmit(e)}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-8"
                >
                  <div className="lg:col-span-7 space-y-6">
                    {!userProfile && (
                      <div className="bg-white border border-blue-200 rounded-xl p-6 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Sign in required for order & invoice persistence
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            Connect your Google or Email account to place orders and track deliveries.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void signInWithGoogle('customer')}
                          className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg shrink-0 cursor-pointer"
                        >
                          Sign In with Google
                        </button>
                      </div>
                    )}

                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        1. Indian Delivery Address
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Recipient Full Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={shippingName}
                            onChange={(e) => setShippingName(e.target.value)}
                            placeholder="Full name"
                            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Mobile Number (10-digit India) *
                          </label>
                          <input
                            type="tel"
                            required
                            value={customerMobile}
                            onChange={(e) => setCustomerMobile(e.target.value)}
                            placeholder="9876543210"
                            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            House / Flat / Street / Landmark *
                          </label>
                          <textarea
                            rows={2}
                            required
                            value={shippingAddress}
                            onChange={(e) => setShippingAddress(e.target.value)}
                            placeholder="e.g. 402 Indiranagar 100 Feet Road, HAL 2nd Stage"
                            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            City *
                          </label>
                          <input
                            type="text"
                            required
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="Bengaluru / Mumbai / Delhi"
                            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            State *
                          </label>
                          <select
                            value={stateName}
                            onChange={(e) => setStateName(e.target.value)}
                            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
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
                            required
                            maxLength={6}
                            value={pinCode}
                            onChange={(e) => setPinCode(e.target.value)}
                            placeholder="560038"
                            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-blue-700"
                          />
                        </div>
                      </div>
                      {userProfile && (
                        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => void handleSaveAddressProfile()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {t('cust.saveAddress')}
                          </button>
                          {addressSaveMsg && (
                            <span className="text-xs text-emerald-700 font-medium">{addressSaveMsg}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        2. Payment Method
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('Razorpay (UPI / Card / NetBanking)')}
                          className={`p-3.5 text-left rounded-lg border transition-colors cursor-pointer ${
                            paymentMethod === 'Razorpay (UPI / Card / NetBanking)'
                              ? 'border-blue-700 bg-blue-50/50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-900">
                            Razorpay (UPI / Cards / NetBanking)
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {integrationsStatus.razorpayConfigured
                              ? 'Live Razorpay verification active'
                              : 'Requires RAZORPAY_KEY_ID & SECRET'}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('Cash on Delivery')}
                          className={`p-3.5 text-left rounded-lg border transition-colors cursor-pointer ${
                            paymentMethod === 'Cash on Delivery'
                              ? 'border-blue-700 bg-blue-50/50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-900">Cash on Delivery (COD)</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Pay cash or UPI upon doorstep delivery
                          </p>
                        </button>
                      </div>

                      {paymentMethod === 'Razorpay (UPI / Card / NetBanking)' &&
                        !integrationsStatus.razorpayConfigured && (
                          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                            <p className="font-semibold mb-1">
                              Razorpay API Keys Required for Online Payment
                            </p>
                            <p>
                              This server does not have <code>RAZORPAY_KEY_ID</code> and{' '}
                              <code>RAZORPAY_KEY_SECRET</code> configured yet. Online checkout is
                              disabled until keys are added to environment secrets—please select{' '}
                              <strong>Cash on Delivery</strong> to place your order now.
                            </p>
                          </div>
                        )}
                    </div>

                    {checkoutError && (
                      <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                        {checkoutError}
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 h-fit">
                    <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
                      Checkout Summary ({cartCount} items)
                    </h2>
                    <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto mb-4">
                      {cart.map((item) => (
                        <div
                          key={getCartItemKey(item)}
                          className="py-2.5 flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0 pr-3">
                            <p className="font-medium text-slate-900 truncate">{item.product.title}</p>
                            <p className="text-slate-500">
                              Qty {item.quantity} · {item.product.storeName}
                              {item.selectedSize ? ` · ${item.selectedSize}` : ''}
                            </p>
                          </div>
                          <span className="font-mono tabular-nums font-medium text-slate-900 shrink-0">
                            {formatPrice(item.product.priceCents * item.quantity, sanitizeCurrency(item.product.currency))}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Coupon Input */}
                    <div className="py-3 border-t border-slate-200 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={couponInput}
                            onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                            placeholder={t('cust.couponPlaceholder')}
                            className="w-full pl-8 pr-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                          />
                        </div>
                        {appliedCoupon ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedCoupon(null);
                              setCouponInput('');
                              setCouponMsg(null);
                            }}
                            className="px-3 py-1.5 border border-slate-300 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer"
                          >
                            Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={couponBusy || !couponInput.trim()}
                            onClick={() => void handleApplyCoupon()}
                            className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                          >
                            {couponBusy ? '...' : t('cust.applyCoupon')}
                          </button>
                        )}
                      </div>
                      {couponMsg && (
                        <p className={`text-[11px] font-medium ${couponMsg.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                          {couponMsg.text}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 py-3 border-t border-slate-200 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>{t('cust.subtotal')}</span>
                        <span className="font-mono">{formatPrice(cartSubtotalCents)}</span>
                      </div>
                      {effectiveDiscountCents > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>{t('cust.discount')} ({appliedCoupon?.code})</span>
                          <span className="font-mono">-{formatPrice(effectiveDiscountCents)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600">
                        <span>{t('cust.shipping')}</span>
                        <span className="font-mono">
                          {cartShippingCents === 0 ? t('cust.freeShipping') : formatPrice(cartShippingCents)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>{t('cust.tax')}</span>
                        <span className="font-mono">{formatPrice(cartTaxCents)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-100">
                        <span>{t('cust.total')}</span>
                        <span className="font-mono tabular-nums">{formatPrice(cartTotalCents)}</span>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={
                        checkoutBusy ||
                        cart.length === 0 ||
                        (paymentMethod === 'Razorpay (UPI / Card / NetBanking)' &&
                          !integrationsStatus.razorpayConfigured)
                      }
                      className="w-full mt-4 py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                    >
                      {checkoutBusy
                        ? 'Processing Order...'
                        : paymentMethod === 'Cash on Delivery'
                        ? `Place COD Order · ${formatPrice(cartTotalCents)}`
                        : `Pay via Razorpay · ${formatPrice(cartTotalCents)}`}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* MY ORDERS */}
          {customerSection === 'orders' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  My Orders ({orders.length})
                </h1>
                {orderActionMsg && (
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                    {orderActionMsg}
                  </span>
                )}
              </div>

              {!userProfile ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                  <p className="text-sm font-semibold text-slate-900 mb-2">
                    Sign in to view your order history
                  </p>
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle('customer')}
                    className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                  >
                    Sign In with Google
                  </button>
                </div>
              ) : orders.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                  <p className="text-sm font-medium text-slate-900 mb-1">No orders placed yet</p>
                  <button
                    type="button"
                    onClick={() => setCustomerSection('stores')}
                    className="mt-3 px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                  >
                    Start Shopping
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((ord) => {
                    const canCancel = ['pending', 'placed', 'confirmed'].includes(ord.status);
                    const hasRefund = refunds.some((r) => r.orderId === ord.id);
                    const hasDispute = disputes.some((d) => d.orderId === ord.id);
                    return (
                      <div key={ord.id} className="bg-white border border-slate-200 rounded-xl p-6">
                        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{ord.storeName}</p>
                            <p className="text-xs font-mono text-slate-500">
                              {ord.invoiceNumber || ord.id} · Tracking {ord.trackingCode}
                              {ord.awbCode ? ` · AWB ${ord.awbCode}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="px-2.5 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700 capitalize">
                              {ord.status.replace(/_/g, ' ')}
                            </span>
                            <span className="font-mono tabular-nums text-sm font-bold text-slate-900">
                              {formatPrice(ord.totalCents)}
                            </span>
                          </div>
                        </div>

                        <div className="py-3 space-y-1">
                          {ord.items.map((item, idx) => (
                            <div
                              key={`${item.productId}-${idx}`}
                              className="flex justify-between text-xs text-slate-600"
                            >
                              <span>
                                {item.quantity}x {item.title}{' '}
                                {item.selectedSize ? `(${item.selectedSize})` : ''}
                              </span>
                              <span className="font-mono">
                                {formatPrice(item.unitPriceCents * item.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                          <span className="text-xs text-slate-500">
                            {ord.paymentMethod} · Payment: {ord.paymentStatus}
                          </span>
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <button
                              type="button"
                              onClick={() => setInvoiceOrder(ord)}
                              className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              GST Invoice
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderId(ord.id);
                                setCustomerSection('tracking');
                              }}
                              className="font-medium text-blue-700 hover:underline cursor-pointer"
                            >
                              Track
                            </button>
                            {canCancel && (
                              <button
                                type="button"
                                onClick={() => void cancelCustomerOrder(ord.id)}
                                className="font-medium text-red-600 hover:underline cursor-pointer"
                              >
                                Cancel
                              </button>
                            )}
                            {!hasRefund && ord.status !== 'cancelled' && (
                              <button
                                type="button"
                                onClick={() => setRefundOrder(ord)}
                                className="inline-flex items-center gap-1 font-medium text-amber-700 hover:underline cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Refund
                              </button>
                            )}
                            {!hasDispute && (
                              <button
                                type="button"
                                onClick={() => setDisputeOrder(ord)}
                                className="inline-flex items-center gap-1 font-medium text-slate-600 hover:underline cursor-pointer"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                Report Issue
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Active Refunds & Disputes */}
              {(refunds.length > 0 || disputes.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  {refunds.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <h2 className="font-display text-sm font-semibold text-slate-900 mb-3">
                        My Refund Requests ({refunds.length})
                      </h2>
                      <div className="divide-y divide-slate-100 text-xs">
                        {refunds.map((r) => (
                          <div key={r.id} className="py-2.5 flex justify-between gap-3">
                            <div>
                              <p className="font-mono text-slate-900">Order {r.orderId.slice(-8)}</p>
                              <p className="text-slate-500">{r.reason}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono font-semibold">{formatPrice(r.amountCents)}</p>
                              <p className="capitalize text-blue-700">{r.status}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {disputes.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <h2 className="font-display text-sm font-semibold text-slate-900 mb-3">
                        My Support Disputes ({disputes.length})
                      </h2>
                      <div className="divide-y divide-slate-100 text-xs">
                        {disputes.map((d) => (
                          <div key={d.id} className="py-2.5">
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-900">{d.subject}</span>
                              <span className="capitalize text-blue-700">{d.status.replace(/_/g, ' ')}</span>
                            </div>
                            <p className="text-slate-500 mt-0.5">{d.description}</p>
                            {d.resolution && (
                              <p className="text-emerald-700 mt-1">Resolution: {d.resolution}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ORDER TRACKING */}
          {customerSection === 'tracking' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Live Order Tracking
                  </h1>
                  <p className="text-sm text-slate-600">
                    Track Indian fulfillment progress from order placement to doorstep delivery.
                  </p>
                </div>
                <input
                  type="text"
                  value={trackingSearch}
                  onChange={(e) => setTrackingSearch(e.target.value)}
                  placeholder="Enter Tracking Code or AWB..."
                  className="px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono w-64 focus:outline-none focus:border-blue-700"
                />
              </div>

              {!trackedOrder ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                  <p className="text-sm font-medium text-slate-900 mb-1">No order selected</p>
                  <p className="text-xs text-slate-500">
                    Place an order or enter a valid tracking code above.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-8">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200">
                    <div>
                      <p className="text-xs text-slate-500">Tracking Number</p>
                      <p className="font-mono text-xl font-bold text-slate-900">
                        {trackedOrder.awbCode || trackedOrder.trackingCode}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {trackedOrder.storeName} · Courier:{' '}
                        {trackedOrder.courierName || 'Merchant Partner'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Current Stage</p>
                      <p className="text-sm font-semibold capitalize text-blue-700">
                        {trackedOrder.status.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>

                  {trackedOrder.status === 'cancelled' || trackedOrder.status === 'returned' ? (
                    <div className="py-8 text-center text-sm text-red-700 font-medium capitalize">
                      This order has been {trackedOrder.status}.
                    </div>
                  ) : (
                    <div className="py-8 grid grid-cols-2 sm:grid-cols-6 gap-4">
                      {ORDER_LIFECYCLE_STEPS.map((stage, idx) => {
                        const currentIdx = normalizeOrderStepIndex(trackedOrder.status);
                        const active = idx <= currentIdx;
                        return (
                          <div key={stage} className="flex flex-col">
                            <div
                              className={`h-1.5 rounded-full mb-3 ${
                                active ? 'bg-blue-700' : 'bg-slate-200'
                              }`}
                            />
                            <p
                              className={`text-xs font-semibold capitalize ${
                                active ? 'text-slate-900' : 'text-slate-400'
                              }`}
                            >
                              {idx + 1}. {t(`track.${stage}`)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>
                        Delivering to {trackedOrder.shippingAddress}
                        {trackedOrder.city ? `, ${trackedOrder.city}` : ''}
                        {trackedOrder.state ? `, ${trackedOrder.state}` : ''}
                        {trackedOrder.pinCode ? ` - ${trackedOrder.pinCode}` : ''}
                      </span>
                    </div>
                    {trackedOrder.awbCode && (
                      <button
                        type="button"
                        disabled={liveTrackBusy}
                        onClick={() => void checkLiveShiprocketTracking(trackedOrder.awbCode!)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${liveTrackBusy ? 'animate-spin' : ''}`} />
                        Check Live Courier Tracking
                      </button>
                    )}
                  </div>
                  {liveTrackResult && (
                    <div
                      className={`mt-4 p-3 rounded-lg border text-xs ${
                        liveTrackResult.error
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-blue-50 border-blue-200 text-blue-900'
                      }`}
                    >
                      {liveTrackResult.error ? liveTrackResult.error : `${liveTrackResult.detail}: ${liveTrackResult.status}`}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Product Detail Modal: Multi-image Gallery + Zoom + Lightbox + Variants + Reviews */}
      {inspectProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full overflow-hidden border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="bg-slate-50 p-4 flex flex-col gap-3">
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div
                    onClick={() => setImageZoomed((z) => !z)}
                    className={`transition-transform duration-200 ${
                      imageZoomed ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in'
                    }`}
                    title={t('cust.clickZoom')}
                  >
                    <ProductVisual
                      variant={inspectProduct.visualVariant}
                      imageDataUrl={galleryUrls[activeImageIdx] || inspectProduct.imageDataUrl}
                      title={inspectProduct.title}
                      className="w-full aspect-[4/3]"
                    />
                  </div>
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                    <span className="px-2 py-0.5 rounded bg-slate-900/75 text-white text-[11px] font-mono inline-flex items-center gap-1">
                      <ZoomIn className="w-3 h-3" />
                      {activeImageIdx + 1} / {Math.max(1, galleryUrls.length)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="pointer-events-auto p-1.5 rounded bg-white/95 border border-slate-200 text-slate-700 hover:text-blue-700 shadow-sm cursor-pointer"
                      aria-label="Open Fullscreen Photo"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {galleryUrls.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {galleryUrls.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setActiveImageIdx(idx);
                          setImageZoomed(false);
                        }}
                        className={`w-16 h-14 rounded-md overflow-hidden border-2 shrink-0 cursor-pointer ${
                          activeImageIdx === idx ? 'border-blue-700' : 'border-slate-200'
                        }`}
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs text-slate-500">
                      {inspectProduct.storeName} · {inspectProduct.sku}
                    </span>
                    <button
                      type="button"
                      onClick={() => setInspectProduct(null)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>

                  <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                    {inspectProduct.title}
                  </h2>

                  <div className="flex items-baseline gap-2.5 mb-3">
                    <span className="font-mono tabular-nums text-xl font-bold text-slate-900">
                      {formatPrice(inspectProduct.priceCents, sanitizeCurrency(inspectProduct.currency))}
                    </span>
                    {inspectProduct.originalPriceCents &&
                      inspectProduct.originalPriceCents > inspectProduct.priceCents && (
                        <>
                          <span className="font-mono tabular-nums text-sm text-slate-400 line-through">
                            {formatPrice(inspectProduct.originalPriceCents, sanitizeCurrency(inspectProduct.currency))}
                          </span>
                          <span className="text-xs font-semibold text-emerald-700">
                            {inspectProduct.discountPct ||
                              Math.round(
                                ((inspectProduct.originalPriceCents - inspectProduct.priceCents) /
                                  inspectProduct.originalPriceCents) *
                                  100
                              )}
                            % OFF
                          </span>
                        </>
                      )}
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed mb-4">
                    {inspectProduct.description}
                  </p>

                  {inspectProduct.sizes && inspectProduct.sizes.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-slate-700 mb-1.5">Select Size / Variant</p>
                      <div className="flex flex-wrap gap-2">
                        {inspectProduct.sizes.map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setSelectedSize(sz)}
                            className={`px-3 py-1 text-xs rounded-md border cursor-pointer ${
                              selectedSize === sz
                                ? 'border-blue-700 bg-blue-50 text-blue-700 font-semibold'
                                : 'border-slate-300 text-slate-700'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {inspectProduct.colors && inspectProduct.colors.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-slate-700 mb-1.5">Select Color / Finish</p>
                      <div className="flex flex-wrap gap-2">
                        {inspectProduct.colors.map((col) => (
                          <button
                            key={col}
                            type="button"
                            onClick={() => setSelectedColor(col)}
                            className={`px-3 py-1 text-xs rounded-md border cursor-pointer ${
                              selectedColor === col
                                ? 'border-blue-700 bg-blue-50 text-blue-700 font-semibold'
                                : 'border-slate-300 text-slate-700'
                            }`}
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {inspectProduct.bulletPoints && inspectProduct.bulletPoints.length > 0 && (
                    <ul className="space-y-1 text-xs text-slate-700 mb-4">
                      {inspectProduct.bulletPoints.map((b) => (
                        <li key={b}>· {b}</li>
                      ))}
                    </ul>
                  )}

                  <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-lg text-[11px] text-slate-600 mb-4">
                    <div>
                      <span className="font-semibold text-slate-800">Stock: </span>
                      {inspectProduct.stock} units
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">GST: </span>
                      {inspectProduct.gstRatePct ?? gstPct}%
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">{t('cust.shippingFee')}: </span>
                      {inspectProduct.shippingFeeCents === 0
                        ? t('cust.freeShipping')
                        : inspectProduct.shippingFeeCents !== undefined
                        ? formatPrice(inspectProduct.shippingFeeCents, sanitizeCurrency(inspectProduct.currency))
                        : `${formatPrice(baseShipping)} (Free ≥ ${formatPrice(freeThreshold)})`}
                    </div>
                    {inspectProduct.weightGrams ? (
                      <div>
                        <span className="font-semibold text-slate-800">Weight: </span>
                        {inspectProduct.weightGrams}g
                      </div>
                    ) : null}
                    {inspectProduct.shippingInfo && (
                      <div className="col-span-2">
                        <span className="font-semibold text-slate-800">Shipping: </span>
                        {inspectProduct.shippingInfo}
                      </div>
                    )}
                    {inspectProduct.returnPolicy && (
                      <div className="col-span-2">
                        <span className="font-semibold text-slate-800">Returns: </span>
                        {inspectProduct.returnPolicy}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={inspectProduct.stock <= 0}
                    onClick={() => {
                      handleAddToCart(inspectProduct, selectedSize, selectedColor);
                      setInspectProduct(null);
                    }}
                    className="flex-1 py-2.5 px-4 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                  >
                    {inspectProduct.stock <= 0
                      ? t('cust.outOfStock')
                      : `${t('cust.addToCart')} · ${formatPrice(inspectProduct.priceCents, sanitizeCurrency(inspectProduct.currency))}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleWishlistToggle(inspectProduct)}
                    className={`p-2.5 rounded-lg border cursor-pointer ${
                      isWishlisted(inspectProduct.id)
                        ? 'border-red-300 bg-red-50 text-red-600'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                    aria-label="Toggle Wishlist"
                  >
                    <Heart className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Product Reviews Section */}
            <div className="p-6 border-t border-slate-200 bg-slate-50/50">
              <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
                Customer Reviews ({productReviews.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                  {productReviews.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No reviews yet. Be the first verified shopper to review this product.
                    </p>
                  ) : (
                    productReviews.map((rev) => (
                      <div key={rev.id} className="bg-white border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-900">{rev.customerName}</span>
                          <span className="inline-flex items-center gap-1 text-amber-600 font-mono">
                            <Star className="w-3 h-3 fill-amber-500" />
                            {rev.rating}/5
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-800">{rev.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{rev.comment}</p>
                        {rev.verifiedPurchase && (
                          <span className="inline-block mt-1 text-[10px] font-medium text-emerald-700">
                            Verified Purchase
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {userProfile ? (
                  <form
                    onSubmit={(e) => void handleReviewSubmit(e)}
                    className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5"
                  >
                    <p className="text-xs font-semibold text-slate-900">Write a Review</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-600">Rating:</span>
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setReviewForm((prev) => ({ ...prev, rating: r }))}
                          className={`px-2 py-0.5 rounded border cursor-pointer ${
                            reviewForm.rating === r
                              ? 'bg-amber-50 border-amber-400 text-amber-800 font-semibold'
                              : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          {r}★
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={reviewForm.title}
                      onChange={(e) => setReviewForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Review headline"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                    <textarea
                      rows={2}
                      required
                      value={reviewForm.comment}
                      onChange={(e) => setReviewForm((p) => ({ ...p, comment: e.target.value }))}
                      placeholder="Share build quality, sizing, and delivery experience..."
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                    {reviewMsg && <p className="text-xs text-blue-700">{reviewMsg}</p>}
                    <button
                      type="submit"
                      disabled={reviewBusy}
                      className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg cursor-pointer"
                    >
                      {reviewBusy ? 'Submitting...' : 'Submit Review'}
                    </button>
                  </form>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-center items-start">
                    <p className="text-xs text-slate-600 mb-2">Sign in to post a product review.</p>
                    <button
                      type="button"
                      onClick={() => void signInWithGoogle('customer')}
                      className="px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                    >
                      Sign In
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GST Tax Invoice Modal */}
      {invoiceOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
              <div>
                <p className="text-xs text-blue-700 font-semibold">TAX INVOICE (INDIA GST)</p>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {invoiceOrder.invoiceNumber || invoiceOrder.id}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceOrder(null)}
                className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs mb-4">
              <div>
                <p className="font-semibold text-slate-900">Sold By</p>
                <p className="text-slate-600">{invoiceOrder.storeName}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Billed To</p>
                <p className="text-slate-600">{invoiceOrder.customerName}</p>
                <p className="text-slate-500">
                  {invoiceOrder.shippingAddress}, {invoiceOrder.city}, {invoiceOrder.state} -{' '}
                  {invoiceOrder.pinCode}
                </p>
              </div>
            </div>
            <table className="w-full text-xs border-y border-slate-200 mb-4">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="py-2 text-left">Item</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoiceOrder.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2">
                      {item.title} ({item.sku})
                    </td>
                    <td className="py-2 text-right font-mono">{item.quantity}</td>
                    <td className="py-2 text-right font-mono">
                      {formatPrice(item.unitPriceCents * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(() => {
              const breakup = computeGstBreakup(
                invoiceOrder.subtotalCents,
                invoiceOrder.gstRatePct ?? 18
              );
              return (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Value</span>
                    <span className="font-mono">{formatPrice(breakup.taxableValuePaise)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>CGST ({(invoiceOrder.gstRatePct ?? 18) / 2}%)</span>
                    <span className="font-mono">{formatPrice(breakup.cgstPaise)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>SGST ({(invoiceOrder.gstRatePct ?? 18) / 2}%)</span>
                    <span className="font-mono">{formatPrice(breakup.sgstPaise)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Shipping</span>
                    <span className="font-mono">{formatPrice(invoiceOrder.shippingCents)}</span>
                  </div>
                  {(invoiceOrder.discountCents ?? 0) > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount {invoiceOrder.couponCode ? `(${invoiceOrder.couponCode})` : ''}</span>
                      <span className="font-mono">-{formatPrice(invoiceOrder.discountCents ?? 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                    <span>Grand Total</span>
                    <span className="font-mono">{formatPrice(invoiceOrder.totalCents)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Request Refund Modal */}
      {refundOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleSubmitRefund(e)}
            className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-slate-900">
              Request Order Refund ({formatPrice(refundOrder.totalCents)})
            </h2>
            <textarea
              rows={3}
              required
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Explain why you are requesting a refund (damaged item, wrong variant, delayed delivery)..."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefundOrder(null)}
                className="px-4 py-2 text-xs text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-600 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Submit Refund Request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Open Dispute Modal */}
      {disputeOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleSubmitDispute(e)}
            className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-slate-900">
              Report Order Issue / Dispute
            </h2>
            <input
              type="text"
              required
              value={disputeForm.subject}
              onChange={(e) => setDisputeForm((p) => ({ ...p, subject: e.target.value }))}
              placeholder="Issue subject (e.g. Missing item in parcel)"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <textarea
              rows={3}
              required
              value={disputeForm.description}
              onChange={(e) => setDisputeForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Describe the issue in detail for SellerFlow AI Admin mediation..."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDisputeOrder(null)}
                className="px-4 py-2 text-xs text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Open Dispute
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Upgrade Customer to Seller Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200">
            <h2 className="font-display text-lg font-bold text-slate-900 mb-2">
              Launch Your Seller Studio
            </h2>
            <p className="text-xs text-slate-600 mb-4">
              Upgrade your account to receive your private Seller Dashboard, Storefront Builder,
              and AI Studios.
            </p>
            <input
              type="text"
              value={upgradeBizName}
              onChange={(e) => setUpgradeBizName(e.target.value)}
              placeholder="Enter your business / studio name"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg mb-4 focus:outline-none focus:border-blue-700"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (upgradeBizName.trim().length < 2) return;
                  void becomeSeller(upgradeBizName.trim()).then(() => setShowUpgradeModal(false));
                }}
                className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Create Seller Store
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Fullscreen Product Photo Lightbox */}
      {lightboxOpen && inspectProduct && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative max-w-4xl w-full flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white text-xs">
              <span className="font-medium truncate">
                {inspectProduct.title} ({activeImageIdx + 1} / {Math.max(1, galleryUrls.length)})
              </span>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <img
              src={galleryUrls[activeImageIdx] || inspectProduct.imageDataUrl}
              alt={inspectProduct.title}
              className="max-h-[78vh] w-auto rounded-xl object-contain bg-white"
            />
            {galleryUrls.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto max-w-full">
                {galleryUrls.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIdx(idx)}
                    className={`w-14 h-12 rounded-md overflow-hidden border-2 shrink-0 cursor-pointer ${
                      activeImageIdx === idx ? 'border-blue-500' : 'border-white/30'
                    }`}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ProductCard: React.FC<{
  product: Product;
  accentColor?: string;
  wishlisted?: boolean;
  formatPrice: (amountMinor: number, fromCurrency?: ReturnType<typeof sanitizeCurrency>) => string;
  onToggleWishlist: () => void;
  onInspect: (p: Product) => void;
  onAdd: () => void;
}> = ({ product, accentColor, wishlisted, formatPrice, onToggleWishlist, onInspect, onAdd }) => {
  const itemCur = sanitizeCurrency(product.currency);
  return (
    <article className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
      <div>
        <div className="relative">
          <div onClick={() => onInspect(product)} className="cursor-pointer">
            <ProductVisual
              variant={product.visualVariant}
              imageDataUrl={product.imageDataUrl}
              title={product.title}
              accentColor={accentColor}
              className="w-full aspect-[4/3]"
            />
          </div>
          <button
            type="button"
            onClick={onToggleWishlist}
            className={`absolute top-3 right-3 p-2 rounded-full bg-white/90 border border-slate-200 shadow-sm cursor-pointer ${
              wishlisted ? 'text-red-600' : 'text-slate-500 hover:text-slate-900'
            }`}
            aria-label="Save to Wishlist"
          >
            <Heart className={`w-4 h-4 ${wishlisted ? 'fill-red-600' : ''}`} />
          </button>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
            <span className="truncate">{product.storeName}</span>
            <span className="font-mono shrink-0">{product.stock} in stock</span>
          </div>
          <h3
            onClick={() => onInspect(product)}
            className="font-display text-base font-semibold text-slate-900 mb-1 cursor-pointer hover:text-blue-700"
          >
            {product.title}
          </h3>
          <p className="text-xs text-slate-600 line-clamp-2">{product.description}</p>
        </div>
      </div>
      <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono tabular-nums text-sm font-bold text-slate-900">
            {formatPrice(product.priceCents, itemCur)}
          </span>
          {product.originalPriceCents && product.originalPriceCents > product.priceCents && (
            <span className="font-mono tabular-nums text-[11px] text-slate-400 line-through">
              {formatPrice(product.originalPriceCents, itemCur)}
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={product.stock <= 0}
          onClick={onAdd}
          className="px-3.5 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
        >
          {product.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
      </div>
    </article>
  );
};

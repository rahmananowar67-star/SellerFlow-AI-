import type { SupportedCurrency } from '../lib/currency';
import type { SupportedLanguage } from '../lib/i18n';

export type { SupportedCurrency, SupportedLanguage };
export type UserRole = 'customer' | 'seller' | 'admin';
export type PortalView = 'public' | 'customer' | 'seller' | 'admin';

export type PublicSection = 'home' | 'features' | 'pricing' | 'login' | 'register';
export type CustomerSection =
  | 'stores'
  | 'search'
  | 'wishlist'
  | 'cart'
  | 'checkout'
  | 'orders'
  | 'tracking';

export type SellerSection =
  | 'overview'
  | 'my-store'
  | 'add-product'
  | 'products'
  | 'categories'
  | 'inventory'
  | 'orders'
  | 'shipping'
  | 'crm'
  | 'analytics'
  | 'earnings'
  | 'payouts'
  | 'store-builder'
  | 'ai-product-studio'
  | 'ai-marketing-studio'
  | 'profit-calculator'
  | 'store-settings'
  | 'settings';

export type AdminSection =
  | 'users'
  | 'sellers'
  | 'stores'
  | 'products'
  | 'categories'
  | 'orders'
  | 'payments'
  | 'commissions'
  | 'subscriptions'
  | 'refunds'
  | 'disputes'
  | 'reports'
  | 'settings';

export const BLUEPRINT_LIMITS = {
  ID_REGEX: /^[a-zA-Z0-9_\-]+$/,
  SLUG_REGEX: /^[a-z0-9\-]+$/,
  MAX_ID: 128,
  MAX_NAME: 120,
  MAX_EMAIL: 200,
  MAX_TITLE: 140,
  MAX_DESC: 2000,
  MAX_TAGLINE: 180,
  MAX_ADDRESS: 300,
  MAX_NOTES: 800,
  MAX_IMAGE_BYTES: 340000,
} as const;

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  phone?: string;
  shippingAddress?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  avatarUrl?: string;
  preferredLanguage?: SupportedLanguage;
  preferredCurrency?: SupportedCurrency;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface SellerAccount {
  uid: string;
  fullName?: string;
  businessName: string;
  email: string;
  mobile?: string;
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  businessCategory?: string;
  gstin?: string;
  panNumber?: string;
  plan: 'starter' | 'growth' | 'pro' | 'enterprise';
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  rejectionReason?: string;
  payoutAccount?: string;
  upiId?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  commissionRate: number;
  totalRevenueCents: number;
  isSample?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  category: string;
  tagline: string;
  description: string;
  accentColor: string;
  layoutStyle: 'editorial' | 'minimal' | 'grid';
  location: string;
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  contactEmail?: string;
  contactPhone?: string;
  returnPolicy?: string;
  shippingPolicy?: string;
  gstin?: string;
  logoDataUrl?: string;
  bannerDataUrl?: string;
  status: 'pending' | 'active' | 'draft' | 'suspended';
  rating: number;
  productCount: number;
  isSample?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProductModerationStatus = 'draft' | 'pending' | 'published' | 'rejected';

export interface Product {
  id: string;
  storeId: string;
  storeName: string;
  sellerId: string;
  title: string;
  sku: string;
  category: string;
  subcategory?: string;
  description: string;
  bulletPoints?: string[];
  seoKeywords?: string[];
  tags?: string[];
  priceCents: number;
  originalPriceCents?: number;
  discountPct?: number;
  currency?: SupportedCurrency;
  shippingFeeCents?: number;
  gstRatePct?: number;
  costCents: number;
  stock: number;
  reorderPoint: number;
  published: boolean;
  moderationStatus?: ProductModerationStatus;
  rejectionReason?: string;
  sizes?: string[];
  colors?: string[];
  weightGrams?: number;
  dimensions?: string;
  shippingInfo?: string;
  returnPolicy?: string;
  visualVariant: string;
  imageDataUrl?: string;
  imageAssetIds?: string[];
  isSample?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  title: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  selectedSize?: string;
  selectedColor?: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'placed'
  | 'packed';

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerMobile?: string;
  sellerId: string;
  storeId: string;
  storeName: string;
  items: OrderItem[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  gstRatePct?: number;
  discountCents?: number;
  couponCode?: string;
  totalCents: number;
  currency?: SupportedCurrency;
  displayCurrency?: SupportedCurrency;
  fxRateApplied?: number;
  paymentMethod: string;
  paymentStatus: 'paid' | 'pending' | 'refunded' | 'failed';
  status: OrderStatus;
  trackingCode: string;
  courierName?: string;
  awbCode?: string;
  shiprocketOrderId?: string;
  shipmentStatus?: string;
  invoiceNumber?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  shippingAddress: string;
  city?: string;
  state?: string;
  pinCode?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCRM {
  id: string;
  sellerId: string;
  customerUid?: string;
  name: string;
  email: string;
  segment: 'vip' | 'repeat' | 'new' | 'at_risk';
  totalOrders: number;
  lifetimeSpendCents: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  customerId: string;
  sellerId: string;
  storeId: string;
  amountCents: number;
  platformFeeCents: number;
  netPayoutCents: number;
  currency: string;
  method: string;
  status: 'captured' | 'settled' | 'pending' | 'refunded' | 'failed';
  gatewayRef: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionRecord {
  id: string;
  sellerId: string;
  sellerName: string;
  planId: 'starter' | 'growth' | 'pro' | 'enterprise';
  monthlyPriceCents: number;
  status: 'active' | 'past_due' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: 'order' | 'inventory' | 'payment' | 'system';
  read: boolean;
  createdAt: string;
}

export interface AssetFile {
  id: string;
  ownerId: string;
  storeId?: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  isPublic: boolean;
  createdAt: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  subcategories: string[];
  gstRatePct: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRecord {
  id: string;
  productId: string;
  storeId: string;
  sellerId: string;
  customerId: string;
  customerName: string;
  rating: number;
  title: string;
  comment: string;
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WishlistItem {
  id: string;
  customerId: string;
  productId: string;
  storeId: string;
  title: string;
  priceCents: number;
  imageDataUrl?: string;
  createdAt: string;
}

export interface CommissionRecord {
  id: string;
  orderId: string;
  paymentId: string;
  sellerId: string;
  storeId: string;
  storeName: string;
  grossAmountCents: number;
  commissionRate: number;
  commissionCents: number;
  netSellerCents: number;
  status: 'pending' | 'earned' | 'settled' | 'reversed';
  createdAt: string;
  updatedAt: string;
}

export interface PayoutRecord {
  id: string;
  sellerId: string;
  storeName: string;
  amountCents: number;
  method: 'UPI' | 'IMPS / NEFT Bank Transfer';
  payoutAccount: string;
  bankRef?: string;
  status: 'requested' | 'processing' | 'paid' | 'rejected';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefundRecord {
  id: string;
  orderId: string;
  paymentId?: string;
  customerId: string;
  customerName: string;
  sellerId: string;
  storeId: string;
  amountCents: number;
  reason: string;
  status: 'requested' | 'approved' | 'processed' | 'rejected';
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeRecord {
  id: string;
  orderId: string;
  customerId: string;
  customerName: string;
  sellerId: string;
  storeName: string;
  subject: string;
  description: string;
  status: 'open' | 'under_review' | 'resolved' | 'closed';
  resolution?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanConfig {
  id: 'starter' | 'growth' | 'pro';
  name: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  commissionRate: number;
  skuLimitCount: number;
}

export interface PlatformSettings {
  id: string;
  requireProductApproval: boolean;
  requireSellerApproval: boolean;
  defaultGstPct: number;
  freeShippingThresholdCents: number;
  defaultShippingCents: number;
  starterPriceCents: number;
  starterCommissionRate: number;
  starterSkuLimit: number;
  growthPriceCents: number;
  growthCommissionRate: number;
  growthSkuLimit: number;
  proPriceCents: number;
  proCommissionRate: number;
  proSkuLimit: number;
  enabledCurrencies?: SupportedCurrency[];
  enabledLanguages?: SupportedLanguage[];
  defaultCurrency?: SupportedCurrency;
  defaultLanguage?: SupportedLanguage;
  updatedBy: string;
  updatedAt: string;
}

export interface CouponRecord {
  id: string;
  code: string;
  description: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderCents: number;
  maxDiscountCents: number;
  active: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
}

export function formatMoney(paise: number): string {
  const value = Number.isFinite(paise) ? paise / 100 : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, BLUEPRINT_LIMITS.MAX_ID);
  return cleaned || `id-${Date.now()}`;
}

export function makeSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || `store-${Date.now().toString(36)}`;
}

export function isProductPubliclyVisible(product: Product): boolean {
  if (!product.published) return false;
  if (product.moderationStatus && product.moderationStatus !== 'published') return false;
  return true;
}

export function normalizeOrderStepIndex(status: OrderStatus): number {
  switch (status) {
    case 'pending':
    case 'placed':
      return 0;
    case 'confirmed':
      return 1;
    case 'processing':
    case 'packed':
      return 2;
    case 'shipped':
      return 3;
    case 'out_for_delivery':
      return 4;
    case 'delivered':
      return 5;
    default:
      return -1;
  }
}

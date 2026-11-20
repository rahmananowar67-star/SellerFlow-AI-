import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { DEFAULT_MARKETPLACE_CATEGORIES } from './indiaData';
import {
  DEFAULT_FX_RATES,
  convertCurrencyMinorUnits,
  sanitizeCurrency,
  type FxRatesMap,
  type SupportedCurrency,
} from './currency';
import { sanitizeLanguage, type SupportedLanguage } from './i18n';
import {
  DEFAULT_PLATFORM_SETTINGS,
  SAMPLE_PRODUCT_IMAGES,
  SEED_PRODUCTS,
  SEED_STORES,
} from './seedData';
import {
  BLUEPRINT_LIMITS,
  makeSlug,
  sanitizeId,
  type AssetFile,
  type AuditLogRecord,
  type CartItem,
  type CategoryRecord,
  type CommissionRecord,
  type CouponRecord,
  type CustomerCRM,
  type DisputeRecord,
  type NotificationItem,
  type Order,
  type OrderStatus,
  type PaymentRecord,
  type PayoutRecord,
  type PlatformSettings,
  type Product,
  type ProductModerationStatus,
  type RefundRecord,
  type ReviewRecord,
  type SellerAccount,
  type Store,
  type SubscriptionRecord,
  type UserProfile,
  type UserRole,
  type WishlistItem,
} from '../types/commerce';

function hydrateProductDefaults(p: Product): Product {
  const sampleImg = SAMPLE_PRODUCT_IMAGES[p.id];
  return {
    ...p,
    currency: sanitizeCurrency(p.currency),
    imageDataUrl: p.imageDataUrl || sampleImg || undefined,
  };
}

function toIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') {
    return val;
  }
  return new Date().toISOString();
}

function clampStr(val: string | undefined, max: number): string {
  return (val ?? '').trim().slice(0, max);
}

// ============================================================================
// Platform Settings & Categories
// ============================================================================
export async function getPlatformSettingsOnce(): Promise<PlatformSettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'platform'));
    if (snap.exists()) {
      const d = snap.data();
      return {
        ...(DEFAULT_PLATFORM_SETTINGS as Omit<PlatformSettings, 'updatedAt'>),
        ...(d as Partial<PlatformSettings>),
        updatedAt: toIso(d.updatedAt),
      };
    }
  } catch {
    // Fall back to defaults if settings doc hasn't been created yet
  }
  return {
    ...DEFAULT_PLATFORM_SETTINGS,
    updatedAt: new Date().toISOString(),
  };
}

export function subscribePlatformSettings(
  onData: (settings: PlatformSettings) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'settings', 'platform'),
    (snap) => {
      if (!snap.exists()) {
        onData({ ...DEFAULT_PLATFORM_SETTINGS, updatedAt: new Date().toISOString() });
        return;
      }
      const d = snap.data();
      onData({
        ...(DEFAULT_PLATFORM_SETTINGS as Omit<PlatformSettings, 'updatedAt'>),
        ...(d as Partial<PlatformSettings>),
        updatedAt: toIso(d.updatedAt),
      });
    },
    () => {
      onData({ ...DEFAULT_PLATFORM_SETTINGS, updatedAt: new Date().toISOString() });
    }
  );
}

export async function savePlatformSettings(
  settings: Omit<PlatformSettings, 'id' | 'updatedAt'>
): Promise<void> {
  const path = 'settings/platform';
  try {
    await setDoc(doc(db, 'settings', 'platform'), {
      id: 'platform',
      requireProductApproval: Boolean(settings.requireProductApproval),
      requireSellerApproval: Boolean(settings.requireSellerApproval),
      defaultGstPct: Number(settings.defaultGstPct ?? 18),
      freeShippingThresholdCents: Math.max(0, Math.round(settings.freeShippingThresholdCents)),
      defaultShippingCents: Math.max(0, Math.round(settings.defaultShippingCents)),
      starterPriceCents: Math.max(0, Math.round(settings.starterPriceCents)),
      starterCommissionRate: Number(settings.starterCommissionRate),
      starterSkuLimit: Math.max(1, Math.round(settings.starterSkuLimit)),
      growthPriceCents: Math.max(0, Math.round(settings.growthPriceCents)),
      growthCommissionRate: Number(settings.growthCommissionRate),
      growthSkuLimit: Math.max(1, Math.round(settings.growthSkuLimit)),
      proPriceCents: Math.max(0, Math.round(settings.proPriceCents)),
      proCommissionRate: Number(settings.proCommissionRate),
      proSkuLimit: Math.max(1, Math.round(settings.proSkuLimit)),
      enabledCurrencies:
        settings.enabledCurrencies && settings.enabledCurrencies.length > 0
          ? settings.enabledCurrencies.slice(0, 5)
          : ['INR', 'USD', 'EUR'],
      enabledLanguages:
        settings.enabledLanguages && settings.enabledLanguages.length > 0
          ? settings.enabledLanguages.slice(0, 5)
          : ['en', 'hi', 'as'],
      defaultCurrency: sanitizeCurrency(settings.defaultCurrency),
      defaultLanguage: sanitizeLanguage(settings.defaultLanguage),
      updatedBy: clampStr(settings.updatedBy || 'admin', 128),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeCategories(onData: (cats: CategoryRecord[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'categories'),
    (snap) => {
      if (snap.empty) {
        onData(
          DEFAULT_MARKETPLACE_CATEGORIES.map((c) => ({
            ...c,
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }))
        );
        return;
      }
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<CategoryRecord, 'createdAt' | 'updatedAt'>),
          id: d.id,
          createdAt: toIso(d.data().createdAt),
          updatedAt: toIso(d.data().updatedAt),
        }))
      );
    },
    () => {
      onData(
        DEFAULT_MARKETPLACE_CATEGORIES.map((c) => ({
          ...c,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
      );
    }
  );
}

export async function seedDefaultCategoriesIfEmpty(): Promise<void> {
  try {
    const existing = await getDocs(collection(db, 'categories'));
    if (!existing.empty) return;
    const batch = writeBatch(db);
    for (const c of DEFAULT_MARKETPLACE_CATEGORIES) {
      batch.set(doc(db, 'categories', c.id), {
        id: c.id,
        name: c.name,
        slug: c.slug,
        subcategories: c.subcategories,
        gstRatePct: c.gstRatePct,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'categories/seed');
  }
}

export async function saveCategory(
  category: Omit<CategoryRecord, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `categories/${category.id}`;
  try {
    const payload = {
      id: category.id,
      name: clampStr(category.name, 80),
      slug: makeSlug(category.slug || category.name),
      subcategories: category.subcategories.slice(0, 20).map((s) => clampStr(s, 60)).filter(Boolean),
      gstRatePct: Number(category.gstRatePct ?? 18),
      active: Boolean(category.active),
      updatedAt: serverTimestamp(),
    };
    if (isNew) {
      await setDoc(doc(db, 'categories', category.id), {
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'categories', category.id), payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCategoryById(categoryId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'categories', categoryId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `categories/${categoryId}`);
  }
}

// ============================================================================
// User & Seller Provisioning (Single-Flight & Idempotent)
// ============================================================================
const inFlightProfileSync = new Map<string, Promise<UserProfile>>();
const inFlightSellerSetup = new Map<string, Promise<void>>();

export interface SellerOnboardingInput {
  fullName?: string;
  businessName: string;
  mobile?: string;
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  businessCategory?: string;
  gstin?: string;
  panNumber?: string;
  upiId?: string;
  storeName?: string;
  storeCategory?: string;
  storeDescription?: string;
  storeTagline?: string;
  returnPolicy?: string;
  shippingPolicy?: string;
  logoDataUrl?: string;
  bannerDataUrl?: string;
}

export async function syncUserProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  phone?: string;
  intendedRole?: 'customer' | 'seller';
  businessName?: string;
  sellerOnboarding?: SellerOnboardingInput;
}): Promise<UserProfile> {
  const existingPromise = inFlightProfileSync.get(params.uid);
  if (existingPromise) {
    return existingPromise;
  }

  const task = (async (): Promise<UserProfile> => {
    const path = `users/${params.uid}`;
    const userRef = doc(db, 'users', params.uid);

    let snap;
    try {
      snap = await getDoc(userRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }

    const isRootAdmin = params.email.trim().toLowerCase() === 'rahmananowar67@gmail.com';

    if (snap.exists()) {
      const data = snap.data();
      let resolvedRole = data.role as UserRole;

      if (isRootAdmin && resolvedRole !== 'admin') {
        try {
          await updateDoc(userRef, {
            role: 'admin',
            updatedAt: serverTimestamp(),
          });
          resolvedRole = 'admin';
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else if (resolvedRole === 'customer' && params.intendedRole === 'seller') {
        try {
          await updateDoc(userRef, {
            role: 'seller',
            ...(params.phone ? { phone: clampStr(params.phone, 40) } : {}),
            updatedAt: serverTimestamp(),
          });
          resolvedRole = 'seller';
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      }

      if (resolvedRole === 'seller' || resolvedRole === 'admin') {
        await ensureSellerWorkspace(
          params.uid,
          params.email,
          params.sellerOnboarding?.businessName ||
            params.businessName ||
            `${data.displayName || 'Independent'} Studio`,
          params.sellerOnboarding
        );
      }

      return {
        uid: data.uid,
        email: data.email,
        displayName: data.displayName,
        role: resolvedRole,
        phone: data.phone,
        shippingAddress: data.shippingAddress,
        city: data.city,
        state: data.state,
        pinCode: data.pinCode,
        avatarUrl: data.avatarUrl,
        preferredLanguage: data.preferredLanguage ? sanitizeLanguage(data.preferredLanguage) : undefined,
        preferredCurrency: data.preferredCurrency ? sanitizeCurrency(data.preferredCurrency) : undefined,
        status: data.status,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    }

    const role: UserRole = isRootAdmin
      ? 'admin'
      : params.intendedRole === 'seller'
      ? 'seller'
      : 'customer';

    const cleanDisplayName =
      clampStr(
        params.sellerOnboarding?.fullName || params.displayName || params.email.split('@')[0],
        BLUEPRINT_LIMITS.MAX_NAME
      ) || 'User';

    const profilePayload: Record<string, unknown> = {
      uid: params.uid,
      email: clampStr(params.email, BLUEPRINT_LIMITS.MAX_EMAIL),
      displayName: cleanDisplayName,
      role,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const cleanAvatar = clampStr(params.avatarUrl, 480);
    if (cleanAvatar) {
      profilePayload.avatarUrl = cleanAvatar;
    }
    const cleanPhone = clampStr(params.sellerOnboarding?.mobile || params.phone, 40);
    if (cleanPhone) {
      profilePayload.phone = cleanPhone;
    }
    if (params.sellerOnboarding?.address) {
      profilePayload.shippingAddress = clampStr(params.sellerOnboarding.address, 300);
    }
    if (params.sellerOnboarding?.city) {
      profilePayload.city = clampStr(params.sellerOnboarding.city, 80);
    }
    if (params.sellerOnboarding?.state) {
      profilePayload.state = clampStr(params.sellerOnboarding.state, 80);
    }
    if (params.sellerOnboarding?.pinCode) {
      profilePayload.pinCode = clampStr(params.sellerOnboarding.pinCode, 12);
    }

    try {
      await setDoc(userRef, profilePayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }

    if (role === 'seller' || role === 'admin') {
      await ensureSellerWorkspace(
        params.uid,
        params.email,
        params.sellerOnboarding?.businessName || params.businessName || `${cleanDisplayName} Studio`,
        params.sellerOnboarding
      );
    }

    return {
      uid: params.uid,
      email: profilePayload.email as string,
      displayName: cleanDisplayName,
      role,
      phone: cleanPhone || undefined,
      avatarUrl: cleanAvatar || undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  })();

  inFlightProfileSync.set(params.uid, task);
  try {
    return await task;
  } finally {
    inFlightProfileSync.delete(params.uid);
  }
}

export async function updateUserPreferences(
  uid: string,
  prefs: { preferredLanguage?: SupportedLanguage; preferredCurrency?: SupportedCurrency }
): Promise<void> {
  try {
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (prefs.preferredLanguage) patch.preferredLanguage = sanitizeLanguage(prefs.preferredLanguage);
    if (prefs.preferredCurrency) patch.preferredCurrency = sanitizeCurrency(prefs.preferredCurrency);
    await updateDoc(doc(db, 'users', uid), patch);
  } catch {
    // Non-fatal if user profile isn't created yet
  }
}

export async function saveCustomerAddressProfile(
  uid: string,
  profile: {
    displayName: string;
    phone: string;
    shippingAddress: string;
    city: string;
    state: string;
    pinCode: string;
  }
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: clampStr(profile.displayName, BLUEPRINT_LIMITS.MAX_NAME),
      phone: clampStr(profile.phone, 40),
      shippingAddress: clampStr(profile.shippingAddress, 300),
      city: clampStr(profile.city, 80),
      state: clampStr(profile.state, 80),
      pinCode: clampStr(profile.pinCode, 12),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function ensureSellerWorkspace(
  uid: string,
  email: string,
  businessName: string,
  onboarding?: SellerOnboardingInput
): Promise<void> {
  const existingSetup = inFlightSellerSetup.get(uid);
  if (existingSetup) {
    return existingSetup;
  }

  const task = (async (): Promise<void> => {
    const cleanBiz = clampStr(onboarding?.businessName || businessName, 100) || 'Independent Studio';
    const safeBiz = cleanBiz.length >= 2 ? cleanBiz : `${cleanBiz} Studio`;
    const isRootAdmin = email.trim().toLowerCase() === 'rahmananowar67@gmail.com';
    const settings = await getPlatformSettingsOnce();
    const initialSellerStatus =
      isRootAdmin || !settings.requireSellerApproval ? 'approved' : 'pending';

    const sellerPath = `sellers/${uid}`;
    const sellerRef = doc(db, 'sellers', uid);
    try {
      const sellerSnap = await getDoc(sellerRef);
      if (!sellerSnap.exists()) {
        const sellerDoc: Record<string, unknown> = {
          uid,
          businessName: safeBiz,
          email: clampStr(email, BLUEPRINT_LIMITS.MAX_EMAIL),
          plan: 'starter',
          status: initialSellerStatus,
          payoutAccount: onboarding?.upiId || 'Pending UPI / Bank setup',
          commissionRate: settings.starterCommissionRate ?? 0.05,
          totalRevenueCents: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (onboarding?.fullName) sellerDoc.fullName = clampStr(onboarding.fullName, 120);
        if (onboarding?.mobile) sellerDoc.mobile = clampStr(onboarding.mobile, 20);
        if (onboarding?.address) sellerDoc.address = clampStr(onboarding.address, 300);
        if (onboarding?.city) sellerDoc.city = clampStr(onboarding.city, 80);
        if (onboarding?.state) sellerDoc.state = clampStr(onboarding.state, 80);
        if (onboarding?.pinCode) sellerDoc.pinCode = clampStr(onboarding.pinCode, 12);
        if (onboarding?.businessCategory) {
          sellerDoc.businessCategory = clampStr(onboarding.businessCategory, 80);
        }
        if (onboarding?.gstin) sellerDoc.gstin = clampStr(onboarding.gstin.toUpperCase(), 20);
        if (onboarding?.panNumber) sellerDoc.panNumber = clampStr(onboarding.panNumber.toUpperCase(), 20);
        if (onboarding?.upiId) sellerDoc.upiId = clampStr(onboarding.upiId, 100);
        await setDoc(sellerRef, sellerDoc);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, sellerPath);
    }

    const subId = sanitizeId(`sub-${uid}`);
    const subPath = `subscriptions/${subId}`;
    const subRef = doc(db, 'subscriptions', subId);
    try {
      const subSnap = await getDoc(subRef);
      if (!subSnap.exists()) {
        await setDoc(subRef, {
          id: subId,
          sellerId: uid,
          sellerName: safeBiz,
          planId: 'starter',
          monthlyPriceCents: settings.starterPriceCents ?? 0,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, subPath);
    }

    const storeId = sanitizeId(`store-${uid.slice(0, 16)}`);
    const storePath = `stores/${storeId}`;
    const storeRef = doc(db, 'stores', storeId);
    const storeTitle = clampStr(onboarding?.storeName || safeBiz, 100);
    const locParts = [onboarding?.city, onboarding?.state].filter(Boolean);
    const locationStr = locParts.length > 0 ? locParts.join(', ') : 'Bengaluru, Karnataka';

    try {
      const storeSnap = await getDoc(storeRef);
      if (!storeSnap.exists()) {
        const storeDoc: Record<string, unknown> = {
          id: storeId,
          ownerId: uid,
          name: storeTitle,
          slug: makeSlug(storeTitle),
          category: clampStr(onboarding?.storeCategory || onboarding?.businessCategory || 'Home & Living', 60),
          tagline: clampStr(
            onboarding?.storeTagline || 'Crafted Indian goods delivered across PIN codes.',
            BLUEPRINT_LIMITS.MAX_TAGLINE
          ),
          description: clampStr(
            onboarding?.storeDescription ||
              `Welcome to ${storeTitle}, an independent Indian seller on SellerFlow AI.`,
            1000
          ),
          accentColor: '#1D4ED8',
          layoutStyle: 'editorial',
          location: clampStr(locationStr, 80),
          status: initialSellerStatus === 'approved' ? 'active' : 'pending',
          rating: 5.0,
          productCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (onboarding?.address) storeDoc.address = clampStr(onboarding.address, 300);
        if (onboarding?.city) storeDoc.city = clampStr(onboarding.city, 80);
        if (onboarding?.state) storeDoc.state = clampStr(onboarding.state, 80);
        if (onboarding?.pinCode) storeDoc.pinCode = clampStr(onboarding.pinCode, 12);
        storeDoc.contactEmail = clampStr(email, 200);
        if (onboarding?.mobile) storeDoc.contactPhone = clampStr(onboarding.mobile, 30);
        storeDoc.returnPolicy = clampStr(
          onboarding?.returnPolicy || '7-day replacement for transit damage or manufacturing defects.',
          600
        );
        storeDoc.shippingPolicy = clampStr(
          onboarding?.shippingPolicy || 'Dispatched within 48 business hours with live courier tracking.',
          600
        );
        if (onboarding?.gstin) storeDoc.gstin = clampStr(onboarding.gstin.toUpperCase(), 20);
        if (onboarding?.logoDataUrl) storeDoc.logoDataUrl = onboarding.logoDataUrl.slice(0, BLUEPRINT_LIMITS.MAX_IMAGE_BYTES);
        if (onboarding?.bannerDataUrl) storeDoc.bannerDataUrl = onboarding.bannerDataUrl.slice(0, BLUEPRINT_LIMITS.MAX_IMAGE_BYTES);
        await setDoc(storeRef, storeDoc);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, storePath);
    }
  })();

  inFlightSellerSetup.set(uid, task);
  try {
    await task;
  } finally {
    inFlightSellerSetup.delete(uid);
  }
}

export async function upgradeCustomerToSeller(
  uid: string,
  email: string,
  businessName: string,
  onboarding?: SellerOnboardingInput
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      role: 'seller',
      ...(onboarding?.mobile ? { phone: clampStr(onboarding.mobile, 40) } : {}),
      ...(onboarding?.address ? { shippingAddress: clampStr(onboarding.address, 300) } : {}),
      ...(onboarding?.city ? { city: clampStr(onboarding.city, 80) } : {}),
      ...(onboarding?.state ? { state: clampStr(onboarding.state, 80) } : {}),
      ...(onboarding?.pinCode ? { pinCode: clampStr(onboarding.pinCode, 12) } : {}),
      updatedAt: serverTimestamp(),
    });
    await ensureSellerWorkspace(uid, email, businessName, onboarding);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updateSellerProfileAndPayout(
  uid: string,
  patch: Partial<
    Pick<
      SellerAccount,
      | 'fullName'
      | 'businessName'
      | 'mobile'
      | 'address'
      | 'city'
      | 'state'
      | 'pinCode'
      | 'businessCategory'
      | 'gstin'
      | 'panNumber'
      | 'payoutAccount'
      | 'upiId'
      | 'bankAccountName'
      | 'bankAccountNumber'
      | 'ifscCode'
    >
  >
): Promise<void> {
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.fullName !== undefined) clean.fullName = clampStr(patch.fullName, 120);
    if (patch.businessName !== undefined && patch.businessName.trim().length >= 2) {
      clean.businessName = clampStr(patch.businessName, 120);
    }
    if (patch.mobile !== undefined) clean.mobile = clampStr(patch.mobile, 20);
    if (patch.address !== undefined) clean.address = clampStr(patch.address, 300);
    if (patch.city !== undefined) clean.city = clampStr(patch.city, 80);
    if (patch.state !== undefined) clean.state = clampStr(patch.state, 80);
    if (patch.pinCode !== undefined) clean.pinCode = clampStr(patch.pinCode, 12);
    if (patch.businessCategory !== undefined) clean.businessCategory = clampStr(patch.businessCategory, 80);
    if (patch.gstin !== undefined) clean.gstin = clampStr(patch.gstin.toUpperCase(), 20);
    if (patch.panNumber !== undefined) clean.panNumber = clampStr(patch.panNumber.toUpperCase(), 20);
    if (patch.payoutAccount !== undefined) clean.payoutAccount = clampStr(patch.payoutAccount, 120);
    if (patch.upiId !== undefined) clean.upiId = clampStr(patch.upiId, 100);
    if (patch.bankAccountName !== undefined) clean.bankAccountName = clampStr(patch.bankAccountName, 120);
    if (patch.bankAccountNumber !== undefined) clean.bankAccountNumber = clampStr(patch.bankAccountNumber, 40);
    if (patch.ifscCode !== undefined) clean.ifscCode = clampStr(patch.ifscCode.toUpperCase(), 20);
    await updateDoc(doc(db, 'sellers', uid), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `sellers/${uid}`);
  }
}

// ============================================================================
// Development Sample Catalog Bootstrap & Separation (Admin-controlled)
// ============================================================================
export async function seedMarketplaceIfEmpty(): Promise<boolean> {
  try {
    const existingStores = await getDocs(query(collection(db, 'stores'), where('status', '==', 'active')));
    if (!existingStores.empty) {
      return false;
    }

    const storeBatch = writeBatch(db);
    for (const store of SEED_STORES) {
      storeBatch.set(doc(db, 'stores', store.id), {
        ...store,
        isSample: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await storeBatch.commit();

    const prodBatch = writeBatch(db);
    for (const product of SEED_PRODUCTS) {
      prodBatch.set(doc(db, 'products', product.id), {
        ...product,
        isSample: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await prodBatch.commit();
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'stores/seed');
  }
}

export async function clearSampleMarketplaceData(): Promise<number> {
  try {
    let deleted = 0;
    const sampleStoreIds = new Set(SEED_STORES.map((s) => s.id));
    const sampleProductIds = new Set(SEED_PRODUCTS.map((p) => p.id));

    const storesSnap = await getDocs(collection(db, 'stores'));
    for (const d of storesSnap.docs) {
      if (d.data().isSample === true || sampleStoreIds.has(d.id)) {
        await deleteDoc(d.ref);
        deleted++;
      }
    }

    const prodsSnap = await getDocs(collection(db, 'products'));
    for (const d of prodsSnap.docs) {
      if (d.data().isSample === true || sampleProductIds.has(d.id)) {
        await deleteDoc(d.ref);
        deleted++;
      }
    }
    return deleted;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'stores/sample-cleanup');
  }
}

export async function syncSampleCatalogMedia(): Promise<{ stores: number; products: number; categories: number }> {
  try {
    const storeBatch = writeBatch(db);
    for (const store of SEED_STORES) {
      storeBatch.set(doc(db, 'stores', store.id), {
        ...store,
        isSample: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await storeBatch.commit();

    const prodBatch = writeBatch(db);
    for (const product of SEED_PRODUCTS) {
      prodBatch.set(doc(db, 'products', product.id), {
        ...product,
        isSample: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await prodBatch.commit();

    const catBatch = writeBatch(db);
    for (const c of DEFAULT_MARKETPLACE_CATEGORIES) {
      catBatch.set(doc(db, 'categories', c.id), {
        id: c.id,
        name: c.name,
        slug: c.slug,
        subcategories: c.subcategories,
        gstRatePct: c.gstRatePct,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await catBatch.commit();

    return {
      stores: SEED_STORES.length,
      products: SEED_PRODUCTS.length,
      categories: DEFAULT_MARKETPLACE_CATEGORIES.length,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'products/sync-sample');
  }
}

// ============================================================================
// Public Catalog Subscriptions & Reviews
// ============================================================================
export function subscribeActiveStores(
  onData: (stores: Store[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'stores'), where('status', '==', 'active'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          ...(data as Omit<Store, 'createdAt' | 'updatedAt'>),
          id: d.id,
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
        };
      });
      onData(items);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'stores');
    }
  );
}

export function subscribePublishedProducts(
  onData: (products: Product[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'products'), where('published', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => {
          const data = d.data();
          return hydrateProductDefaults({
            ...(data as Omit<Product, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(data.createdAt),
            updatedAt: toIso(data.updatedAt),
          });
        })
        .filter((p) => !p.moderationStatus || p.moderationStatus === 'published');
      onData(items);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'products');
    }
  );
}

export function subscribeProductReviews(
  productId: string,
  onData: (reviews: ReviewRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'reviews'), where('productId', '==', productId));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs
          .map((d) => ({
            ...(d.data() as Omit<ReviewRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
  );
}

export async function submitProductReview(params: {
  product: Product;
  customer: UserProfile;
  rating: number;
  title: string;
  comment: string;
  verifiedPurchase: boolean;
}): Promise<void> {
  const reviewId = sanitizeId(`rev-${params.product.id.slice(0, 20)}-${params.customer.uid.slice(0, 20)}-${Date.now().toString(36)}`);
  try {
    await setDoc(doc(db, 'reviews', reviewId), {
      id: reviewId,
      productId: params.product.id,
      storeId: params.product.storeId,
      sellerId: params.product.sellerId,
      customerId: params.customer.uid,
      customerName: clampStr(params.customer.displayName, 120),
      rating: Math.min(5, Math.max(1, Math.round(params.rating))),
      title: clampStr(params.title, 120),
      comment: clampStr(params.comment, 1000),
      verifiedPurchase: Boolean(params.verifiedPurchase),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `reviews/${reviewId}`);
  }
}

export async function loadAssetsByIds(assetIds: string[]): Promise<AssetFile[]> {
  if (!assetIds || assetIds.length === 0) return [];
  const results: AssetFile[] = [];
  for (const id of assetIds.slice(0, 8)) {
    try {
      const snap = await getDoc(doc(db, 'assets', id));
      if (snap.exists()) {
        const d = snap.data();
        results.push({
          ...(d as Omit<AssetFile, 'createdAt'>),
          id: snap.id,
          createdAt: toIso(d.createdAt),
        });
      }
    } catch {
      // Ignore missing or deleted assets cleanly
    }
  }
  return results;
}

// ============================================================================
// Seller Scoped Subscriptions & Actions
// ============================================================================
export function subscribeSellerAccount(
  uid: string,
  onData: (seller: SellerAccount | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'sellers', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const d = snap.data();
      onData({
        ...(d as Omit<SellerAccount, 'createdAt' | 'updatedAt'>),
        createdAt: toIso(d.createdAt),
        updatedAt: toIso(d.updatedAt),
      });
    },
    (err) => handleFirestoreError(err, OperationType.GET, `sellers/${uid}`)
  );
}

export function subscribeSellerStores(
  uid: string,
  onData: (stores: Store[]) => void
): Unsubscribe {
  const q = query(collection(db, 'stores'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<Store, 'createdAt' | 'updatedAt'>),
          id: d.id,
          createdAt: toIso(d.data().createdAt),
          updatedAt: toIso(d.data().updatedAt),
        }))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'stores')
  );
}

export function subscribeSellerProducts(
  uid: string,
  onData: (products: Product[]) => void
): Unsubscribe {
  const q = query(collection(db, 'products'), where('sellerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) =>
          hydrateProductDefaults({
            ...(d.data() as Omit<Product, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          })
        )
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'products')
  );
}

export function subscribeSellerOrders(
  uid: string,
  onData: (orders: Order[]) => void
): Unsubscribe {
  const q = query(collection(db, 'orders'), where('sellerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs
          .map((d) => ({
            ...(d.data() as Omit<Order, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
  );
}

export function subscribeSellerCRM(
  uid: string,
  onData: (customers: CustomerCRM[]) => void
): Unsubscribe {
  const q = query(collection(db, 'customers'), where('sellerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<CustomerCRM, 'createdAt' | 'updatedAt'>),
          id: d.id,
          createdAt: toIso(d.data().createdAt),
          updatedAt: toIso(d.data().updatedAt),
        }))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'customers')
  );
}

export function subscribeSellerAssets(
  uid: string,
  onData: (assets: AssetFile[]) => void
): Unsubscribe {
  const q = query(collection(db, 'assets'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<AssetFile, 'createdAt'>),
          id: d.id,
          createdAt: toIso(d.data().createdAt),
        }))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'assets')
  );
}

export function subscribeSellerPayments(
  uid: string,
  onData: (payments: PaymentRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'payments'), where('sellerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs
          .map((d) => ({
            ...(d.data() as Omit<PaymentRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
  );
}

export function subscribeSellerCommissions(
  uid: string,
  onData: (items: CommissionRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'commissions'), where('sellerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs
          .map((d) => ({
            ...(d.data() as Omit<CommissionRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'commissions')
  );
}

export function subscribeSellerPayouts(
  uid: string,
  onData: (items: PayoutRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'payouts'), where('sellerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs
          .map((d) => ({
            ...(d.data() as Omit<PayoutRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'payouts')
  );
}

export async function requestSellerPayout(params: {
  sellerId: string;
  storeName: string;
  amountCents: number;
  method: PayoutRecord['method'];
  payoutAccount: string;
  notes?: string;
}): Promise<void> {
  const payoutId = sanitizeId(`payreq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`);
  try {
    await setDoc(doc(db, 'payouts', payoutId), {
      id: payoutId,
      sellerId: params.sellerId,
      storeName: clampStr(params.storeName, 120),
      amountCents: Math.max(100, Math.round(params.amountCents)),
      method: clampStr(params.method, 60),
      payoutAccount: clampStr(params.payoutAccount, 140),
      status: 'requested',
      notes: clampStr(params.notes, 400),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `payouts/${payoutId}`);
  }
}

// ============================================================================
// Customer Scoped Subscriptions, Wishlist, Disputes, Refunds & Checkout
// ============================================================================
export function subscribeCustomerOrders(
  uid: string,
  onData: (orders: Order[]) => void
): Unsubscribe {
  const q = query(collection(db, 'orders'), where('customerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs
          .map((d) => ({
            ...(d.data() as Omit<Order, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
  );
}

export function subscribeCustomerWishlist(
  uid: string,
  onData: (items: WishlistItem[]) => void
): Unsubscribe {
  const q = query(collection(db, 'wishlists'), where('customerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<WishlistItem, 'createdAt'>),
          id: d.id,
          createdAt: toIso(d.data().createdAt),
        }))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'wishlists')
  );
}

export async function toggleWishlistItem(
  customerId: string,
  product: Product,
  isSaved: boolean
): Promise<void> {
  const wishId = sanitizeId(`wish-${customerId.slice(0, 24)}-${product.id.slice(0, 48)}`);
  try {
    if (isSaved) {
      await deleteDoc(doc(db, 'wishlists', wishId));
    } else {
      const payload: Record<string, unknown> = {
        id: wishId,
        customerId,
        productId: product.id,
        storeId: product.storeId,
        title: clampStr(product.title, 140),
        priceCents: Math.max(0, Math.round(product.priceCents)),
        createdAt: serverTimestamp(),
      };
      if (product.imageDataUrl) {
        payload.imageDataUrl = product.imageDataUrl.slice(0, BLUEPRINT_LIMITS.MAX_IMAGE_BYTES);
      }
      await setDoc(doc(db, 'wishlists', wishId), payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `wishlists/${wishId}`);
  }
}

export function subscribeCustomerRefunds(
  uid: string,
  onData: (refunds: RefundRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'refunds'), where('customerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs
          .map((d) => ({
            ...(d.data() as Omit<RefundRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'refunds')
  );
}

export async function requestOrderRefund(params: {
  order: Order;
  reason: string;
}): Promise<void> {
  const refundId = sanitizeId(`ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`);
  try {
    await setDoc(doc(db, 'refunds', refundId), {
      id: refundId,
      orderId: params.order.id,
      customerId: params.order.customerId,
      customerName: clampStr(params.order.customerName, 120),
      sellerId: params.order.sellerId,
      storeId: params.order.storeId,
      amountCents: Math.max(0, Math.round(params.order.totalCents)),
      reason: clampStr(params.reason, 400),
      status: 'requested',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `refunds/${refundId}`);
  }
}

export function subscribeCustomerDisputes(
  uid: string,
  onData: (disputes: DisputeRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'disputes'), where('customerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs
          .map((d) => ({
            ...(d.data() as Omit<DisputeRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'disputes')
  );
}

export async function openOrderDispute(params: {
  order: Order;
  subject: string;
  description: string;
}): Promise<void> {
  const disputeId = sanitizeId(`dsp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`);
  try {
    await setDoc(doc(db, 'disputes', disputeId), {
      id: disputeId,
      orderId: params.order.id,
      customerId: params.order.customerId,
      customerName: clampStr(params.order.customerName, 120),
      sellerId: params.order.sellerId,
      storeName: clampStr(params.order.storeName, 120),
      subject: clampStr(params.subject, 140),
      description: clampStr(params.description, 1000),
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `disputes/${disputeId}`);
  }
}

export function subscribeNotifications(
  uid: string,
  onData: (items: NotificationItem[]) => void
): Unsubscribe {
  const q = query(collection(db, 'notifications'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs
          .map((d) => ({
            ...(d.data() as Omit<NotificationItem, 'createdAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
  );
}

export async function markNotificationRead(notifId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notifId), { read: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${notifId}`);
  }
}

// ============================================================================
// Seller CRUD Operations
// ============================================================================
export async function saveStore(
  store: Omit<Store, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `stores/${store.id}`;
  try {
    const cleanPayload: Record<string, unknown> = {
      name: clampStr(store.name, 100),
      slug: makeSlug(store.slug || store.name),
      category: clampStr(store.category, 60),
      tagline: clampStr(store.tagline, BLUEPRINT_LIMITS.MAX_TAGLINE),
      description: clampStr(store.description, 1000),
      accentColor: store.accentColor || '#1D4ED8',
      layoutStyle: store.layoutStyle || 'editorial',
      location: clampStr(store.location || 'India', 80),
      status: store.status,
      productCount: Math.max(0, Math.round(store.productCount || 0)),
      updatedAt: serverTimestamp(),
    };
    if (store.address !== undefined) cleanPayload.address = clampStr(store.address, 300);
    if (store.city !== undefined) cleanPayload.city = clampStr(store.city, 80);
    if (store.state !== undefined) cleanPayload.state = clampStr(store.state, 80);
    if (store.pinCode !== undefined) cleanPayload.pinCode = clampStr(store.pinCode, 12);
    if (store.contactEmail !== undefined) cleanPayload.contactEmail = clampStr(store.contactEmail, 200);
    if (store.contactPhone !== undefined) cleanPayload.contactPhone = clampStr(store.contactPhone, 30);
    if (store.returnPolicy !== undefined) cleanPayload.returnPolicy = clampStr(store.returnPolicy, 600);
    if (store.shippingPolicy !== undefined) cleanPayload.shippingPolicy = clampStr(store.shippingPolicy, 600);
    if (store.gstin !== undefined) cleanPayload.gstin = clampStr(store.gstin.toUpperCase(), 20);
    if (store.logoDataUrl !== undefined) {
      cleanPayload.logoDataUrl = store.logoDataUrl.slice(0, BLUEPRINT_LIMITS.MAX_IMAGE_BYTES);
    }
    if (store.bannerDataUrl !== undefined) {
      cleanPayload.bannerDataUrl = store.bannerDataUrl.slice(0, BLUEPRINT_LIMITS.MAX_IMAGE_BYTES);
    }

    if (isNew) {
      await setDoc(doc(db, 'stores', store.id), {
        id: store.id,
        ownerId: store.ownerId,
        rating: store.rating ?? 5.0,
        ...cleanPayload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'stores', store.id), cleanPayload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveProduct(
  product: Omit<Product, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `products/${product.id}`;
  try {
    const modStatus: ProductModerationStatus =
      product.moderationStatus || (product.published ? 'published' : 'draft');
    const cleanPayload: Record<string, unknown> = {
      storeName: clampStr(product.storeName, 100),
      title: clampStr(product.title, BLUEPRINT_LIMITS.MAX_TITLE),
      sku: clampStr(product.sku, 60),
      category: clampStr(product.category, 60),
      subcategory: clampStr(product.subcategory, 60),
      description: clampStr(product.description, BLUEPRINT_LIMITS.MAX_DESC),
      bulletPoints: (product.bulletPoints ?? []).slice(0, 10).map((b) => clampStr(b, 200)).filter(Boolean),
      seoKeywords: (product.seoKeywords ?? []).slice(0, 15).map((k) => clampStr(k, 60)).filter(Boolean),
      tags: (product.tags ?? []).slice(0, 15).map((t) => clampStr(t, 40)).filter(Boolean),
      priceCents: Math.max(0, Math.round(product.priceCents)),
      originalPriceCents: Math.max(0, Math.round(product.originalPriceCents ?? product.priceCents)),
      discountPct: Math.min(99, Math.max(0, Number(product.discountPct ?? 0))),
      currency: sanitizeCurrency(product.currency),
      shippingFeeCents: Math.max(0, Math.round(product.shippingFeeCents ?? 0)),
      gstRatePct: Math.min(50, Math.max(0, Number(product.gstRatePct ?? 18))),
      costCents: Math.max(0, Math.round(product.costCents)),
      stock: Math.max(0, Math.round(product.stock)),
      reorderPoint: Math.max(0, Math.round(product.reorderPoint)),
      published: modStatus === 'published' ? Boolean(product.published) : false,
      moderationStatus: modStatus,
      sizes: (product.sizes ?? []).slice(0, 15).map((s) => clampStr(s, 40)).filter(Boolean),
      colors: (product.colors ?? []).slice(0, 15).map((c) => clampStr(c, 40)).filter(Boolean),
      weightGrams: Math.max(0, Math.round(product.weightGrams ?? 0)),
      dimensions: clampStr(product.dimensions, 80),
      shippingInfo: clampStr(product.shippingInfo, 300),
      returnPolicy: clampStr(product.returnPolicy, 400),
      visualVariant: clampStr(product.visualVariant || 'vessel', 40),
      imageAssetIds: (product.imageAssetIds ?? []).slice(0, 8),
      updatedAt: serverTimestamp(),
    };

    if (product.imageDataUrl) {
      cleanPayload.imageDataUrl = product.imageDataUrl.slice(0, BLUEPRINT_LIMITS.MAX_IMAGE_BYTES);
    }

    if (isNew) {
      await setDoc(doc(db, 'products', product.id), {
        id: product.id,
        storeId: product.storeId,
        sellerId: product.sellerId,
        ...cleanPayload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'products', product.id), cleanPayload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteProductById(productId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `products/${productId}`);
  }
}

export async function adjustProductStock(productId: string, newStock: number): Promise<void> {
  try {
    await updateDoc(doc(db, 'products', productId), {
      stock: Math.max(0, Math.round(newStock)),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `products/${productId}`);
  }
}

export async function saveCustomerCRM(
  record: Omit<CustomerCRM, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `customers/${record.id}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'customers', record.id), {
        id: record.id,
        sellerId: record.sellerId,
        customerUid: record.customerUid || '',
        name: clampStr(record.name, BLUEPRINT_LIMITS.MAX_NAME),
        email: clampStr(record.email, BLUEPRINT_LIMITS.MAX_EMAIL),
        segment: record.segment,
        totalOrders: Math.max(0, Math.round(record.totalOrders)),
        lifetimeSpendCents: Math.max(0, Math.round(record.lifetimeSpendCents)),
        notes: clampStr(record.notes, BLUEPRINT_LIMITS.MAX_NOTES),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'customers', record.id), {
        name: clampStr(record.name, BLUEPRINT_LIMITS.MAX_NAME),
        email: clampStr(record.email, BLUEPRINT_LIMITS.MAX_EMAIL),
        segment: record.segment,
        totalOrders: Math.max(0, Math.round(record.totalOrders)),
        lifetimeSpendCents: Math.max(0, Math.round(record.lifetimeSpendCents)),
        notes: clampStr(record.notes, BLUEPRINT_LIMITS.MAX_NOTES),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function advanceOrderStatus(
  order: Order,
  nextStatus: OrderStatus,
  shipmentMeta?: {
    trackingCode?: string;
    courierName?: string;
    awbCode?: string;
    shiprocketOrderId?: string;
    shipmentStatus?: string;
    notes?: string;
  }
): Promise<void> {
  const path = `orders/${order.id}`;
  try {
    const patch: Record<string, unknown> = {
      status: nextStatus,
      trackingCode: shipmentMeta?.trackingCode || shipmentMeta?.awbCode || order.trackingCode,
      paymentStatus: nextStatus === 'delivered' ? 'paid' : order.paymentStatus,
      updatedAt: serverTimestamp(),
    };
    if (shipmentMeta?.courierName) patch.courierName = clampStr(shipmentMeta.courierName, 80);
    if (shipmentMeta?.awbCode) patch.awbCode = clampStr(shipmentMeta.awbCode, 80);
    if (shipmentMeta?.shiprocketOrderId) {
      patch.shiprocketOrderId = clampStr(shipmentMeta.shiprocketOrderId, 80);
    }
    if (shipmentMeta?.shipmentStatus) {
      patch.shipmentStatus = clampStr(shipmentMeta.shipmentStatus, 80);
    }
    if (shipmentMeta?.notes) {
      patch.notes = clampStr(shipmentMeta.notes, 400);
    }

    await updateDoc(doc(db, 'orders', order.id), patch);

    const notifId = sanitizeId(`notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    await setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      userId: order.customerId,
      title: `Order ${order.id.slice(-6).toUpperCase()} ${nextStatus.replace(/_/g, ' ')}`,
      message: shipmentMeta?.notes
        ? `${order.storeName}: ${shipmentMeta.notes}`
        : `Your order from ${order.storeName} is now ${nextStatus.replace(/_/g, ' ')}. Tracking: ${patch.trackingCode}`,
      category: 'order',
      read: false,
      createdAt: serverTimestamp(),
    });

    if (order.customerMobile) {
      void fetch('/api/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toPhone: order.customerMobile,
          bodyText: `SellerFlow AI: Order ${order.invoiceNumber || order.id.slice(-6)} from ${order.storeName} is ${nextStatus.replace(/_/g, ' ')}. Tracking: ${String(patch.trackingCode)}`,
        }),
      }).catch(() => undefined);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function cancelCustomerOrder(orderId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
  }
}

// ============================================================================
// Coupons & Discount Validation
// ============================================================================
export function subscribeActiveCoupons(onData: (coupons: CouponRecord[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'coupons'), where('active', '==', true)),
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<CouponRecord, 'createdAt' | 'updatedAt'>),
          id: d.id,
          createdAt: toIso(d.data().createdAt),
          updatedAt: toIso(d.data().updatedAt),
        }))
      );
    },
    () => onData([])
  );
}

export function subscribeAllCoupons(onData: (coupons: CouponRecord[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'coupons'),
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<CouponRecord, 'createdAt' | 'updatedAt'>),
          id: d.id,
          createdAt: toIso(d.data().createdAt),
          updatedAt: toIso(d.data().updatedAt),
        }))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'coupons')
  );
}

export async function saveCoupon(
  coupon: Omit<CouponRecord, 'createdAt' | 'updatedAt' | 'usageCount'> & { usageCount?: number },
  isNew: boolean
): Promise<void> {
  const cleanCode = clampStr(coupon.code.toUpperCase().replace(/[^A-Z0-9_-]/g, ''), 32);
  const path = `coupons/${coupon.id}`;
  try {
    const payload = {
      id: coupon.id,
      code: cleanCode,
      description: clampStr(coupon.description, 140),
      discountType: coupon.discountType,
      discountValue: Math.max(0, Number(coupon.discountValue) || 0),
      minOrderCents: Math.max(0, Math.round(coupon.minOrderCents || 0)),
      maxDiscountCents: Math.max(0, Math.round(coupon.maxDiscountCents || 0)),
      active: Boolean(coupon.active),
      usageCount: Math.max(0, Math.round(coupon.usageCount ?? 0)),
      updatedAt: serverTimestamp(),
    };
    if (isNew) {
      await setDoc(doc(db, 'coupons', coupon.id), {
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'coupons', coupon.id), payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCouponById(couponId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'coupons', couponId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `coupons/${couponId}`);
  }
}

export async function validateCouponCode(
  code: string,
  subtotalInrCents: number
): Promise<{ valid: boolean; coupon?: CouponRecord; discountCents: number; message: string }> {
  const clean = code.trim().toUpperCase();
  if (!clean) {
    return { valid: false, discountCents: 0, message: 'Enter a coupon code.' };
  }
  const snap = await getDocs(
    query(collection(db, 'coupons'), where('active', '==', true), where('code', '==', clean))
  );
  if (snap.empty) {
    return { valid: false, discountCents: 0, message: `Coupon "${clean}" is invalid or inactive.` };
  }
  const d = snap.docs[0];
  const coupon: CouponRecord = {
    ...(d.data() as Omit<CouponRecord, 'createdAt' | 'updatedAt'>),
    id: d.id,
    createdAt: toIso(d.data().createdAt),
    updatedAt: toIso(d.data().updatedAt),
  };
  if (subtotalInrCents < coupon.minOrderCents) {
    return {
      valid: false,
      discountCents: 0,
      message: `Minimum order of ₹${(coupon.minOrderCents / 100).toFixed(0)} required for ${clean}.`,
    };
  }
  let discountCents =
    coupon.discountType === 'percent'
      ? Math.round(subtotalInrCents * (coupon.discountValue / 100))
      : Math.round(coupon.discountValue * 100);
  if (coupon.maxDiscountCents > 0) {
    discountCents = Math.min(discountCents, coupon.maxDiscountCents);
  }
  discountCents = Math.max(0, Math.min(discountCents, subtotalInrCents));
  return {
    valid: true,
    coupon,
    discountCents,
    message: `Applied ${clean} (-₹${(discountCents / 100).toFixed(2)})`,
  };
}

// ============================================================================
// Checkout & Payment Gateway Integration (Razorpay Verified + COD)
// ============================================================================
const inFlightCheckoutLocks = new Set<string>();

export async function executeCustomerCheckout(params: {
  user: UserProfile;
  cart: CartItem[];
  shippingAddress: string;
  customerMobile: string;
  city: string;
  state: string;
  pinCode: string;
  paymentMethod: 'Razorpay (UPI / Card / NetBanking)' | 'Cash on Delivery';
  gstRatePct?: number;
  freeShippingThresholdCents?: number;
  defaultShippingCents?: number;
  commissionRateOverride?: number;
  displayCurrency?: SupportedCurrency;
  fxRates?: FxRatesMap;
  coupon?: CouponRecord | null;
  razorpayVerifier?: (orderSummary: {
    groupOrderId: string;
    totalCents: number;
  }) => Promise<{
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }>;
}): Promise<Order[]> {
  if (params.cart.length === 0) {
    throw new Error('Shopping cart is empty.');
  }
  if (inFlightCheckoutLocks.has(params.user.uid)) {
    throw new Error('Checkout already in progress. Please wait for your order confirmation.');
  }

  for (const item of params.cart) {
    if (item.product.stock <= 0) {
      throw new Error(`"${item.product.title}" is currently out of stock.`);
    }
    if (item.quantity > item.product.stock) {
      throw new Error(
        `Only ${item.product.stock} unit(s) available for "${item.product.title}". Reduce cart quantity.`
      );
    }
  }

  inFlightCheckoutLocks.add(params.user.uid);
  try {
    const defaultGstRatePct = params.gstRatePct ?? 18;
    const freeThreshold = params.freeShippingThresholdCents ?? 99900;
    const baseShipping = params.defaultShippingCents ?? 7900;
    const fxRates = params.fxRates ?? DEFAULT_FX_RATES;
    const displayCurrency = sanitizeCurrency(params.displayCurrency);
    const fxRateApplied = fxRates[displayCurrency] > 0 ? fxRates[displayCurrency] : 1;

    // Group cart items by sellerId + storeId so each merchant receives a separate order & GST invoice
    const grouped = new Map<string, CartItem[]>();
    for (const item of params.cart) {
      const key = `${item.product.sellerId}__${item.product.storeId}`;
      const list = grouped.get(key) ?? [];
      list.push(item);
      grouped.set(key, list);
    }

    const totalCartInrSubtotal = params.cart.reduce((sum, i) => {
      const itemCurrency = sanitizeCurrency(i.product.currency);
      return sum + convertCurrencyMinorUnits(i.product.priceCents, itemCurrency, 'INR', fxRates) * i.quantity;
    }, 0);

    let totalCouponDiscount = 0;
    if (params.coupon && totalCartInrSubtotal >= params.coupon.minOrderCents) {
      totalCouponDiscount =
        params.coupon.discountType === 'percent'
          ? Math.round(totalCartInrSubtotal * (params.coupon.discountValue / 100))
          : Math.round(params.coupon.discountValue * 100);
      if (params.coupon.maxDiscountCents > 0) {
        totalCouponDiscount = Math.min(totalCouponDiscount, params.coupon.maxDiscountCents);
      }
      totalCouponDiscount = Math.max(0, Math.min(totalCouponDiscount, totalCartInrSubtotal));
    }

    const createdOrders: Order[] = [];

    for (const [, items] of grouped.entries()) {
      const lead = items[0].product;

      const itemBreakups = items.map((i) => {
        const itemCurrency = sanitizeCurrency(i.product.currency);
        const unitPriceInrCents = convertCurrencyMinorUnits(i.product.priceCents, itemCurrency, 'INR', fxRates);
        const lineTotalInr = unitPriceInrCents * i.quantity;
        const itemGst = i.product.gstRatePct ?? defaultGstRatePct;
        const itemShippingInr =
          i.product.shippingFeeCents !== undefined
            ? convertCurrencyMinorUnits(i.product.shippingFeeCents, itemCurrency, 'INR', fxRates)
            : undefined;
        return {
          item: i,
          unitPriceInrCents,
          lineTotalInr,
          itemTaxInr: Math.round(lineTotalInr * (itemGst / 100)),
          itemShippingInr,
        };
      });

      const subtotalCents = itemBreakups.reduce((sum, b) => sum + b.lineTotalInr, 0);
      const hasExplicitShipping = itemBreakups.some((b) => b.itemShippingInr !== undefined);
      const maxExplicitShipping = itemBreakups.reduce(
        (max, b) => Math.max(max, b.itemShippingInr ?? 0),
        0
      );
      const shippingCents =
        subtotalCents >= freeThreshold
          ? 0
          : hasExplicitShipping
          ? maxExplicitShipping
          : baseShipping;

      const groupDiscountCents =
        totalCouponDiscount > 0 && totalCartInrSubtotal > 0
          ? Math.min(subtotalCents, Math.round((subtotalCents / totalCartInrSubtotal) * totalCouponDiscount))
          : 0;

      const taxCents = itemBreakups.reduce((sum, b) => sum + b.itemTaxInr, 0);
      const gstRatePct =
        subtotalCents > 0
          ? Math.min(50, Math.max(0, Number(((taxCents / subtotalCents) * 100).toFixed(2))))
          : defaultGstRatePct;
      const totalCents = Math.max(100, subtotalCents - groupDiscountCents + shippingCents + taxCents);

      const orderId = sanitizeId(`ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
      const trackingCode = `SF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const invoiceNumber = `INV-${new Date().getFullYear()}-${orderId.slice(-6).toUpperCase()}`;
      const commissionRate = params.commissionRateOverride ?? 0.05;

    let gatewayRef = '';
    let paymentStatus: 'paid' | 'pending' = 'pending';
    let paymentRecordStatus: PaymentRecord['status'] = 'pending';
    let platformFeeCents = Math.round(totalCents * commissionRate);
    let netPayoutCents = Math.max(0, totalCents - platformFeeCents);
    let razorpayOrderId: string | undefined;
    let razorpayPaymentId: string | undefined;

    if (params.paymentMethod === 'Cash on Delivery') {
      const codRes = await fetch('/api/payments/cod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          amountCents: totalCents,
          commissionRate,
        }),
      });
      const codData = await codRes.json();
      if (!codRes.ok) {
        throw new Error(codData.error || 'Cash on Delivery validation failed.');
      }
      gatewayRef = codData.gatewayRef;
      paymentStatus = 'pending';
      paymentRecordStatus = 'pending';
      platformFeeCents = codData.platformFeeCents;
      netPayoutCents = codData.netPayoutCents;
    } else {
      if (!params.razorpayVerifier) {
        throw new Error(
          'Razorpay checkout handler is unavailable. Configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET or choose Cash on Delivery.'
        );
      }
      const rzpProof = await params.razorpayVerifier({ groupOrderId: orderId, totalCents });
      const verifyRes = await fetch('/api/payments/razorpay/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rzpProof,
          amountCents: totalCents,
          commissionRate,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified) {
        throw new Error(verifyData.error || 'Razorpay signature verification failed.');
      }
      gatewayRef = verifyData.gatewayRef;
      paymentStatus = 'paid';
      paymentRecordStatus = 'captured';
      platformFeeCents = verifyData.platformFeeCents;
      netPayoutCents = verifyData.netPayoutCents;
      razorpayOrderId = rzpProof.razorpay_order_id;
      razorpayPaymentId = rzpProof.razorpay_payment_id;
    }

    const orderDoc: Record<string, unknown> = {
      id: orderId,
      customerId: params.user.uid,
      customerName: clampStr(params.user.displayName, BLUEPRINT_LIMITS.MAX_NAME),
      customerEmail: clampStr(params.user.email, BLUEPRINT_LIMITS.MAX_EMAIL),
      customerMobile: clampStr(params.customerMobile, 20),
      sellerId: lead.sellerId,
      storeId: lead.storeId,
      storeName: clampStr(lead.storeName, 100),
      items: itemBreakups.map(({ item: i, unitPriceInrCents }) => ({
        productId: i.product.id,
        title: clampStr(i.product.title, 120),
        sku: clampStr(i.product.sku, 40),
        quantity: i.quantity,
        unitPriceCents: unitPriceInrCents,
        ...(i.selectedSize ? { selectedSize: i.selectedSize } : {}),
        ...(i.selectedColor ? { selectedColor: i.selectedColor } : {}),
      })),
      subtotalCents,
      shippingCents,
      taxCents,
      gstRatePct,
      discountCents: groupDiscountCents,
      ...(params.coupon ? { couponCode: params.coupon.code } : {}),
      totalCents,
      currency: 'INR',
      displayCurrency,
      fxRateApplied,
      paymentMethod: clampStr(params.paymentMethod, 60),
      paymentStatus,
      status: 'pending',
      trackingCode,
      invoiceNumber,
      shippingAddress: clampStr(params.shippingAddress, BLUEPRINT_LIMITS.MAX_ADDRESS),
      city: clampStr(params.city, 80),
      state: clampStr(params.state, 80),
      pinCode: clampStr(params.pinCode, 12),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (razorpayOrderId) orderDoc.razorpayOrderId = razorpayOrderId;
    if (razorpayPaymentId) orderDoc.razorpayPaymentId = razorpayPaymentId;

    try {
      await setDoc(doc(db, 'orders', orderId), orderDoc);

      const paymentId = sanitizeId(`pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
      await setDoc(doc(db, 'payments', paymentId), {
        id: paymentId,
        orderId,
        customerId: params.user.uid,
        sellerId: lead.sellerId,
        storeId: lead.storeId,
        amountCents: totalCents,
        platformFeeCents,
        netPayoutCents,
        currency: 'INR',
        method: clampStr(params.paymentMethod, 60),
        status: paymentRecordStatus,
        gatewayRef,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const commId = sanitizeId(`com-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`);
      await setDoc(doc(db, 'commissions', commId), {
        id: commId,
        orderId,
        paymentId,
        sellerId: lead.sellerId,
        storeId: lead.storeId,
        storeName: clampStr(lead.storeName, 100),
        grossAmountCents: totalCents,
        commissionRate,
        commissionCents: platformFeeCents,
        netSellerCents: netPayoutCents,
        status: paymentStatus === 'paid' ? 'earned' : 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const item of items) {
        if (item.product.stock > 0) {
          const nextStock = Math.max(0, item.product.stock - item.quantity);
          await updateDoc(doc(db, 'products', item.product.id), {
            stock: nextStock,
            updatedAt: serverTimestamp(),
          });
        }
      }

      const crmId = sanitizeId(`crm-${lead.sellerId.slice(0, 24)}-${params.user.uid.slice(0, 24)}`);
      const crmRef = doc(db, 'customers', crmId);
      const crmSnap = await getDoc(crmRef);
      if (crmSnap.exists()) {
        const prev = crmSnap.data();
        const nextOrders = (prev.totalOrders || 0) + 1;
        const nextSpend = (prev.lifetimeSpendCents || 0) + totalCents;
        await updateDoc(crmRef, {
          totalOrders: nextOrders,
          lifetimeSpendCents: nextSpend,
          segment: nextSpend >= 1500000 ? 'vip' : nextOrders >= 2 ? 'repeat' : 'new',
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(crmRef, {
          id: crmId,
          sellerId: lead.sellerId,
          customerUid: params.user.uid,
          name: clampStr(params.user.displayName, BLUEPRINT_LIMITS.MAX_NAME),
          email: clampStr(params.user.email, BLUEPRINT_LIMITS.MAX_EMAIL),
          segment: totalCents >= 1500000 ? 'vip' : 'new',
          totalOrders: 1,
          lifetimeSpendCents: totalCents,
          notes: `Mobile: ${params.customerMobile} · ${params.city}, ${params.state}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const notifId = sanitizeId(`notif-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        userId: params.user.uid,
        title: `Order Placed (${invoiceNumber})`,
        message: `Ref ${gatewayRef} from ${lead.storeName} · Tracking ${trackingCode}`,
        category: 'order',
        read: false,
        createdAt: serverTimestamp(),
      });

      const sellerNotifId = sanitizeId(`notif-s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`);
      await setDoc(doc(db, 'notifications', sellerNotifId), {
        id: sellerNotifId,
        userId: lead.sellerId,
        title: `New Order Received (${invoiceNumber})`,
        message: `${params.user.displayName} placed an order (₹${(totalCents / 100).toFixed(2)})`,
        category: 'order',
        read: false,
        createdAt: serverTimestamp(),
      });

      void fetch('/api/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toPhone: params.customerMobile,
          bodyText: `SellerFlow AI: Order ${invoiceNumber} confirmed with ${lead.storeName}. Total: ₹${(totalCents / 100).toFixed(2)}. Tracking: ${trackingCode}`,
        }),
      }).catch(() => undefined);

      createdOrders.push({
        ...(orderDoc as unknown as Omit<Order, 'createdAt' | 'updatedAt'>),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `orders/${orderId}`);
    }
    }

    if (params.coupon) {
      try {
        await updateDoc(doc(db, 'coupons', params.coupon.id), {
          usageCount: (params.coupon.usageCount || 0) + 1,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Non-fatal coupon counter sync
      }
    }

    return createdOrders;
  } finally {
    inFlightCheckoutLocks.delete(params.user.uid);
  }
}

// ============================================================================
// File Storage (Compressed Asset Upload to Firestore /assets)
// ============================================================================
export async function compressImageToWebP(
  file: File,
  maxDim = 900,
  quality = 0.78
): Promise<{ dataUrl: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas compression unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/webp', quality);
        resolve({ dataUrl, sizeBytes: dataUrl.length });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadAssetFile(params: {
  ownerId: string;
  storeId?: string;
  file: File;
}): Promise<AssetFile> {
  let compressed = await compressImageToWebP(params.file, 900, 0.78);
  if (compressed.sizeBytes > BLUEPRINT_LIMITS.MAX_IMAGE_BYTES) {
    compressed = await compressImageToWebP(params.file, 680, 0.65);
  }
  if (compressed.sizeBytes > BLUEPRINT_LIMITS.MAX_IMAGE_BYTES) {
    throw new Error('Compressed asset exceeds 340KB limit. Please choose a smaller image.');
  }
  const assetId = sanitizeId(`ast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  try {
    await setDoc(doc(db, 'assets', assetId), {
      id: assetId,
      ownerId: params.ownerId,
      storeId: params.storeId || '',
      name: clampStr(params.file.name, BLUEPRINT_LIMITS.MAX_NAME),
      mimeType: 'image/webp',
      sizeBytes: compressed.sizeBytes,
      dataUrl: compressed.dataUrl,
      isPublic: true,
      createdAt: serverTimestamp(),
    });
    return {
      id: assetId,
      ownerId: params.ownerId,
      storeId: params.storeId,
      name: clampStr(params.file.name, BLUEPRINT_LIMITS.MAX_NAME),
      mimeType: 'image/webp',
      sizeBytes: compressed.sizeBytes,
      dataUrl: compressed.dataUrl,
      isPublic: true,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `assets/${assetId}`);
  }
}

export async function deleteAssetFile(assetId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'assets', assetId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `assets/${assetId}`);
  }
}

export async function updateSellerSubscriptionPlan(
  sellerId: string,
  sellerName: string,
  planId: 'starter' | 'growth' | 'pro' | 'enterprise',
  monthlyPriceCents: number,
  commissionRate: number
): Promise<void> {
  try {
    await updateDoc(doc(db, 'sellers', sellerId), {
      plan: planId,
      updatedAt: serverTimestamp(),
    });
    const subId = sanitizeId(`sub-${sellerId}`);
    const subRef = doc(db, 'subscriptions', subId);
    const subSnap = await getDoc(subRef);
    if (subSnap.exists()) {
      await updateDoc(subRef, {
        planId,
        monthlyPriceCents,
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(subRef, {
        id: subId,
        sellerId,
        sellerName: clampStr(sellerName, 120),
        planId,
        monthlyPriceCents,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    void commissionRate;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `subscriptions/${sellerId}`);
  }
}

// ============================================================================
// Admin Management Subscriptions & Governance Controls
// ============================================================================
export function subscribeAllAdminData(callbacks: {
  onUsers: (users: UserProfile[]) => void;
  onSellers: (sellers: SellerAccount[]) => void;
  onStores: (stores: Store[]) => void;
  onProducts: (products: Product[]) => void;
  onPayments: (payments: PaymentRecord[]) => void;
  onSubscriptions: (subs: SubscriptionRecord[]) => void;
  onOrders: (orders: Order[]) => void;
  onCommissions: (commissions: CommissionRecord[]) => void;
  onPayouts: (payouts: PayoutRecord[]) => void;
  onRefunds: (refunds: RefundRecord[]) => void;
  onDisputes: (disputes: DisputeRecord[]) => void;
}): Unsubscribe {
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      collection(db, 'users'),
      (snap) =>
        callbacks.onUsers(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<UserProfile, 'createdAt' | 'updatedAt'>),
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'sellers'),
      (snap) =>
        callbacks.onSellers(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<SellerAccount, 'createdAt' | 'updatedAt'>),
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'sellers')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'stores'),
      (snap) =>
        callbacks.onStores(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<Store, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'stores')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'products'),
      (snap) =>
        callbacks.onProducts(
          snap.docs.map((d) =>
            hydrateProductDefaults({
              ...(d.data() as Omit<Product, 'createdAt' | 'updatedAt'>),
              id: d.id,
              createdAt: toIso(d.data().createdAt),
              updatedAt: toIso(d.data().updatedAt),
            })
          )
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'products')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'payments'),
      (snap) =>
        callbacks.onPayments(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<PaymentRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'subscriptions'),
      (snap) =>
        callbacks.onSubscriptions(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<SubscriptionRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'subscriptions')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'orders'),
      (snap) =>
        callbacks.onOrders(
          snap.docs
            .map((d) => ({
              ...(d.data() as Omit<Order, 'createdAt' | 'updatedAt'>),
              id: d.id,
              createdAt: toIso(d.data().createdAt),
              updatedAt: toIso(d.data().updatedAt),
            }))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'commissions'),
      (snap) =>
        callbacks.onCommissions(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<CommissionRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'commissions')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'payouts'),
      (snap) =>
        callbacks.onPayouts(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<PayoutRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'payouts')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'refunds'),
      (snap) =>
        callbacks.onRefunds(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<RefundRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'refunds')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'disputes'),
      (snap) =>
        callbacks.onDisputes(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<DisputeRecord, 'createdAt' | 'updatedAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
            updatedAt: toIso(d.data().updatedAt),
          }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'disputes')
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function adminUpdateUserStatus(
  uid: string,
  status: 'active' | 'suspended',
  role?: UserRole
): Promise<void> {
  try {
    const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
    if (role) patch.role = role;
    await updateDoc(doc(db, 'users', uid), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function adminUpdateSellerStatus(
  uid: string,
  status: SellerAccount['status'],
  commissionRate?: number,
  rejectionReason?: string
): Promise<void> {
  try {
    const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
    if (typeof commissionRate === 'number') patch.commissionRate = commissionRate;
    if (rejectionReason !== undefined) patch.rejectionReason = clampStr(rejectionReason, 300);
    await updateDoc(doc(db, 'sellers', uid), patch);

    // Activate or suspend seller's storefront alongside verification status
    const storeSnap = await getDocs(query(collection(db, 'stores'), where('ownerId', '==', uid)));
    for (const st of storeSnap.docs) {
      if (status === 'approved' && st.data().status === 'pending') {
        await updateDoc(st.ref, { status: 'active', updatedAt: serverTimestamp() });
      } else if (status === 'suspended' || status === 'rejected') {
        await updateDoc(st.ref, { status: 'suspended', updatedAt: serverTimestamp() });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `sellers/${uid}`);
  }
}

export async function adminUpdateStoreStatus(
  storeId: string,
  status: Store['status']
): Promise<void> {
  try {
    await updateDoc(doc(db, 'stores', storeId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `stores/${storeId}`);
  }
}

export async function adminModerateProduct(
  productId: string,
  moderationStatus: ProductModerationStatus,
  rejectionReason?: string
): Promise<void> {
  try {
    const patch: Record<string, unknown> = {
      moderationStatus,
      published: moderationStatus === 'published',
      updatedAt: serverTimestamp(),
    };
    if (rejectionReason !== undefined) {
      patch.rejectionReason = clampStr(rejectionReason, 300);
    }
    await updateDoc(doc(db, 'products', productId), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `products/${productId}`);
  }
}

export async function adminUpdateOrderStatus(
  orderId: string,
  status: OrderStatus,
  paymentStatus?: Order['paymentStatus']
): Promise<void> {
  try {
    const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
    if (paymentStatus) patch.paymentStatus = paymentStatus;
    await updateDoc(doc(db, 'orders', orderId), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function adminUpdatePaymentStatus(
  paymentId: string,
  status: PaymentRecord['status']
): Promise<void> {
  try {
    await updateDoc(doc(db, 'payments', paymentId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `payments/${paymentId}`);
  }
}

export async function adminUpdateSubscriptionStatus(
  subId: string,
  status: SubscriptionRecord['status']
): Promise<void> {
  try {
    await updateDoc(doc(db, 'subscriptions', subId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `subscriptions/${subId}`);
  }
}

export async function adminUpdateCommissionStatus(
  commId: string,
  status: CommissionRecord['status']
): Promise<void> {
  try {
    await updateDoc(doc(db, 'commissions', commId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `commissions/${commId}`);
  }
}

export async function adminUpdatePayoutStatus(
  payoutId: string,
  status: PayoutRecord['status'],
  bankRef?: string,
  notes?: string
): Promise<void> {
  try {
    const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
    if (bankRef !== undefined) patch.bankRef = clampStr(bankRef, 120);
    if (notes !== undefined) patch.notes = clampStr(notes, 400);
    await updateDoc(doc(db, 'payouts', payoutId), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `payouts/${payoutId}`);
  }
}

export async function adminUpdateRefundStatus(
  refundId: string,
  status: RefundRecord['status'],
  adminNotes?: string
): Promise<void> {
  try {
    const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
    if (adminNotes !== undefined) patch.adminNotes = clampStr(adminNotes, 400);
    await updateDoc(doc(db, 'refunds', refundId), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `refunds/${refundId}`);
  }
}

export async function adminUpdateDisputeStatus(
  disputeId: string,
  status: DisputeRecord['status'],
  resolution?: string
): Promise<void> {
  try {
    const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
    if (resolution !== undefined) patch.resolution = clampStr(resolution, 600);
    await updateDoc(doc(db, 'disputes', disputeId), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `disputes/${disputeId}`);
  }
}

// ============================================================================
// Audit Logs & Admin Broadcast Notifications
// ============================================================================
export async function logAuditEvent(params: {
  actorUid: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  severity?: 'info' | 'warning' | 'critical';
}): Promise<void> {
  const logId = sanitizeId(`aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      id: logId,
      actorUid: params.actorUid,
      actorEmail: clampStr(params.actorEmail, 200),
      actorRole: params.actorRole,
      action: clampStr(params.action, 100),
      targetType: clampStr(params.targetType, 60),
      targetId: clampStr(params.targetId, 128),
      summary: clampStr(params.summary, 400),
      severity: params.severity || 'info',
      createdAt: serverTimestamp(),
    });
  } catch {
    // Audit logging must not crash user workflow
  }
}

export function subscribeAuditLogs(onData: (logs: AuditLogRecord[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'auditLogs'),
    (snap) => {
      onData(
        snap.docs
          .map((d) => ({
            ...(d.data() as Omit<AuditLogRecord, 'createdAt'>),
            id: d.id,
            createdAt: toIso(d.data().createdAt),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
  );
}

export async function adminBroadcastNotification(params: {
  recipientUids: string[];
  title: string;
  message: string;
  category?: NotificationItem['category'];
}): Promise<number> {
  let sent = 0;
  for (const uid of params.recipientUids.slice(0, 50)) {
    const notifId = sanitizeId(`notif-b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`);
    try {
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        userId: uid,
        title: clampStr(params.title, 140),
        message: clampStr(params.message, 400),
        category: params.category || 'system',
        read: false,
        createdAt: serverTimestamp(),
      });
      sent += 1;
    } catch {
      // Skip invalid uid
    }
  }
  return sent;
}


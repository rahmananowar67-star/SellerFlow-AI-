export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

export const DEFAULT_MARKETPLACE_CATEGORIES: {
  id: string;
  name: string;
  slug: string;
  subcategories: string[];
  gstRatePct: number;
}[] = [
  {
    id: 'cat-bottles-hydration',
    name: 'Bottles & Hydration',
    slug: 'bottles-hydration',
    subcategories: ['Insulated Steel Bottles', 'Copper Flasks', 'Travel Tumblers', 'Sport Hydration'],
    gstRatePct: 18,
  },
  {
    id: 'cat-footwear-shoes',
    name: 'Footwear & Shoes',
    slug: 'footwear-shoes',
    subcategories: ['Leather Sneakers', 'Formal Derby & Oxfords', 'Running Shoes', 'Handcrafted Loafers'],
    gstRatePct: 12,
  },
  {
    id: 'cat-fashion-apparel',
    name: 'Fashion & Apparel',
    slug: 'fashion-apparel',
    subcategories: ['Handloom Kurtas', 'Cotton Shirts', 'Ethnic Wear', 'Handwoven Sarees'],
    gstRatePct: 12,
  },
  {
    id: 'cat-electronics-audio',
    name: 'Electronics & Audio',
    slug: 'electronics-audio',
    subcategories: ['Headphones & Earbuds', 'Desktop DAC & Amps', 'Speakers & Monitors', 'Smart Gadgets'],
    gstRatePct: 18,
  },
  {
    id: 'cat-beauty-cosmetics',
    name: 'Beauty & Cosmetics',
    slug: 'beauty-cosmetics',
    subcategories: ['Serums & Actives', 'Botanical Oils', 'Creams & Moisturizers', 'Cleansers & Toners'],
    gstRatePct: 18,
  },
  {
    id: 'cat-home-living',
    name: 'Home & Living',
    slug: 'home-living',
    subcategories: ['Ceramics & Tableware', 'Lighting & Lamps', 'Stoneware Vases', 'Coffee & Tea Cups'],
    gstRatePct: 12,
  },
  {
    id: 'cat-watches-accessories',
    name: 'Watches & Accessories',
    slug: 'watches-accessories',
    subcategories: ['Automatic Watches', 'GMT Timepieces', 'Leather Tote Bags', 'Watch Straps & Cases'],
    gstRatePct: 18,
  },
];

export const COURIER_PARTNERS = [
  'Shiprocket Surface',
  'Delhivery Express',
  'BlueDart Air',
  'DTDC Plus',
  'Xpressbees',
  'India Post Speed Post',
] as const;

export const ORDER_LIFECYCLE_STEPS = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
] as const;

export function isValidIndianMobile(mobile: string): boolean {
  const digits = mobile.replace(/[\s\-+]/g, '').replace(/^91/, '');
  return /^[6-9][0-9]{9}$/.test(digits);
}

export function normalizeIndianMobile(mobile: string): string {
  return mobile.replace(/[\s\-+]/g, '').replace(/^91/, '').slice(0, 10);
}

export function isValidIndianPinCode(pin: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pin.trim());
}

export function isValidGstin(gstin: string): boolean {
  if (!gstin.trim()) return true;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    gstin.trim().toUpperCase()
  );
}

export function computeGstBreakup(subtotalPaise: number, gstRatePct = 18): {
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalTaxPaise: number;
} {
  const totalTaxPaise = Math.round(subtotalPaise * (gstRatePct / 100));
  const cgstPaise = Math.floor(totalTaxPaise / 2);
  const sgstPaise = totalTaxPaise - cgstPaise;
  return {
    taxableValuePaise: subtotalPaise,
    cgstPaise,
    sgstPaise,
    totalTaxPaise,
  };
}

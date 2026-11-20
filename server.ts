import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured in server environment secrets. Add GEMINI_API_KEY to enable AI studios.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getRazorpayConfig(): { keyId: string; keySecret: string } | null {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

function getShiprocketConfig(): { email: string; password: string } | null {
  const email = (process.env.SHIPROCKET_EMAIL || '').trim();
  const password = (process.env.SHIPROCKET_PASSWORD || '').trim();
  if (!email || !password) return null;
  return { email, password };
}

function getWhatsAppConfig(): { accessToken: string; phoneNumberId: string } | null {
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId };
}

const processedRazorpayEvents = new Set<string>();
const aiRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkAiRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = aiRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    aiRateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 30) {
    return false;
  }
  entry.count += 1;
  return true;
}

let cachedShiprocketToken: { token: string; expiresAt: number } | null = null;

async function getShiprocketToken(): Promise<string> {
  const cfg = getShiprocketConfig();
  if (!cfg) {
    throw new Error(
      'Shiprocket credentials are not configured. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in server environment secrets.'
    );
  }
  if (cachedShiprocketToken && Date.now() < cachedShiprocketToken.expiresAt) {
    return cachedShiprocketToken.token;
  }
  const authRes = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  const data = (await authRes.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!authRes.ok || !data.token) {
    throw new Error(data.message || 'Shiprocket authentication failed.');
  }
  // Shiprocket tokens typically remain valid for 10 days; cache conservatively for 6 hours
  cachedShiprocketToken = {
    token: data.token,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
  };
  return data.token;
}

type FxRatesPayload = {
  base: 'INR';
  rates: { INR: number; USD: number; EUR: number };
  source: string;
  fetchedAt: string;
  isLive: boolean;
};

let cachedFxRates: { payload: FxRatesPayload; expiresAt: number } | null = null;
const FX_CACHE_TTL_MS = 30 * 60 * 1000;
const FALLBACK_INR_RATES = { INR: 1, USD: 0.0118, EUR: 0.0109 };

async function getLiveFxRates(forceRefresh = false): Promise<FxRatesPayload> {
  if (!forceRefresh && cachedFxRates && Date.now() < cachedFxRates.expiresAt) {
    return cachedFxRates.payload;
  }

  // Primary: open.er-api.com (no key required, updated daily/hourly)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://open.er-api.com/v6/latest/INR', { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as {
        result?: string;
        time_last_update_utc?: string;
        rates?: Record<string, number>;
      };
      const usd = Number(data?.rates?.USD);
      const eur = Number(data?.rates?.EUR);
      if (usd > 0 && eur > 0) {
        const payload: FxRatesPayload = {
          base: 'INR',
          rates: { INR: 1, USD: usd, EUR: eur },
          source: 'open.er-api.com',
          fetchedAt: new Date().toISOString(),
          isLive: true,
        };
        cachedFxRates = { payload, expiresAt: Date.now() + FX_CACHE_TTL_MS };
        return payload;
      }
    }
  } catch {
    // Fall through to secondary provider
  }

  // Secondary: Frankfurter (ECB reference rates)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.frankfurter.app/latest?from=INR&to=USD,EUR', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { rates?: Record<string, number> };
      const usd = Number(data?.rates?.USD);
      const eur = Number(data?.rates?.EUR);
      if (usd > 0 && eur > 0) {
        const payload: FxRatesPayload = {
          base: 'INR',
          rates: { INR: 1, USD: usd, EUR: eur },
          source: 'frankfurter.app',
          fetchedAt: new Date().toISOString(),
          isLive: true,
        };
        cachedFxRates = { payload, expiresAt: Date.now() + FX_CACHE_TTL_MS };
        return payload;
      }
    }
  } catch {
    // Fall back to last cached live rates or honest offline reference rates
  }

  if (cachedFxRates) {
    return { ...cachedFxRates.payload, isLive: false };
  }

  return {
    base: 'INR',
    rates: FALLBACK_INR_RATES,
    source: 'fallback-reference',
    fetchedAt: new Date().toISOString(),
    isLive: false,
  };
}

async function startServer() {
  const app = express();
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  app.use('/api/ai', (req: Request, res: Response, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkAiRateLimit(ip)) {
      res.status(429).json({
        error: 'AI rate limit exceeded (30 requests/minute). Please wait a moment before retrying.',
      });
      return;
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'sellerflow-ai', timestamp: new Date().toISOString() });
  });

  // Honest integration readiness endpoint (never exposes secrets)
  app.get('/api/integrations/status', (_req: Request, res: Response) => {
    const rzp = getRazorpayConfig();
    const sr = getShiprocketConfig();
    const wa = getWhatsAppConfig();
    const geminiConfigured = Boolean((process.env.GEMINI_API_KEY || '').trim());
    res.json({
      geminiConfigured,
      razorpayConfigured: Boolean(rzp),
      razorpayKeyId: rzp ? rzp.keyId : null,
      razorpayWebhookConfigured: Boolean((process.env.RAZORPAY_WEBHOOK_SECRET || '').trim()),
      upiSupported: Boolean(rzp),
      shiprocketConfigured: Boolean(sr),
      whatsappConfigured: Boolean(wa),
      whatsappWebhookConfigured: Boolean((process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim()),
      fxLiveSupported: true,
      codAvailable: true,
      currency: 'INR',
    });
  });

  app.post('/api/errors/log', (req: Request, res: Response) => {
    const { source, message, path: routePath } = req.body ?? {};
    console.warn('[SellerFlow Client Telemetry]', {
      source: String(source || 'client').slice(0, 60),
      message: String(message || 'unknown').slice(0, 400),
      path: String(routePath || '/').slice(0, 120),
      at: new Date().toISOString(),
    });
    res.json({ logged: true });
  });

  // Live INR-based multi-currency FX exchange rates (30-min cache)
  app.get('/api/currency/rates', async (req: Request, res: Response) => {
    const forceRefresh = req.query.refresh === '1';
    const payload = await getLiveFxRates(forceRefresh);
    res.json(payload);
  });

  app.get('/api/payments/config', (_req: Request, res: Response) => {
    const rzp = getRazorpayConfig();
    res.json({
      razorpayConfigured: Boolean(rzp),
      keyId: rzp ? rzp.keyId : null,
      currency: 'INR',
      codAvailable: true,
    });
  });

  // AI Engine: Indian Multi-Vendor Product Studio (Title, Description, Tags, SEO, Category, Marketing Copy & INR Pricing)
  app.post('/api/ai/product-studio', async (req: Request, res: Response) => {
    try {
      const { productIdea, category, targetAudience, costCents, tone } = req.body ?? {};
      if (!productIdea || typeof productIdea !== 'string' || productIdea.trim().length < 3) {
        res.status(400).json({ error: 'Please provide a concise product concept (at least 3 characters).' });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          configured: false,
          error: 'GEMINI_API_KEY is missing in environment secrets. Configure GEMINI_API_KEY to use the AI Product Studio.',
        });
        return;
      }

      const ai = getGeminiClient();
      const unitCostInr =
        typeof costCents === 'number' && costCents > 0 ? (costCents / 100).toFixed(2) : '650.00';

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Create a commercial-grade Indian e-commerce product listing for:
Product Concept: ${productIdea.trim()}
Preferred Category: ${category || 'Home & Living'}
Target Audience: ${targetAudience || 'Urban Indian online shoppers'}
Unit Landed Cost (INR): ₹${unitCostInr}
Brand Voice: ${tone || 'Refined editorial and factual'}`,
        config: {
          systemInstruction:
            'You are a senior Indian e-commerce merchandiser and pricing strategist. Produce crisp, factual, conversion-oriented product copy in Indian English with zero hype buzzwords. Suggest realistic Indian retail Selling Price and Original MRP in integer paise (1 INR = 100 paise) ensuring MRP >= Selling Price and healthy gross margin over the landed INR cost.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Concise product title under 75 characters.' },
              skuSuggestion: { type: Type.STRING, description: 'Clean uppercase alphanumeric SKU code.' },
              subtitle: { type: Type.STRING, description: 'Single-line material or specification summary.' },
              categorySuggestion: {
                type: Type.STRING,
                description: 'Best matching marketplace category (e.g. Home & Living, Electronics & Audio, Beauty & Apothecary, Fashion & Apparel, Watches & Horology, Gourmet & Tea).',
              },
              subcategorySuggestion: {
                type: Type.STRING,
                description: 'Concise product subcategory.',
              },
              description: {
                type: Type.STRING,
                description: '2-3 crisp factual paragraphs describing materials, dimensions, and utility.',
              },
              bulletPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Exactly 4 concise specification bullets.',
              },
              seoKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '6 high-intent Indian e-commerce search keywords.',
              },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '4 short storefront tags.',
              },
              marketingCopy: {
                type: Type.STRING,
                description: 'Ready-to-use 2-sentence promotional caption for WhatsApp/Instagram/storefront banner.',
              },
              suggestedPriceCents: {
                type: Type.INTEGER,
                description: 'Recommended selling price in integer paise (e.g. 199900 for ₹1,999).',
              },
              suggestedMrpCents: {
                type: Type.INTEGER,
                description: 'Recommended original MRP in integer paise (>= suggestedPriceCents).',
              },
              marginAssessment: {
                type: Type.STRING,
                description: 'Brief INR pricing rationale comparing cost, GST, and marketplace commission.',
              },
              merchandisingTip: {
                type: Type.STRING,
                description: 'Actionable photography or bundle suggestion.',
              },
            },
            required: [
              'title',
              'skuSuggestion',
              'subtitle',
              'categorySuggestion',
              'subcategorySuggestion',
              'description',
              'bulletPoints',
              'seoKeywords',
              'tags',
              'marketingCopy',
              'suggestedPriceCents',
              'suggestedMrpCents',
              'marginAssessment',
              'merchandisingTip',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ result: parsed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI Product Studio request failed.';
      res.status(500).json({ error: message });
    }
  });

  // AI Engine: Marketing Studio Multi-Channel Campaign Generator
  app.post('/api/ai/marketing-studio', async (req: Request, res: Response) => {
    try {
      const { productName, storeName, valueProposition, channel, objective } = req.body ?? {};
      if (!productName || typeof productName !== 'string' || productName.trim().length < 2) {
        res.status(400).json({ error: 'Please specify a product or collection name for the campaign.' });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          configured: false,
          error: 'GEMINI_API_KEY is missing in environment secrets.',
        });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Generate a structured Indian D2C marketing campaign kit:
Store Name: ${storeName || 'Independent Indian Brand'}
Featured Product: ${productName.trim()}
Value Proposition: ${valueProposition || 'Crafted materials with direct-to-consumer INR pricing'}
Primary Channel: ${channel || 'Multi-channel Launch'}
Campaign Objective: ${objective || 'First-time customer conversion'}`,
        config: {
          systemInstruction:
            'You are a performance marketing director for independent Indian retail brands. Write concrete, specific copy with clear product attributes and measurable hooks. Avoid cliché buzzwords like supercharge, elevate, or unlock.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              campaignTitle: { type: Type.STRING },
              emailSubject: { type: Type.STRING },
              emailBody: { type: Type.STRING },
              socialAdCopy: { type: Type.STRING },
              searchHeadlines: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              callToAction: { type: Type.STRING },
              targetPersonaNote: { type: Type.STRING },
            },
            required: [
              'campaignTitle',
              'emailSubject',
              'emailBody',
              'socialAdCopy',
              'searchHeadlines',
              'callToAction',
              'targetPersonaNote',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ result: parsed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI Marketing Studio request failed.';
      res.status(500).json({ error: message });
    }
  });

  // AI Engine: Seller Business & Inventory Insights (INR)
  app.post('/api/ai/business-insights', async (req: Request, res: Response) => {
    try {
      const { storeName, productCount, lowStockCount, totalOrders, revenueCents, topCategories } = req.body ?? {};
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          configured: false,
          error: 'GEMINI_API_KEY is missing in environment secrets.',
        });
        return;
      }
      const ai = getGeminiClient();
      const revenueInr = typeof revenueCents === 'number' ? (revenueCents / 100).toFixed(2) : '0.00';

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Analyze this Indian merchant's live commerce metrics and give 3 concrete operational recommendations:
Store: ${storeName || 'Merchant Store'}
Active Products: ${Number(productCount) || 0}
Low Stock SKUs: ${Number(lowStockCount) || 0}
Total Orders: ${Number(totalOrders) || 0}
Gross Revenue: ₹${revenueInr}
Categories: ${Array.isArray(topCategories) ? topCategories.join(', ') : 'General'}`,
        config: {
          systemInstruction:
            'You are an analytical Indian retail operations advisor. Provide brief, quantified recommendations grounded strictly in the provided store metrics using INR (₹).',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: { type: Type.STRING },
              priorityActions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              pricingOpportunity: { type: Type.STRING },
              inventoryAlertNote: { type: Type.STRING },
            },
            required: ['executiveSummary', 'priorityActions', 'pricingOpportunity', 'inventoryAlertNote'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ result: parsed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI Business Insights request failed.';
      res.status(500).json({ error: message });
    }
  });

  // AI Engine: Conversational Seller Operations Assistant
  app.post('/api/ai/seller-assistant', async (req: Request, res: Response) => {
    try {
      const { question, storeContext } = req.body ?? {};
      if (!question || typeof question !== 'string' || question.trim().length < 3) {
        res.status(400).json({ error: 'Please ask a specific question (at least 3 characters).' });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          configured: false,
          error: 'GEMINI_API_KEY is missing in environment secrets.',
        });
        return;
      }
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Store Context: ${JSON.stringify(storeContext ?? {}).slice(0, 1200)}
Merchant Question: ${question.trim()}`,
        config: {
          systemInstruction:
            'You are SellerFlow AI Merchant Operations Assistant for Indian D2C sellers. Answer concisely in clear bulleted actions covering INR pricing, GST slabs, Shiprocket dispatch, SKU optimization, or customer retention.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      res.json({ answer: (response.text ?? '').trim() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI Seller Assistant request failed.';
      res.status(500).json({ error: message });
    }
  });

  // ===========================================================================
  // Real Razorpay Payment Gateway Endpoints (No fake online payment success)
  // ===========================================================================
  app.post('/api/payments/razorpay/create-order', async (req: Request, res: Response) => {
    const { orderId, amountCents, currency, notes } = req.body ?? {};
    const targetCurrency = currency === 'USD' || currency === 'EUR' ? currency : 'INR';
    if (!orderId || typeof amountCents !== 'number' || amountCents < 100) {
      res.status(400).json({ error: 'Valid orderId and amountCents (>= 100 minor units) are required.' });
      return;
    }

    const rzp = getRazorpayConfig();
    if (!rzp) {
      res.status(503).json({
        configured: false,
        error:
          'Razorpay is not configured on this server. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment secrets to accept live UPI, Cards, and NetBanking payments—or choose Cash on Delivery.',
        missingKeys: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'],
      });
      return;
    }

    try {
      const authHeader = Buffer.from(`${rzp.keyId}:${rzp.keySecret}`).toString('base64');
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(amountCents),
          currency: targetCurrency,
          receipt: String(orderId).slice(0, 40),
          notes: typeof notes === 'object' && notes ? notes : { platform: 'SellerFlow AI' },
        }),
      });

      const data = (await rzpRes.json().catch(() => ({}))) as {
        id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        error?: { description?: string };
      };

      if (!rzpRes.ok || !data.id) {
        res.status(rzpRes.status || 502).json({
          configured: true,
          error: data.error?.description || 'Razorpay order creation failed.',
        });
        return;
      }

      res.json({
        configured: true,
        keyId: rzp.keyId,
        razorpayOrder: data,
      });
    } catch (err) {
      res.status(502).json({
        configured: true,
        error: err instanceof Error ? err.message : 'Unable to reach Razorpay API.',
      });
    }
  });

  app.post('/api/payments/razorpay/verify', (req: Request, res: Response) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amountCents, commissionRate } =
      req.body ?? {};
    const rzp = getRazorpayConfig();
    if (!rzp) {
      res.status(503).json({
        configured: false,
        verified: false,
        error: 'RAZORPAY_KEY_SECRET is not configured on the server.',
      });
      return;
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ verified: false, error: 'Missing Razorpay signature verification fields.' });
      return;
    }

    const expected = crypto
      .createHmac('sha256', rzp.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const actualBuf = Buffer.from(String(razorpay_signature), 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const isMatch =
      actualBuf.length === expectedBuf.length && crypto.timingSafeEqual(actualBuf, expectedBuf);

    if (!isMatch) {
      res.status(400).json({ verified: false, error: 'Razorpay payment signature verification failed.' });
      return;
    }

    const gross = typeof amountCents === 'number' && amountCents > 0 ? Math.round(amountCents) : 0;
    const rate = typeof commissionRate === 'number' && commissionRate >= 0 && commissionRate <= 0.5 ? commissionRate : 0.05;
    const platformFeeCents = Math.min(gross, Math.round(gross * rate));
    const netPayoutCents = Math.max(0, gross - platformFeeCents);

    res.json({
      verified: true,
      gatewayRef: String(razorpay_payment_id),
      status: 'captured',
      platformFeeCents,
      netPayoutCents,
      verifiedAt: new Date().toISOString(),
    });
  });

  app.post('/api/payments/razorpay/webhook', (req: Request, res: Response) => {
    const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
    if (!secret) {
      res.status(503).json({ error: 'RAZORPAY_WEBHOOK_SECRET is not configured.' });
      return;
    }
    const eventId = String(req.headers['x-razorpay-event-id'] || '');
    if (eventId && processedRazorpayEvents.has(eventId)) {
      res.json({ received: true, duplicate: true, eventId });
      return;
    }
    const signature = String(req.headers['x-razorpay-signature'] || '');
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody ??
      Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      res.status(400).json({ error: 'Invalid webhook signature.' });
      return;
    }
    if (eventId) {
      if (processedRazorpayEvents.size > 1000) {
        processedRazorpayEvents.clear();
      }
      processedRazorpayEvents.add(eventId);
    }
    res.json({ received: true, duplicate: false, event: req.body?.event || 'unknown' });
  });

  // Cash on Delivery (legitimate offline payment mode — sets paymentStatus = 'pending')
  app.post('/api/payments/cod', (req: Request, res: Response) => {
    const { orderId, amountCents, commissionRate } = req.body ?? {};
    if (!orderId || typeof amountCents !== 'number' || amountCents <= 0) {
      res.status(400).json({ error: 'Invalid COD payload: positive amountCents and orderId are required.' });
      return;
    }
    const rate = typeof commissionRate === 'number' && commissionRate >= 0 && commissionRate <= 0.5 ? commissionRate : 0.05;
    const platformFeeCents = Math.min(Math.round(amountCents), Math.round(amountCents * rate));
    const netPayoutCents = Math.max(0, Math.round(amountCents) - platformFeeCents);
    const gatewayRef = `COD-${String(orderId).slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    res.json({
      gatewayRef,
      status: 'pending',
      platformFeeCents,
      netPayoutCents,
      processedAt: new Date().toISOString(),
    });
  });

  // ===========================================================================
  // Real Shiprocket Logistics Integration (No fake live tracking)
  // ===========================================================================
  app.get('/api/shipping/status', (_req: Request, res: Response) => {
    const cfg = getShiprocketConfig();
    res.json({
      shiprocketConfigured: Boolean(cfg),
      manualDispatchSupported: true,
    });
  });

  app.post('/api/shipping/shiprocket/create-shipment', async (req: Request, res: Response) => {
    const cfg = getShiprocketConfig();
    if (!cfg) {
      res.status(503).json({
        configured: false,
        error:
          'Shiprocket API credentials (SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD) are not configured. Configure them in server secrets to book automated couriers, or use Manual Courier Dispatch.',
        missingKeys: ['SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD'],
      });
      return;
    }

    const { order } = req.body ?? {};
    if (!order || !order.id || !order.shippingAddress) {
      res.status(400).json({ error: 'Order payload with id and shippingAddress is required.' });
      return;
    }

    try {
      const token = await getShiprocketToken();
      const payload = {
        order_id: order.id,
        order_date: new Date().toISOString().slice(0, 16).replace('T', ' '),
        pickup_location: 'Primary',
        billing_customer_name: order.customerName || 'Customer',
        billing_last_name: '',
        billing_address: order.shippingAddress,
        billing_city: order.city || 'Bengaluru',
        billing_pincode: order.pinCode || '560001',
        billing_state: order.state || 'Karnataka',
        billing_country: 'India',
        billing_email: order.customerEmail,
        billing_phone: order.customerMobile || '9999999999',
        shipping_is_billing: true,
        order_items: Array.isArray(order.items)
          ? order.items.map((item: { title: string; sku: string; quantity: number; unitPriceCents: number }) => ({
              name: item.title,
              sku: item.sku,
              units: item.quantity,
              selling_price: Math.round((item.unitPriceCents || 0) / 100),
            }))
          : [],
        payment_method: order.paymentMethod === 'Cash on Delivery' ? 'COD' : 'Prepaid',
        sub_total: Math.round((order.totalCents || 0) / 100),
        length: 20,
        breadth: 15,
        height: 10,
        weight: 0.5,
      };

      const srRes = await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = (await srRes.json().catch(() => ({}))) as {
        order_id?: number;
        shipment_id?: number;
        awb_code?: string;
        courier_name?: string;
        status?: string;
        message?: string;
      };

      if (!srRes.ok || !data.order_id) {
        res.status(srRes.status || 502).json({
          configured: true,
          error: data.message || 'Shiprocket order booking failed.',
        });
        return;
      }

      res.json({
        configured: true,
        shiprocketOrderId: String(data.order_id),
        shipmentId: data.shipment_id ? String(data.shipment_id) : undefined,
        awbCode: data.awb_code || `SR-${data.order_id}`,
        courierName: data.courier_name || 'Shiprocket Assigned',
        shipmentStatus: data.status || 'NEW',
      });
    } catch (err) {
      res.status(502).json({
        configured: true,
        error: err instanceof Error ? err.message : 'Shiprocket API request failed.',
      });
    }
  });

  app.get('/api/shipping/shiprocket/track/:awb', async (req: Request, res: Response) => {
    const cfg = getShiprocketConfig();
    if (!cfg) {
      res.status(503).json({
        configured: false,
        error: 'Shiprocket live tracking requires SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in server environment secrets.',
      });
      return;
    }

    try {
      const token = await getShiprocketToken();
      const awb = encodeURIComponent(req.params.awb);
      const trackRes = await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await trackRes.json().catch(() => ({}));
      if (!trackRes.ok) {
        res.status(trackRes.status).json({ error: 'Unable to fetch Shiprocket AWB tracking.', details: data });
        return;
      }
      res.json({ configured: true, tracking: data });
    } catch (err) {
      res.status(502).json({
        configured: true,
        error: err instanceof Error ? err.message : 'Shiprocket tracking request failed.',
      });
    }
  });

  app.post('/api/shipping/shiprocket/cancel', async (req: Request, res: Response) => {
    const cfg = getShiprocketConfig();
    if (!cfg) {
      res.status(503).json({
        configured: false,
        error: 'Shiprocket cancellation requires SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in server secrets.',
      });
      return;
    }
    const { shiprocketOrderIds } = req.body ?? {};
    if (!Array.isArray(shiprocketOrderIds) || shiprocketOrderIds.length === 0) {
      res.status(400).json({ error: 'shiprocketOrderIds array is required.' });
      return;
    }
    try {
      const token = await getShiprocketToken();
      const srRes = await fetch('https://apiv2.shiprocket.in/v1/external/orders/cancel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: shiprocketOrderIds }),
      });
      const data = await srRes.json().catch(() => ({}));
      if (!srRes.ok) {
        res.status(srRes.status).json({ error: 'Unable to cancel Shiprocket shipment.', details: data });
        return;
      }
      res.json({ configured: true, cancelled: true, data });
    } catch (err) {
      res.status(502).json({
        configured: true,
        error: err instanceof Error ? err.message : 'Shiprocket cancellation failed.',
      });
    }
  });

  // ===========================================================================
  // Real WhatsApp Business Cloud API Integration (Meta Graph API v21.0)
  // ===========================================================================
  app.get('/api/whatsapp/status', (_req: Request, res: Response) => {
    const wa = getWhatsAppConfig();
    res.json({
      whatsappConfigured: Boolean(wa),
      webhookVerifyConfigured: Boolean((process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim()),
      missingKeys: wa ? [] : ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    });
  });

  app.post('/api/whatsapp/send-template', async (req: Request, res: Response) => {
    const wa = getWhatsAppConfig();
    if (!wa) {
      res.status(503).json({
        configured: false,
        error:
          'WhatsApp Business Cloud API is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in server secrets to dispatch live WhatsApp order notifications.',
        missingKeys: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
      });
      return;
    }

    const { toPhone, templateName, languageCode, bodyText, parameters } = req.body ?? {};
    const digits = String(toPhone || '').replace(/\D/g, '');
    if (digits.length < 10) {
      res.status(400).json({ error: 'Valid recipient phone number (with country code or 10 digits) is required.' });
      return;
    }
    const normalizedPhone = digits.length === 10 ? `91${digits}` : digits;

    try {
      const payload = templateName
        ? {
            messaging_product: 'whatsapp',
            to: normalizedPhone,
            type: 'template',
            template: {
              name: String(templateName),
              language: { code: String(languageCode || 'en') },
              ...(Array.isArray(parameters) && parameters.length > 0
                ? {
                    components: [
                      {
                        type: 'body',
                        parameters: parameters.map((p: unknown) => ({ type: 'text', text: String(p) })),
                      },
                    ],
                  }
                : {}),
            },
          }
        : {
            messaging_product: 'whatsapp',
            to: normalizedPhone,
            type: 'text',
            text: { body: String(bodyText || 'SellerFlow AI order update') },
          };

      const graphRes = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(wa.phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${wa.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      const data = (await graphRes.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { message?: string };
      };
      if (!graphRes.ok) {
        res.status(graphRes.status || 502).json({
          configured: true,
          error: data.error?.message || 'WhatsApp Graph API send failed.',
        });
        return;
      }
      res.json({
        configured: true,
        sent: true,
        messageId: data.messages?.[0]?.id || null,
      });
    } catch (err) {
      res.status(502).json({
        configured: true,
        error: err instanceof Error ? err.message : 'Unable to reach WhatsApp Cloud API.',
      });
    }
  });

  app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
    const verifyToken = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      res.status(200).send(String(challenge || ''));
      return;
    }
    res.sendStatus(403);
  });

  app.post('/api/whatsapp/webhook', (req: Request, res: Response) => {
    const appSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();
    if (appSecret) {
      const signature = String(req.headers['x-hub-signature-256'] || '');
      const rawBody =
        (req as Request & { rawBody?: Buffer }).rawBody ??
        Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
      const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
      const sigBuf = Buffer.from(signature, 'utf8');
      const expBuf = Buffer.from(expected, 'utf8');
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        res.status(403).json({ error: 'Invalid WhatsApp webhook signature.' });
        return;
      }
    }
    res.json({ received: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SellerFlow AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SellerFlow AI server:', err);
  process.exit(1);
});

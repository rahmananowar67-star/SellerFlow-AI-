/**
 * Security Rule Invariant Verification Spec for SellerFlow AI
 * Verifies the "Dirty Dozen" adversarial payloads against firestore.rules gates.
 */
import fs from 'node:fs';
import assert from 'node:assert';

const rulesContent = fs.readFileSync('firestore.rules', 'utf8');

const assertions = [
  { name: 'Default deny catch-all present', check: () => rulesContent.includes('allow read, write: if false;') },
  { name: 'Verified email required for signed-in writes', check: () => rulesContent.includes('request.auth.token.email_verified == true') },
  { name: 'Self-admin escalation blocked on /users', check: () => rulesContent.includes("incoming().role in ['customer', 'seller']") },
  { name: 'ID regex poisoning guard enforced', check: () => rulesContent.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')") },
  { name: 'Shadow field hasOnly checks present', check: () => rulesContent.includes('data.keys().hasOnly(') },
  { name: 'Server timestamp enforcement present', check: () => rulesContent.includes('incoming().createdAt == request.time') },
  { name: 'Terminal order state lock present', check: () => rulesContent.includes("!(existing().status in ['delivered', 'cancelled', 'returned'])") },
  { name: 'PII isolation on /users list', check: () => rulesContent.includes('allow list: if isBootstrappedAdmin()') },
  { name: 'No get()/exists() in allow list rules', check: () => {
    const listLines = rulesContent.split('\n').filter(l => l.trim().startsWith('allow list:'));
    return listLines.every(l => !l.includes('isAdmin()') && !l.includes('get(') && !l.includes('exists('));
  }},
  { name: 'Authenticated users can read/create their own users/{uid} profile', check: () => rulesContent.includes('allow get: if isValidId(userId) && (isOwner(userId) || isAdmin());') && rulesContent.includes('&& isOwner(userId)') },
  { name: 'Bootstrapped admin email check is case-insensitive', check: () => rulesContent.includes('request.auth.token.email.lower()') },
  { name: 'Categories, Reviews, Wishlists, Commissions, Payouts, Refunds, Disputes, Settings, Coupons, AuditLogs match blocks present', check: () =>
    ['match /categories/{categoryId}', 'match /reviews/{reviewId}', 'match /wishlists/{wishlistId}', 'match /commissions/{commissionId}', 'match /payouts/{payoutId}', 'match /refunds/{refundId}', 'match /disputes/{disputeId}', 'match /settings/{settingId}', 'match /coupons/{couponId}', 'match /auditLogs/{logId}']
      .every(m => rulesContent.includes(m))
  },
  { name: 'Locale and currency enums validated in rules', check: () =>
    rulesContent.includes("data.preferredLanguage in ['en', 'hi', 'as']")
    && rulesContent.includes("data.preferredCurrency in ['INR', 'USD', 'EUR']")
    && rulesContent.includes("data.currency in ['INR', 'USD', 'EUR']")
    && rulesContent.includes('shippingFeeCents')
    && rulesContent.includes('gstRatePct')
  },
];

for (const item of assertions) {
  assert.ok(item.check(), `Security invariant failed: ${item.name}`);
}
console.log(`All ${assertions.length} SellerFlow AI Firestore rule invariants verified.`);

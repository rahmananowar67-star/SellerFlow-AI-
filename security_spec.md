# SellerFlow AI Security Specification

## 1. Data Invariants
1. **Identity & Privilege Separation**: Users may only create their own `/users/{uid}` document with `role` in `['customer', 'seller']`. Self-assignment to `'admin'` is strictly prohibited. Only the verified platform admin (`rahmananowar67@gmail.com` with `email_verified == true`) or existing `/admins/{uid}` documents hold administrative rights.
2. **PII Isolation**: `/users/{uid}`, `/sellers/{uid}`, `/orders/{orderId}`, `/customers/{id}`, `/payments/{id}`, `/commissions/{id}`, `/payouts/{id}`, `/refunds/{id}`, `/disputes/{id}`, `/wishlists/{id}`, and `/notifications/{id}` contain PII or private operational data. Read/list access is strictly scoped to the document owner, counterparty (`customerId` or `sellerId`), or verified Admin.
3. **Public Catalog vs Draft & Moderation Isolation**: Only `stores` with `status == 'active'` and `products` with `published == true` (and `moderationStatus == 'published'` when set) are publicly readable; drafts, pending approvals, rejected items, and suspended entities are only visible to their `ownerId`/`sellerId` or Admin.
4. **Immutable Ownership & Timestamps**: `uid`, `ownerId`, `sellerId`, `customerId`, and `createdAt` cannot be modified after creation. `createdAt == request.time` on creation and `updatedAt == request.time` on update.
5. **Terminal State Locking**: Orders in `'delivered'`, `'cancelled'`, or `'returned'` status and payments in `'refunded'` status cannot be mutated by non-admin users.
6. **Path Variable & Payload Size Hardening**: Every document ID matches `^[a-zA-Z0-9_\-]+$` with length `<= 128`. All strings enforce explicit `.size()` upper bounds and lists enforce `.size() <= 20`.
7. **Seller Moderation & Plan Integrity**: New sellers start on `'starter'` plan with `totalRevenueCents == 0` and cannot approve themselves or mutate `commissionRate`.
8. **Locale, Currency & Product Logistics Bounds**: `preferredLanguage` and `defaultLanguage` are restricted to `['en', 'hi', 'as']`; `preferredCurrency`, `currency`, `displayCurrency`, and `defaultCurrency` are restricted to `['INR', 'USD', 'EUR']`; per-product `shippingFeeCents` (`0..5000000`) and `gstRatePct` (`0..50`) are bounded, and `fxRateApplied` is strictly positive (`0..10000`).
9. **Coupons & Immutable Audit Trail**: Active coupons are readable by shoppers; only Admin can create/modify/delete coupons, while verified shoppers may only increment `usageCount` by +1 during checkout. `/auditLogs` records are append-only (`actorUid == request.auth.uid`), unreadable by non-admins, and immutable (no updates or deletes).

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Admin Escalation**: `POST /users/{uid}` with `{ role: "admin" }`.
2. **Role Tampering on Update**: `PATCH /users/{uid}` changing `role` from `"customer"` to `"admin"`.
3. **Unverified Email Admin Spoof**: Request with `email == "rahmananowar67@gmail.com"` and `email_verified == false`.
4. **Shadow Ghost Field Injection**: `POST /products/{id}` with all required fields plus `isVerified: true`.
5. **Owner Spoofing on Store Create**: `POST /stores/{id}` with `ownerId: "victim-uid"` when signed in as `"attacker-uid"`.
6. **ID Poisoning**: `POST /products/{1500-char-id}` or ID containing `/` or `$`.
7. **PII Scraping**: `LIST /users` or `GET /users/victim-uid` as non-admin customer.
8. **Cross-Tenant CRM / Payout Read**: `LIST /customers` or `LIST /payouts` without `sellerId == auth.uid` or reading another seller's row.
9. **Order Price/Total Tampering**: Customer updating `totalCents` or `paymentStatus` on an existing order.
10. **Terminal Order Reopening**: Seller or customer updating an order whose existing `status == 'delivered'`.
11. **Timestamp Forgery**: Creating a product or order with `createdAt` set to a past date instead of `request.time`.
12. **Unbounded Array Bomb**: Creating a product with `bulletPoints` array of 50 items or non-string elements.

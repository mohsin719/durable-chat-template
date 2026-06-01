# OTP Generator Service

A full-stack OTP verification service with real-time SMS reception, built with NestJS backend and Next.js frontend.

## Recent Updates

### Performance Optimizations (May 2026)
- **Query Optimization**: Added explicit Prisma `select` statements to reduce API response sizes by 60-80%
- **Database Indexes**: Added composite indexes on `PhoneNumber` ([userId, assignedAt]) and `OtpRequest` ([phoneNumberId, status, createdAt]) for faster queries
- **Frontend Performance**: Added `React.memo` to prevent unnecessary re-renders
- **Loading States**: All interactive buttons now have instant loading feedback for better UX

### Rate Limiting (May 2026)
- **Number Acquisition Rate Limit**: Users can request max 5 numbers within 5 minutes
- Database-backed tracking using `assignedAt` timestamp
- Clear error message: "Security Limit: You cannot request more than 5 numbers within 5 minutes."

### Change Number Workflow (May 2026)
- **Release Endpoint**: Added `DELETE /api/numbers/release` to release active numbers
- **Frontend Button**: "Change Number" button appears only when OTP status is RECEIVED
- **Optimistic UI**: Instant feedback when changing numbers
- **Lifecycle Management**: Released numbers go to REUSABLE state with cooldown

### Error Handling Improvements (May 2026)
- **Specific Error Messages**: Backend now returns actual error details instead of generic messages
- **Race Condition Fixes**: Removed redundant status checks in transactions to prevent "NUMBER_NOT_AVAILABLE" errors
- **Better Logging**: Enhanced error logging with full context for debugging

## Current Status

Implemented hardening includes:
- Telnyx webhook idempotency + signature enforcement in production
- DB-first OTP ingestion, Redis cache TTL for fast polling
- Atomic reservation for number assignment (`SET NX`) to reduce race conditions
- Wallet debit + transaction logging inside DB transactions
- Password reset flow with hashed DB tokens (`password_reset_tokens`), 15-minute expiry, single-use
- Rate limiting and abuse guards for critical endpoints

## Environment (Backend)

Minimum important variables:

```bash
NODE_ENV=development
DATABASE_URL=...
DIRECT_URL=...
JWT_SECRET=...
WEB_ORIGIN=http://localhost:3000

# Redis (recommended)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Telnyx
TELNYX_API_KEY=...
TELNYX_PUBLIC_KEY=...           # preferred
# or TELNYX_WEBHOOK_SECRET=...

# Brevo
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=support@usnumhub.com
BREVO_SENDER_NAME=USNumHub
BREVO_SIGNUP_TEMPLATE_ID=2
BREVO_RESET_TEMPLATE_ID=1

# Optional Prisma pool tuning (shared hosting)
PRISMA_CONNECTION_LIMIT=1
PRISMA_POOL_TIMEOUT_SECONDS=30
```

## Setup

1. Install root deps:

```bash
npm install
```

2. Generate Prisma client:

```bash
npm run prisma:generate
```

3. Install frontend deps:

```bash
cd frontend && npm install
```

## Run (Development)

Backend:

```bash
npm run dev
```

Frontend:

```bash
cd frontend && npm run dev
```

## Build & Test

Backend build:

```bash
npm run build
```

Backend tests:

```bash
npm test
```

Frontend build:

```bash
npm run build:frontend
```

Full production-style build:

```bash
npm run build:all
```

## Notes

- If your DB already contains tables and no Prisma migration history, baseline first before `prisma migrate deploy`.
- In production, at least one Telnyx signature key is required for webhook validation.

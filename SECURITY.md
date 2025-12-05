# Security Policy

## Overview

This document outlines the security measures and best practices implemented in this application to protect user data and system integrity.

## Security Architecture

### 1. Authentication & Authorization

**Authentication**
- Powered by Supabase Auth with secure JWT tokens
- Auto-confirm email signups enabled for non-production environments
- HttpOnly, Secure, and SameSite cookies for session management
- Automatic token refresh mechanism
- Session timeout: 8 hours (configurable)

**Authorization**
- Role-Based Access Control (RBAC) using separate `user_roles` table
- Roles: `admin`, `moderator`, `user`
- Server-side role verification using security definer functions
- Deny-by-default access model

### 2. Row-Level Security (RLS) Policies

All database tables have comprehensive RLS policies:

**Profiles Table**
- Users can view/update only their own profiles
- Admins can view metadata only (OAuth tokens hidden)
- OAuth tokens and secrets accessible only to the owner

**Meeting Notes**
- Users can CRUD their own notes
- Admins can view all notes (transcripts should be filtered in UI for privacy)
- No cross-user data access

**Email & Calendar**
- Users can manage only their own data
- Rate limiting enforced per user/IP
- Service role required for automated operations

### 3. Data Protection

**Encryption**
- TLS 1.2+ enforced for all connections
- Data encrypted at rest via Supabase
- OAuth tokens and refresh tokens stored securely
- PII data protected by strict RLS policies

**Data Minimization**
- Retention policy: 30 days default (configurable per user)
- Automatic cleanup triggers (to be implemented via cron)
- Audit logs track all sensitive operations

### 4. Input Validation

**Client-Side**
- Zod schema validation for all forms
- Type-safe TypeScript interfaces
- Length limits and character restrictions

**Server-Side (Edge Functions)**
- Zod validation schemas for all endpoints
- Parameterized queries (no raw SQL)
- File type and size validation
- Allowed email domain restrictions

**Database Constraints**
```sql
- Transcript length: 10-1,000,000 characters
- Email subject: 1-500 characters
- Email body: 1-100,000 characters
- Event titles: 1-300 characters
- Status enums enforced
- Date/time validation (events <5 years future)
```

### 5. Rate Limiting

Enforced at the edge function level:

| Action | Limit | Window |
|--------|-------|--------|
| Transcription | 10 requests | 1 hour |
| Meeting Processing | 20 requests | 1 hour |
| Email Sending | 50 requests | 24 hours |
| Calendar Events | 30 requests | 24 hours |

IP-based tracking prevents abuse across accounts.

### 6. Security Headers

All responses include:
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: [strict policy]
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

CORS configured with explicit origins (no wildcards with credentials).

### 7. Audit Logging

**Logged Events**
- User authentication (login/logout)
- Role changes
- Data creation/modification/deletion
- Admin actions
- Failed authentication attempts
- Rate limit violations

**Audit Log Schema**
```typescript
{
  user_id: UUID
  action: string
  resource_type: string
  resource_id: UUID
  ip_address: INET
  user_agent: string
  metadata: JSONB
  created_at: timestamp
}
```

Only admins can view audit logs. Logs retained for 1 year.

### 8. Error Handling

**Production**
- Generic error messages to users
- No stack traces exposed
- Correlation IDs for support tracking
- Detailed logs server-side only

**Development**
- Enhanced error details for debugging
- Environment-specific error verbosity

### 9. Dependency Security

**Monitoring**
- Regular dependency audits
- Automated security scanning (to be implemented in CI/CD)
- Minimal dependencies principle
- Lockfile enforced (`bun.lockb`)

**Update Policy**
- Security patches: immediate
- Minor versions: monthly review
- Major versions: quarterly review

### 10. API Security

**Edge Functions**
- JWT verification for all authenticated endpoints
- CORS headers properly configured
- Request size limits enforced
- Timeout protection
- Idempotency keys for critical operations

**External API Keys**
- Stored as environment variables
- Never logged or exposed in errors
- Rotated regularly
- Separate keys per environment

## Security Configuration

**Database Settings** (`security_config` table):
```
max_login_attempts: 5
lockout_duration_minutes: 15
session_timeout_minutes: 480
allowed_file_types: audio/webm,audio/mpeg,audio/wav
max_file_size_mb: 50
```

Admins can update these via the admin panel.

## Reporting Security Issues

If you discover a security vulnerability, please:

1. **DO NOT** create a public issue
2. Email: security@[your-domain].com
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We aim to respond within 48 hours and provide a fix within 7 days for critical issues.

## Security Checklist for Developers

Before deploying:
- [ ] All environment variables set
- [ ] RLS policies reviewed
- [ ] Input validation in place
- [ ] Rate limiting configured
- [ ] Security headers enabled
- [ ] Error messages sanitized
- [ ] Audit logging active
- [ ] Dependencies updated
- [ ] No hardcoded secrets
- [ ] HTTPS enforced

## Compliance

- **GDPR**: Data export/deletion available on request
- **Data Residency**: EU (via Supabase)
- **Retention**: Configurable per user (default 30 days)
- **Right to Erasure**: Implemented via cascade deletes

## Security Roadmap

**Q1 2025**
- [ ] Implement MFA for admin accounts
- [ ] Add CAPTCHA for public forms
- [ ] Automated security scanning in CI/CD
- [ ] Penetration testing

**Q2 2025**
- [ ] SOC 2 compliance audit
- [ ] Bug bounty program
- [ ] Enhanced monitoring and alerting
- [ ] Automated threat detection

## Updates

This security policy is reviewed quarterly and updated as needed.

**Last Updated**: 2025-11-09
**Version**: 1.0.0

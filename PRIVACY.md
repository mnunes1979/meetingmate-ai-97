# Privacy Policy

**Last Updated**: 2025-11-09

## Introduction

This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our application.

## Information We Collect

### 1. Account Information
- Email address
- Name
- Profile picture (optional)
- Account preferences

### 2. Meeting Data
- Audio recordings (stored securely)
- Meeting transcriptions
- Meeting summaries and analysis
- Participant information (when explicitly mentioned)
- Customer names and companies (when explicitly mentioned)

### 3. Communication Data
- Email drafts and sent emails
- Email engagement metrics (opens, clicks)
- Calendar events
- Department email addresses

### 4. Technical Information
- IP address (for security and rate limiting)
- Browser type and version
- Device information
- Access times
- Usage patterns

### 5. OAuth Data
- Google Calendar access tokens (encrypted)
- Calendar selection preferences
- Email address from Google (for account linking)

## How We Use Your Information

### Primary Uses
1. **Service Delivery**
   - Transcribe and analyze meeting recordings
   - Generate meeting summaries and insights
   - Create email drafts and calendar events
   - Manage your account and preferences

2. **Communication**
   - Send emails on your behalf
   - Create calendar events
   - Notify departments of important information

3. **Security & Compliance**
   - Authenticate your identity
   - Prevent fraud and abuse
   - Enforce rate limits
   - Audit security events
   - Comply with legal obligations

4. **Improvement**
   - Improve AI analysis quality
   - Enhance user experience
   - Fix bugs and issues

### AI Processing
Meeting transcripts are processed using:
- **OpenAI Whisper API** (for transcription)
- **Lovable AI Gateway** (for analysis using Google Gemini and OpenAI models)

These services may temporarily process your data but do not retain it beyond the processing session.

## Data Storage & Retention

### Storage Location
- Primary database: European Union (via Supabase)
- Audio files: Secure cloud storage (Supabase Storage)
- Backups: Encrypted at rest

### Retention Periods
| Data Type | Retention Period | Notes |
|-----------|-----------------|-------|
| Meeting notes | 30 days (default) | Configurable per user |
| Audio recordings | 30 days (default) | Configurable per user |
| Email history | 90 days | Fixed |
| Calendar events | Until deleted | User-controlled |
| Audit logs | 1 year | Security requirement |
| Rate limit logs | 30 days | Automatically purged |

You can configure your retention period in Settings (minimum 7 days, maximum 365 days).

### Automatic Deletion
Data is automatically deleted after the retention period expires. You can manually delete data at any time.

## Data Sharing

### We DO NOT
- ❌ Sell your personal information
- ❌ Share data with advertisers
- ❌ Use your data for marketing without consent
- ❌ Train AI models on your private data

### We MAY Share Data With
1. **Service Providers**
   - Supabase (infrastructure)
   - OpenAI (transcription)
   - Google (AI processing via Lovable AI Gateway)
   - Resend (email delivery)
   - Google Calendar (calendar integration)

2. **Legal Requirements**
   - When required by law
   - To protect our rights or safety
   - In response to valid legal process

3. **Business Transfers**
   - In case of merger, acquisition, or asset sale (you will be notified)

## Your Rights

### Under GDPR (EU Users)
- **Right to Access**: Request a copy of your data
- **Right to Rectification**: Correct inaccurate data
- **Right to Erasure**: Delete your account and data
- **Right to Restriction**: Limit how we use your data
- **Right to Portability**: Export your data
- **Right to Object**: Opt-out of certain processing
- **Right to Withdraw Consent**: At any time

### How to Exercise Your Rights
Email: privacy@[your-domain].com or use the in-app data export/deletion features.

## Security Measures

We implement industry-standard security measures:
- **Encryption**: TLS 1.2+ in transit, AES-256 at rest
- **Access Controls**: Role-based with strict RLS policies
- **Authentication**: Secure JWT tokens with automatic expiry
- **Monitoring**: 24/7 security monitoring and audit logging
- **Regular Audits**: Quarterly security reviews

See [SECURITY.md](./SECURITY.md) for detailed information.

## Cookies & Tracking

### Cookies We Use
- **Essential**: Authentication session
- **Functional**: Language preferences, theme settings

### We DO NOT Use
- ❌ Advertising cookies
- ❌ Third-party tracking pixels
- ❌ Social media trackers

## Children's Privacy

Our service is not intended for users under 16. We do not knowingly collect data from children. If we discover we have collected data from a child, we will delete it immediately.

## International Transfers

Your data is primarily stored in the EU. If transferred outside the EU, we ensure:
- Adequate protection mechanisms (e.g., Standard Contractual Clauses)
- GDPR-compliant processors
- Encryption in transit

## Third-Party Services

### Google OAuth
When you connect Google Calendar, you authorize us to:
- View and manage your calendars
- Create events on your behalf

You can revoke this access anytime in Settings or via [Google Account](https://myaccount.google.com/permissions).

### OpenAI
Audio transcription is processed by OpenAI Whisper API. OpenAI's data usage policy:
- Data may be used to improve services (unless you opt-out via OpenAI API terms)
- Data is not retained beyond 30 days
- See [OpenAI Privacy Policy](https://openai.com/privacy)

### Resend (Email)
Email delivery via Resend. They do not store email content long-term.
See [Resend Privacy Policy](https://resend.com/privacy)

## Changes to This Policy

We may update this policy occasionally. Changes will be:
- Posted on this page with a new "Last Updated" date
- Notified via email for material changes
- Effective 30 days after posting (for material changes)

Continued use after changes constitutes acceptance.

## Data Breach Notification

In case of a data breach affecting your personal information, we will:
1. Notify you within 72 hours
2. Describe the breach and affected data
3. Outline steps we're taking
4. Provide recommendations for your protection
5. Notify relevant authorities (GDPR requirement)

## Contact Us

**Privacy Questions**: privacy@[your-domain].com
**Data Protection Officer**: dpo@[your-domain].com
**General Support**: support@[your-domain].com

**Postal Address**:
[Your Company Name]
[Street Address]
[City, State/Province, ZIP/Postal Code]
[Country]

## Specific Regional Rights

### California (CCPA)
California residents have additional rights:
- Right to know what data is collected
- Right to delete data
- Right to opt-out of data sales (we don't sell data)
- Right to non-discrimination

### UK GDPR
UK users have the same rights as EU users under UK GDPR.

## Consent

By using our service, you consent to this Privacy Policy. If you disagree, please stop using the service and contact us to delete your account.

---

**Version**: 1.0.0
**Effective Date**: 2025-11-09

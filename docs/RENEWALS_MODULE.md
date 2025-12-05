# Service Renewal Management Module

## Overview

A feature-flagged module for tracking service renewals (domains, hosting, VPS, etc.) with automated extraction from documents and email alerts.

## Features

- ✅ **Document Import**: Upload PDF, DOCX, images, CSV, XLS to auto-extract renewal data
- ✅ **AI Extraction**: Uses OpenAI to extract provider, service type, renewal dates, clients
- ✅ **Critical Items Screen**: Automatic alerts for expired and due-soon services
- ✅ **Email Alerts**: Configurable email notifications N days before expiry
- ✅ **Multi-format Date Support**: DD/MM/YYYY, YYYY-MM-DD, text dates
- ✅ **Client Management**: Track which services belong to which clients
- ✅ **Customizable Settings**: Configure alert timing and email templates

## Activation

### Step 1: Enable the Feature Flag

Add to your `.env` file:

```bash
VITE_RENEWALS_MODULE_ENABLED=true
```

### Step 2: Configure Environment Variables (Optional)

Default values are provided, but you can customize:

```bash
DEFAULT_ALERT_OFFSET_DAYS=45
DEFAULT_ALERT_RECIPIENTS=ops@example.com,finance@example.com
```

### Step 3: Rebuild and Deploy

```bash
# The build will include the renewals routes
npm run build

# Click "Update" in the Publish dialog to deploy frontend changes
```

## Database Schema

The module creates these tables (idempotent, safe to run multiple times):

- `providers` - Service providers (OVH, GoDaddy, etc.)
- `clients` - Your clients/customers
- `services` - Individual services
- `renewals` - Renewal dates and cycles
- `documents` - Uploaded files
- `extractions` - AI extraction results
- `alerts` - Email alert schedule
- `alert_recipients` - Custom alert recipients
- `renewal_settings` - User preferences

## Edge Functions

### extract-service-data
- **Auth**: Required (JWT)
- **Purpose**: Parse uploaded documents and extract renewal data using OpenAI
- **Input**: `{ document_id: string, isTabular?: boolean }`
- **Output**: Structured service data with expired/due-soon categorization

### send-renewal-alerts
- **Auth**: Not required (for cron)
- **Purpose**: Daily job to send renewal alert emails
- **Schedule**: Run via cron job (see setup below)

## Setting Up Daily Alerts (Optional)

To enable automated daily email alerts, set up a cron job:

```sql
-- Enable extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily alerts at 9 AM
SELECT cron.schedule(
  'send-renewal-alerts-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://hjnxjmenfhhoqcsjvrzj.supabase.co/functions/v1/send-renewal-alerts',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

Replace `YOUR_ANON_KEY` with your actual Supabase anon key.

## Routes

When enabled (`VITE_RENEWALS_MODULE_ENABLED=true`):

- `/renewals` - Main table view with filters
- `/renewals/critical` - Expired and due-soon items
- `/renewals/import` - Upload and import documents
- `/settings/renewals` - Configure alerts and email templates

When disabled, these routes don't exist (tree-shaken from build).

## Usage Flow

### 1. Import Services

**Manual Entry**: Coming soon (currently import-only)

**File Import**:
1. Navigate to `/renewals/import`
2. Upload a document (PDF, image, spreadsheet)
3. AI extracts:
   - Provider (OVH, GoDaddy, etc.)
   - Service type (domain, hosting, VPS, etc.)
   - Service name
   - Renewal date (auto-normalizes formats)
   - Renewal cycle (annual, monthly, etc.)
   - Client name (if mentioned)

### 2. Review Critical Items

After import, you're automatically redirected to `/renewals/critical` if any services are:
- **Expired**: Past renewal date
- **Due Soon**: Within your configured alert window (default 45 days)

Quick actions per item:
- **Mark as Renewed**: Updates status
- **Snooze**: Delay alert by 7/15/30 days
- **View**: See full service details
- **Assign Client**: Link to a client

### 3. Manage All Renewals

Visit `/renewals` to see all services with filters:
- All
- Expired
- Due ≤ 30 days
- Due ≤ 45 days
- Active (renewed)

### 4. Configure Alerts

Visit `/settings/renewals` to:
- Set default alert offset (e.g., 45 days before expiry)
- Configure default email recipients
- Customize email subject and body templates

## Security

- ✅ Row-Level Security (RLS) enabled on all tables
- ✅ Users can only see their own data
- ✅ Service role used for AI extraction (server-side only)
- ✅ Storage bucket is private with RLS policies
- ✅ JWT authentication required for all user operations

## Rollback

To disable the module without code changes:

```bash
# In .env
VITE_RENEWALS_MODULE_ENABLED=false

# Rebuild and redeploy
npm run build
```

The routes will be removed from the bundle (tree-shaking). Database tables remain intact.

## API Keys Required

- ✅ `OPENAI_API_KEY` - Already configured
- ✅ `RESEND_API_KEY` - Already configured

## Supported File Formats

- **Documents**: PDF, DOCX
- **Images**: PNG, JPG, JPEG (with OCR)
- **Spreadsheets**: CSV, XLS, XLSX

## Date Format Support

The AI automatically normalizes these formats:
- `DD/MM/YYYY` (e.g., 22/02/2026)
- `YYYY-MM-DD` (e.g., 2026-02-22)
- Text dates (e.g., "Antes de 22/02/2026" → before 2026-02-22)

## Testing

### Test CSV Upload
Create a test CSV file:

```csv
Provider,Service Type,Service Name,Renewal Date,Cycle,Client
OVH,domain,example.com,2025-12-15,annual,ACME Corp
GoDaddy,hosting,hosting-plan-pro,2025-11-10,monthly,Tech Startup
```

Upload it via `/renewals/import` and verify extraction.

### Test Critical Items
After import, check `/renewals/critical` for:
- Expired services (red badges)
- Due soon services (yellow badges)

### Test Email Alerts
Manually trigger the edge function:

```bash
curl -X POST https://hjnxjmenfhhoqcsjvrzj.supabase.co/functions/v1/send-renewal-alerts \
  -H "Content-Type: application/json"
```

Check configured email recipients for alert messages.

## Troubleshooting

### Routes not appearing
- Check `VITE_RENEWALS_MODULE_ENABLED=true` in `.env`
- Rebuild the app
- Clear browser cache

### Extraction failing
- Verify `OPENAI_API_KEY` is set in Supabase secrets
- Check edge function logs in Supabase dashboard
- Ensure file is < 20MB

### No emails sent
- Verify `RESEND_API_KEY` is configured
- Check `send-renewal-alerts` edge function logs
- Confirm recipients are set in settings or env vars
- Verify cron job is scheduled correctly

## Production Checklist

- [ ] Feature flag OFF in production initially
- [ ] Run database migrations
- [ ] Test on staging environment
- [ ] Import test data and verify extraction
- [ ] Set up cron job for daily alerts
- [ ] Configure production email recipients
- [ ] Enable feature flag in production
- [ ] Monitor edge function logs for first 24 hours

## Support

For issues or questions, check:
- Edge function logs in Supabase dashboard
- Browser console for frontend errors
- Database logs for RLS policy issues
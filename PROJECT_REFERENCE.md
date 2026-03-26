# TravelCover Insurance App Reference

This file is the working reference for the TravelCover Insurance application.

Use it as the first stop when:
- onboarding a new contributor
- planning a feature update
- debugging production issues
- deploying or rolling back changes
- tracing auth, notification, or Supabase behavior

Update this document whenever any of the following change:
- authentication flow
- Supabase schema or SQL scripts
- Edge Functions
- deployment environment variables
- key user flows

## 1. Application Summary

TravelCover is an operations console for transport-trip insurance and passenger notification workflows.

Core jobs the application supports:
- manage transport companies and routes
- capture and edit trip manifests
- store passenger and next-of-kin details
- send or schedule SMS and email notifications
- manage templates, schedule rules, and automation
- administer app users, roles, and permissions

The app is a React + Vite frontend backed directly by Supabase for data, auth, RPC, and Edge Functions.

## 2. Tech Stack

Frontend:
- React 18
- Vite
- React Router
- Tailwind CSS
- `react-hot-toast`
- `lucide-react`
- `react-quill`
- `recharts`
- `react-webcam`
- `tesseract.js`
- `@google/generative-ai`

Backend platform:
- Supabase Postgres
- Supabase Auth
- Supabase Edge Functions
- Supabase RPC / SQL functions

Notification integrations:
- Termii SMS
- Resend email
- optional/legacy Twilio code paths remain in the repo

## 3. Repository Layout

Top-level:
- [frontend](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend): the actual application
- [PROJECT_REFERENCE.md](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/PROJECT_REFERENCE.md): this document

Important frontend folders:
- [src](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src): React app
- [src/pages](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages): screens and operational workflows
- [src/services](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services): Supabase, notification, auth helper logic
- [src/contexts](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/contexts): application auth/permissions state
- [src/components](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/components): shared UI wrappers
- [supabase](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase): SQL scripts and Edge Functions
- [scripts](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts): local operational/debug scripts

## 4. Main App Shell

Entry points:
- [main.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/main.jsx)
- [App.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/App.jsx)

Main shell/layout:
- [Layout.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/components/Layout.jsx)

App routes currently mounted in [App.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/App.jsx):
- `/`: Dashboard
- `/companies`: Transport companies and routes
- `/capture-manifest`: OCR/image capture flow
- `/edit-manifest`: manifest editing and passenger management
- `/send-sms`: manual notification send flow
- `/manifests`: manifest history
- `/manifest-details/:manifestId`: manifest detail view
- `/message-logs`: SMS logs
- `/admin-settings`: users, templates, settings, roles
- `/message-schedule-rules`: automation UI
- `/scheduled-messages`: automation UI alias
- `/email-templates`: redirects to admin settings email templates tab
- `/automation`: automation UI alias

Background behavior:
- the app calls `processDueNotifications()` every minute when a signed-in user is present
- this behavior is wired in [App.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/App.jsx)

## 5. Key Screens

- [Dashboard.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/Dashboard.jsx)
  - high-level stats for companies, routes, passengers, manifests, and SMS logs

- [TransportCompanies.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/TransportCompanies.jsx)
  - CRUD for transport companies and routes

- [CaptureManifest.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/CaptureManifest.jsx)
  - image upload/camera capture
  - OCR preprocessing
  - AI extraction handoff into edit flow

- [EditManifest.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/EditManifest.jsx)
  - manifest editing
  - passenger row management
  - route/company/time updates

- [SendSMS.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/SendSMS.jsx)
  - manual notification dispatch

- [ManifestsHistory.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/ManifestsHistory.jsx)
  - list/search/delete manifests

- [ManifestDetails.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/ManifestDetails.jsx)
  - details for a specific manifest and passenger set

- [SMSLogs.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/SMSLogs.jsx)
  - provider/status log viewer

- [JourneyAutomation.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/JourneyAutomation.jsx)
  - wrapper for automation-related screens

- [SMSScheduleRules.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/SMSScheduleRules.jsx)
  - CRUD for message scheduling rules

- [ScheduledMessages.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/ScheduledMessages.jsx)
  - view/cancel/process scheduled jobs

- [EmailTemplates.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/EmailTemplates.jsx)
  - email template CRUD, duplicate, preview, activation

- [AdminSettings.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/AdminSettings.jsx)
  - user management
  - password reset for signed-in admins
  - SMS template management
  - SMS settings
  - roles and permissions

## 6. Auth and Permissions Model

Current auth state is managed in:
- [PermissionsContext.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/contexts/PermissionsContext.jsx)

Current model:
- frontend signs users in with Supabase Auth email/password
- the app then resolves the signed-in user against `public.app_users`
- access depends on a linked `app_users` record that is active
- permission keys are derived from role mappings

Important auth features already implemented:
- secure sign-in
- sign-out
- linked `app_users` profile lookup via RPC
- admin-only user management through Edge Functions
- admin-only password reset for managed users
- logged-out forgot-password flow via Supabase recovery emails

Login/recovery UI:
- [SignInScreen.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/components/SignInScreen.jsx)

App user service wrapper:
- [appUsers.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/appUsers.js)

## 7. Supabase Data Access Model

Basic client:
- [supabase.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/supabase.js)

Important note:
- the frontend still uses the public anon key
- security now depends on Supabase Auth + RLS + restricted RPC/Edge Functions

### Current secure pattern

Use direct table access only where RLS policies explicitly allow authenticated admin sessions.

Use RPC / Edge Functions for privileged flows:
- `get_current_app_user_profile()` for resolving current app user profile
- `manage-app-users` for admin user CRUD
- `reset-app-user-password` for admin-initiated password reset
- `process_due_scheduled_jobs()` for background queue processing
- `send_sms_via_termii(...)`
- `send_email_via_resend(...)`

## 8. Edge Functions

Stored under:
- [frontend/supabase/functions](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/functions)

### `manage-app-users`
- source: [manage-app-users/index.ts](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/functions/manage-app-users/index.ts)
- purpose:
  - list users
  - create users
  - update users
  - delete users
- protected by:
  - signed-in caller required
  - caller must map to an active `admin` or `super_admin`
- uses `service_role` privileges server-side

### `reset-app-user-password`
- source: [reset-app-user-password/index.ts](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/functions/reset-app-user-password/index.ts)
- purpose:
  - reset the Supabase Auth password of a linked app user
- protected by:
  - signed-in caller required
  - caller must be active admin/super_admin
  - non-super-admins cannot reset another super-admin

## 9. SQL / Supabase Scripts

All SQL files live under:
- [frontend/supabase](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase)

### Security and auth hardening

- [enable_app_users_rls.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/enable_app_users_rls.sql)
  - enables and forces RLS on `public.app_users`
  - removes open public/anon/authenticated grants

- [secure_app_users_access.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/secure_app_users_access.sql)
  - adds `auth_user_id`
  - backfills auth user links by email
  - creates `get_current_app_user_profile()`

- [harden_public_admin_tables_rls.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/harden_public_admin_tables_rls.sql)
  - enables RLS on remaining admin-facing public tables
  - adds `is_current_app_admin()`
  - restricts access to authenticated app admins

### Notification and delivery SQL

- [replace_send_sms_via_termii.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/replace_send_sms_via_termii.sql)
- [setup_termii_secure_one_run.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/setup_termii_secure_one_run.sql)
- [configure_termii_sms_settings.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/configure_termii_sms_settings.sql)
- [replace_send_email_via_resend.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/replace_send_email_via_resend.sql)
- [process_due_scheduled_jobs.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/process_due_scheduled_jobs.sql)
- [reset_notification_templates.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/reset_notification_templates.sql)

### Recommended execution order for secure setup

1. `enable_app_users_rls.sql`
2. `secure_app_users_access.sql`
3. `harden_public_admin_tables_rls.sql`
4. notification-related SQL as needed
5. deploy Edge Functions

## 10. Environment Variables

The `.env` file is local-only and must not be committed with secrets.

Variables currently referenced in the repo:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH_REDIRECT_URL`
- `VITE_PASSWORD_RESET_REDIRECT_URL`
- `VITE_GEMINI_API_KEY`
- `VITE_BULKSMS_API_KEY`
- `VITE_RESEND_API_KEY`
- `VITE_TWILIO_ACCOUNT_SID`
- `VITE_TWILIO_AUTH_TOKEN`
- `VITE_TWILIO_PHONE_NUMBER`

Important operational note:
- the forgot-password flow uses `VITE_AUTH_REDIRECT_URL` if set
- if not set, reset emails can be generated against the current browser origin, including `localhost`

## 11. Notification Pipeline

Primary orchestration:
- [notificationService.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/notificationService.js)

Scheduling and queue logic:
- [smsScheduler.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/smsScheduler.js)

Delivery services:
- [termiiService.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/termiiService.js)
- [emailService.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/emailService.js)
- [twilioService.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/twilioService.js)

High-level flow:
- manifest is created or updated
- route/company/passengers provide notification context
- rules/templates determine message content
- jobs are inserted into `scheduled_jobs`
- processor picks up due jobs
- SMS/email provider functions execute delivery
- logs are written to `sms_logs` / email log tables

## 12. AI / OCR Flow

Files involved:
- [CaptureManifest.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/pages/CaptureManifest.jsx)
- [aiService.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/aiService.js)

Behavior:
- capture/upload image
- preprocess image
- OCR / extract text
- use Gemini to normalize passenger records
- hand over to manifest edit flow for review and save

## 13. Local Operational Scripts

Stored under:
- [frontend/scripts](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts)

Useful scripts:
- [diagnoseManifest.mjs](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts/diagnoseManifest.mjs)
  - inspect manifest, passengers, jobs, SMS logs, and email logs

- [runLiveE2E.mjs](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts/runLiveE2E.mjs)
  - creates live test data and exercises scheduling/logging

- [smokeNotifications.mjs](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts/smokeNotifications.mjs)
  - lightweight notification smoke checks

- [backfillManifestJobs.mjs](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts/backfillManifestJobs.mjs)
  - backfill jobs for existing manifests

- [cleanupOldScheduledDuplicates.mjs](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts/cleanupOldScheduledDuplicates.mjs)
  - inspect or cleanup duplicate scheduled jobs

- [cleanupTestData.mjs](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts/cleanupTestData.mjs)
  - remove test manifests, passengers, logs, related routes/companies

- [clearScheduledJobs.mjs](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts/clearScheduledJobs.mjs)
- [clearPendingScheduledJobs.mjs](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts/clearPendingScheduledJobs.mjs)
- [updateNotificationTemplates.mjs](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts/updateNotificationTemplates.mjs)

Warning:
- many local scripts still use the anon client directly
- after RLS hardening, some scripts may fail unless they authenticate as an admin or are moved to a privileged backend path

## 14. Available NPM Commands

Defined in [package.json](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/package.json):
- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run smoke:notifications`
- `npm run smoke:notifications:force`
- `npm run templates:update`
- `npm run cleanup:scheduled-duplicates`
- `npm run cleanup:scheduled-duplicates:apply`

## 15. Deployment Notes

Frontend:
- build with `npm run build`
- host as a SPA
- [vercel.json](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/vercel.json) rewrites all routes to `index.html`

Supabase:
- SQL scripts are applied manually in SQL Editor unless moved to a migration system
- Edge Functions are deployed through Supabase CLI

Required post-deploy checks:
- sign-in works
- forgot-password email lands on the correct app URL
- `Admin Settings > Users` loads
- create/update/delete user works
- admin password reset works
- scheduled job processing still works

## 16. Update Checklist

Before making a change:
- identify whether it is frontend-only, SQL-only, or function-related
- check whether RLS or auth behavior is affected
- check whether any local scripts depend on the same tables
- review deployed Edge Functions if service-role behavior is involved

For auth/security updates:
- update this document
- update SQL execution order notes if needed
- verify `Authentication > URL Configuration`
- verify `Site URL` and allowed redirect URLs
- request a fresh reset email after redirect changes

For notification updates:
- verify template compatibility
- verify queued job generation
- verify processor function permissions

## 17. Rollback Guidance

Use the smallest safe rollback.

### Frontend-only rollback
- revert the relevant git commit(s)
- redeploy frontend
- verify auth and routing still work

### Edge Function rollback
- redeploy a previous function version from git history
- verify the function remains active in Supabase
- test caller authorization after rollback

### SQL rollback
- treat SQL rollback as higher risk than code rollback
- inspect current schema first
- snapshot data or export affected rows when changing permissions/policies
- remove or replace policies carefully instead of broad destructive resets

Recommended practice before SQL rollback:
- capture current table grants
- capture current policies from `pg_policies`
- capture extension locations from `pg_extension`

## 18. Known Risks / Gotchas

- [frontend/.env](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/.env) is local-only and should never be committed with real secrets
- password reset links can point to `localhost` if production redirect configuration is missing
- local helper scripts may break after RLS hardening because they still rely on anon-key table access
- Supabase advisory warnings can lag behind actual DB state until the scan refreshes
- the repo still contains both current and legacy notification paths; do not assume Twilio is the primary live path
- the build currently passes, but Vite still warns about a large JS chunk

## 19. Current Security State

Implemented:
- `app_users` locked behind RLS
- current user profile resolved through secure RPC
- public admin tables protected by authenticated-admin RLS
- admin user management moved behind service-role Edge Function
- admin password reset moved behind service-role Edge Function
- self-service forgot-password flow added

Still worth monitoring:
- Supabase extension warnings such as `pg_net` schema placement
- leaked password protection in Supabase Auth settings
- any script or service still using overly broad client-side access assumptions

## 20. Recommended Next Improvements

- move SQL scripts into a formal migration workflow
- add a real deployment checklist for production releases
- add authenticated test utilities for local scripts
- document exact production domain(s) and hosting provider env setup
- reduce frontend bundle size
- add automated tests around auth recovery and admin user management

## 21. Quick Reference Files

Core app:
- [App.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/App.jsx)
- [Layout.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/components/Layout.jsx)
- [PermissionsContext.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/contexts/PermissionsContext.jsx)
- [SignInScreen.jsx](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/components/SignInScreen.jsx)

User/admin security:
- [appUsers.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/appUsers.js)
- [manage-app-users/index.ts](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/functions/manage-app-users/index.ts)
- [reset-app-user-password/index.ts](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/functions/reset-app-user-password/index.ts)

Database security:
- [enable_app_users_rls.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/enable_app_users_rls.sql)
- [secure_app_users_access.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/secure_app_users_access.sql)
- [harden_public_admin_tables_rls.sql](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/supabase/harden_public_admin_tables_rls.sql)

Notification engine:
- [notificationService.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/notificationService.js)
- [smsScheduler.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/smsScheduler.js)
- [termiiService.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/termiiService.js)
- [emailService.js](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/src/services/emailService.js)

Operational scripts:
- [diagnoseManifest.mjs](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts/diagnoseManifest.mjs)
- [runLiveE2E.mjs](/c:/Users/Hp/OneDrive/Desktop/travel-insurance-app/frontend/scripts/runLiveE2E.mjs)

## 22. Maintenance Note

If a future change updates:
- auth flow
- reset-password behavior
- RLS policies
- Edge Function names
- notification providers
- required environment variables

then update this file in the same change set.

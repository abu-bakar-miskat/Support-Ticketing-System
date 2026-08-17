# Microsoft (Azure AD) SSO — Implementation Guide

This guide takes the project from "magic-link only" to "Microsoft SSO only," in two stages.
The app-side code already calls `supabase.auth.signInWithOAuth({ provider: "azure" })`
([`src/app/login/page.tsx`](../src/app/login/page.tsx)) and handles the PKCE callback
([`src/app/auth/callback/route.ts`](../src/app/auth/callback/route.ts)), so this is
mostly portal configuration, policy, and a staged rollout — not app code.

**Target identity posture:** every PEN employee signs in with their `@penglobalbd.com`
Microsoft work account. No magic link, no passwords, no external collaborators.

---

## Prerequisites

Resolve these **before** starting the Azure portal work. Each one blocks something
downstream.

### IT coordination

You will need an Azure AD admin (PEN IT) for two specific clicks. Send them this
ahead of time so they're not blocked on context:

- **App registration name:** `PEN Ticketing System`
- **Single-tenant** (accounts in PEN's directory only)
- **Requested API permissions:** `openid`, `email`, `profile` (delegated, Microsoft Graph)
- **What you need IT to do:**
  1. Confirm the **tenant ID** (GUID) for PEN's Azure AD.
  2. After app registration, click **API permissions → Grant admin consent for [tenant]**
     so end users never see a consent prompt.

### Admin "deactivate user" feature

When magic-link is removed and Microsoft becomes the sole identity source, in-app
offboarding requires an admin action that:

1. Sets a deactivation flag on the `Profile` row.
2. Removes the user from all `teamMembership` rows.
3. Calls `supabase.auth.admin.signOut(userId)` to invalidate live sessions.

**This feature does not exist yet.** It is a hard prerequisite for Stage 2 (removing
magic-link), not for Stage 1. Track it as a separate task.

### Secret backup location

The Azure client secret value is shown **exactly once** in the Azure portal. Decide
where the backup copy lives outside Azure before generating the secret.

> **TODO:** Confirm with IT which password manager PEN uses for shared secrets
> (1Password / Bitwarden / Vault). Default: team password manager. Do not store in
> Slack, email, code, or `.env` files.

---

## Microsoft Entra setup

Detailed step-by-step procedure lives in [`azure-app-setup.md`](./azure-app-setup.md).
That guide covers app registration, owners, redirect URIs, API permissions,
admin-consent coordination, and the client secret — all against the current
Microsoft Entra admin center (not the legacy Azure portal).

Outputs you need to carry back here for the Supabase section below:

- **Application (client) ID**
- **Directory (tenant) ID**
- **Client secret `Value`** (shown once; back up in team password manager)

Constraints set by [`azure-app-setup.md`](./azure-app-setup.md) and referenced
throughout this guide:

- Single-tenant, scopes `openid email profile`, no Graph, no `offline_access`.
- Redirect URI registered in Entra is `https://mcefdpjaepmxrexyylqk.supabase.co/auth/v1/callback` (Supabase's project-level callback only).
- Client secret expires in 24 months; 30-day-before rotation reminder in shared calendar.
- App registration has at least two owners.

---

## Supabase dashboard setup

Performed in the [Supabase dashboard](https://supabase.com/dashboard) for the
ticketing project.

### 1. Configure the Azure provider

**Authentication → Providers → Azure**

| Field | Value |
| --- | --- |
| Enable Azure provider | **On** |
| Application (client) ID | *paste from Azure step 1* |
| Secret value | *paste from Azure step 4* |
| Azure Tenant URL | `https://login.microsoftonline.com/<TENANT_ID>` |

The Tenant URL is what makes the provider single-tenant. Using
`https://login.microsoftonline.com/common` instead would silently make it
multi-tenant.

### 2. Configure redirect URLs

**Authentication → URL Configuration → Redirect URLs**

Add:

- `http://localhost:3000/auth/callback`
- *(Production app URL `/auth/callback` — added once finalized.)*

A URL missing here causes an opaque "redirect not allowed" error after Microsoft
sign-in.

### 3. Verify Site URL

**Authentication → URL Configuration → Site URL** should be the production app URL.
This is the default redirect target if no explicit redirect is provided.

---

## Pre-flight email audit

Before enabling Microsoft sign-in for users, every existing `auth.users` row's
email must exactly match the user's Azure UPN (the email Microsoft will send in the
token claim). A mismatch — different alias, different casing, an old address —
creates a *new* `auth.users` row on first Microsoft sign-in, orphaning the user's
existing `Profile`, `teamMembership`, and ticket history.

### 1. Export current emails

Run in the Supabase SQL editor:

```sql
select id, email, created_at, last_sign_in_at
from auth.users
order by email;
```

### 2. Get Azure UPNs

From PEN IT or via Azure portal: **Azure AD → Users → Export**. You need each
employee's `userPrincipalName` (this is what Microsoft sends as the email claim
for work accounts).

### 3. Compare and fix

For each `auth.users.email` that differs from the corresponding Azure UPN
(case-sensitive — Postgres compares as bytes here):

```sql
update auth.users
set email = '<correct-upn>'
where id = '<user-uuid>';
```

Re-run the export and confirm all rows align before proceeding.

> **Why this must happen before Stage 1, not before Stage 2:** as soon as Microsoft
> is enabled, any sign-in attempt with a mismatched email creates an orphan row.
> Delaying the audit just delays the pain.

---

## Verification

Sign in successfully in both environments before announcing rollout.

### Local

1. `npm run dev`
2. Open `http://localhost:3000/login`.
3. Click **Sign in with Microsoft**.
4. Microsoft prompts for sign-in (or silent if already signed into a PEN account).
5. Redirected back to `/`.
6. In Supabase SQL editor, confirm:
   ```sql
   select id, email, raw_user_meta_data->>'provider_id' as azure_oid
   from auth.users
   where email = 'your.email@penglobalbd.com';
   ```
   `azure_oid` should be populated.
7. In Supabase, confirm a `public."Profile"` row exists with the same `id`.

### Production

Repeat the above against the production URL. Confirm with a teammate (not just
yourself) that their sign-in also works — catches tenant-config mistakes that
happen to work for the implementer.

---

## Staged rollout

### Stage 1 — Microsoft on, magic-link still available

1. Complete Azure portal setup, Supabase dashboard setup, email audit,
   verification (sections above).
2. Announce to the team: "Microsoft sign-in is now live. Please sign in with
   Microsoft once to verify it works. Magic link remains available as a fallback."
3. Monitor `auth.users` for **new rows** created during this window — any new row
   without a Stage 1 announcement is a likely orphan from a missed email audit.
4. Run for at least one full week so every active user has signed in via Microsoft
   at least once.

### Stage 2 — Remove magic-link

Prerequisites for Stage 2:

- [ ] Every active user has at least one Microsoft sign-in in `auth.users.last_sign_in_at`.
- [ ] Admin "deactivate user" feature is built (see Prerequisites).
- [ ] No outstanding orphan rows.

Implementation (one PR):

1. Delete `sendMagicLink` server action from
   [`src/app/login/page.tsx`](../src/app/login/page.tsx).
2. Delete [`src/components/auth/magic-link-form.tsx`](../src/components/auth/magic-link-form.tsx).
3. Remove the "or" divider and `MagicLinkForm` render block from the login page.
4. In Supabase dashboard: **Authentication → Providers → Email** → disable.
5. Remove the `tokenHash` / `type` branch from
   [`src/app/auth/callback/route.ts`](../src/app/auth/callback/route.ts) — only the
   PKCE `code` path remains.

---

## Operations runbook

### Rotating the client secret

1. Microsoft Entra admin center → app registration → **Certificates & secrets → New client secret**, 24 months.
2. Copy the new value.
3. Supabase dashboard → **Authentication → Providers → Azure** → paste new value → save.
4. Update the password manager backup.
5. Delete the old secret from Azure portal once new one is confirmed working.
6. Reset the 30-day-before-expiry calendar reminder.

No app deploy required — Supabase holds the secret server-side.

### Offboarding a user

1. **IT** disables the user in Azure AD.
2. **App admin** runs the "deactivate user" action (see Prerequisites) — flags
   profile, removes team memberships, revokes Supabase sessions.
3. **App admin** reassigns the user's open tickets.

Until step 2 runs, the user's existing Supabase session cookie remains valid (up to
the refresh-token lifetime). Step 2 is what guarantees immediate revocation.

### If the client secret leaks

1. Microsoft Entra admin center → **Certificates & secrets** → delete the leaked secret.
2. Create a new secret (24 months).
3. Paste into Supabase dashboard.
4. No app deploy needed.
5. Update password manager backup.

Active sessions are unaffected (the secret is only used for new code exchanges, not
session validation), so this is non-disruptive.

### Adding Microsoft Graph later

If a future feature needs to call Microsoft Graph (Outlook, Teams, Calendar) on the
user's behalf:

1. Microsoft Entra admin center → **API permissions** → add the required Graph scopes and
   `offline_access`.
2. Coordinate with IT for a new admin-consent click.
3. Update the OAuth call in [`src/app/login/page.tsx`](../src/app/login/page.tsx) to
   request the new scopes.
4. Existing users must sign out and back in to receive a token with the new scopes.

### Escalating sign-out to federated logout

If a shared-device or kiosk scenario appears, change the sign-out handler to also
redirect to Microsoft's logout endpoint:

```
https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/logout?post_logout_redirect_uri=<APP_URL>/login
```

This kills the Microsoft session in the browser, forcing a full sign-in next time.
~10-line change in whatever component owns the sign-out button.

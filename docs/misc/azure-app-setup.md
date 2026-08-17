# Azure App Registration & Permissions — Setup Guide

Companion to [`microsoft-sso.md`](./microsoft-sso.md). That document covers the
end-to-end SSO rollout (Supabase config, email audit, staged rollout, runbook).
This document covers **only** the Microsoft Entra side: registering the app,
configuring permissions, and creating the client secret.

Hand this to PEN IT or another engineer doing the Azure work — it stands alone.

**Verified against:** [Microsoft Entra identity platform docs](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app),
current as of the date of this commit. The portal UI labels have changed
recently — older guides referring to the "Azure portal" or "Azure Active
Directory" are stale.

---

## Prerequisites

- An account in PEN's Microsoft Entra tenant with at least the
  **Application Developer** role. Sign-in is at
  [entra.microsoft.com](https://entra.microsoft.com).
- An AAD admin available to grant tenant-wide consent at step 5 — this is
  the **single click** you cannot do yourself unless you have admin role.
- Decided beforehand (see [`microsoft-sso.md`](./microsoft-sso.md)):
  - Co-owner name (a second engineer, for bus-factor).
  - Where the client-secret backup will be stored.

### Conditional Access awareness

Before starting, ask PEN IT:

> "What Conditional Access policies apply to apps in this tenant? Are any of
> them going to block sign-in from a non-corporate device on `http://localhost`
> for engineers running the app locally?"

Two CA-related failure modes to watch for during rollout:

- **MFA challenge on first sign-in.** Users without prior PEN SSO experience
  may be prompted to enroll in MFA on their first Microsoft sign-in to the
  ticketing app. Expected, but warn the team during Stage 1 announcement.
- **Local dev blocked.** If PEN requires a "compliant device" or "hybrid
  Azure AD joined device," `npm run dev` sign-in may fail with an opaque
  error while production works. If this happens, ask IT to scope the policy
  to exclude this app, or use a corporate-managed device for local dev.

---

## 1. Register the application

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com).
2. If you have access to multiple tenants, use the **Settings** icon (top
   menu) to switch to PEN's tenant before continuing.
3. Browse to **Entra ID → App registrations** and select **New registration**.
4. Fill in:

   | Field                       | Value                                 |
   | --------------------------- | ------------------------------------- |
   | **Name**                    | `PEN Ticketing System`                |
   | **Supported account types** | **Single tenant only - <PEN tenant>** |
   | **Redirect URI**            | _Leave blank — added in step 3_       |

5. Select **Register**.
6. The **Overview** page opens. Record:
   - **Application (client) ID** — needed for Supabase.
   - **Directory (tenant) ID** — needed for Supabase as the Azure Tenant URL.

> **Why single-tenant:** the parent guide rules out multi-tenant — Microsoft
> enforces the PEN-employee-only restriction at the identity layer, so the
> app never sees outside-tenant tokens.

---

## 2. Add a co-owner (bus factor)

By default the registration has one owner: you. Without a second owner,
nobody else on the team can rotate the client secret, add redirect URIs, or
modify permissions without escalating to IT.

1. From the app registration's left nav, select **Owners**.
2. Select **Add owners**.
3. Search for the agreed-upon co-owner (a second engineer on the project)
   and add them.

If PEN later creates an engineering-admin Entra group, the registration's
ownership can be transferred to the group at that point — until then,
named individuals.

---

## 3. Add redirect URIs

These are the URLs Microsoft will redirect to with the authorization code
after a successful sign-in.

1. From the app registration's left nav, select **Authentication**.
2. On the **Redirect URI configuration** tab, select **Add Redirect URI**.
3. On the **Select a platform** pane, choose **Web**.
4. Add these redirect URIs:
   - `https://mcefdpjaepmxrexyylqk.supabase.co/auth/v1/callback`
     — Supabase's project-level OAuth callback. **This is the only URL
     Azure ever redirects to.** Supabase then bounces to your app's
     `/auth/callback`.
   - _(Production app URL — added once the production domain is finalized.
     Note: this is the **Supabase** redirect target, registered in the
     Supabase dashboard, not here. Azure does not need to know production
     app URLs separately — the Supabase callback covers everything.)_

5. Select **Configure**.

> **Localhost note:** You do **not** need to add `http://localhost:3000/...`
> in Azure. Azure only sees the Supabase callback; Supabase bounces to your
> app's localhost URL, which is registered in the Supabase dashboard, not
> here.

> **No wildcards.** Preview-deploy URLs (`*.vercel.app`) are intentionally
> not supported. During Stage 1, previews fall back to magic link.

### Front-channel logout URL

Skip — we are not implementing federated single-logout (see parent guide,
Question 7). If a kiosk use case appears later, this field is where the
logout endpoint would go.

---

## 4. Configure API permissions

The app needs three OIDC scopes — `openid`, `email`, `profile` — and
nothing else. Supabase uses these to identify the user; the app never
calls Microsoft Graph.

1. From the app registration's left nav, select **API permissions**.
2. By default, **User.Read** (Microsoft Graph, delegated) is already added.
   **Remove it** — we don't call Graph and unused scopes are noise.
3. Select **Add a permission → Microsoft Graph → Delegated permissions**.
4. Under **OpenId permissions**, check:
   - `openid`
   - `email`
   - `profile`
5. Select **Add permissions**.

Final state of the **Configured permissions** table should be exactly:

| API / Permissions name      | Type      | Description               | Admin consent required |
| --------------------------- | --------- | ------------------------- | ---------------------- |
| Microsoft Graph / `openid`  | Delegated | Sign users in             | No                     |
| Microsoft Graph / `email`   | Delegated | View users' email address | No                     |
| Microsoft Graph / `profile` | Delegated | View users' basic profile | No                     |

> **If Graph access is needed later** (Outlook/Teams/Calendar integration),
> add the required scopes plus `offline_access` here and re-run admin
> consent. See parent guide, "Adding Microsoft Graph later."

---

## 5. Grant admin consent (IT step)

This is the step that requires an Azure AD admin. **You cannot do this
yourself unless you have admin role.**

Send IT this exact ask:

> Hi IT — for the new app registration `PEN Ticketing System`
> (Application ID: `<paste client ID from step 1>`), please click
> **API permissions → Grant admin consent for <PEN tenant>** and
> confirm with **Yes**.
>
> Scopes are `openid`, `email`, `profile` — standard OIDC sign-in scopes,
> no Graph data access.
>
> This consent is one-time and prevents every user from seeing a consent
> prompt on first sign-in. It's also required if our tenant has user-consent
> disabled by policy.

After IT confirms, refresh the **API permissions** page. Each scope's
**Status** column should read **Granted for <PEN tenant>** with a green
checkmark.

---

## 6. Create the client secret

The client secret is the credential Supabase uses to exchange OAuth codes
for tokens. It is shown **exactly once**.

1. From the app registration's left nav, select **Certificates & secrets**.
2. On the **Client secrets** tab, select **New client secret**.
3. Fill in:

   | Field           | Value                                 |
   | --------------- | ------------------------------------- |
   | **Description** | `Supabase OAuth — created YYYY-MM-DD` |
   | **Expires**     | **730 days (24 months)**              |

4. Select **Add**.
5. The new secret appears in the list. **Copy the `Value` column immediately**
   — not the `Secret ID` column. The `Value` is shown once and disappears
   when you leave the page.
6. Paste into:
   - The Supabase dashboard's Azure provider config (see parent guide).
   - The team password manager backup.

> **Microsoft's current recommendation is ≤12 months.** We chose 24 months
> to reduce rotation toil for a small internal app — a deliberate tradeoff,
> not an oversight. If PEN security policy requires shorter, change to 12
> months here and update the calendar reminder in the parent guide
> accordingly.

### Set the rotation reminder

Create a shared calendar event 30 days before the expiry date with title:

> Rotate Microsoft SSO client secret — PEN Ticketing System

Invite the co-owner from step 2. When this secret expires silently, every
user's Microsoft sign-in starts failing with no warning.

---

## 7. Hand off to Supabase

You now have everything the parent guide's "Supabase dashboard setup"
section needs:

| Value                   | Where it came from | Goes into Supabase field                                           |
| ----------------------- | ------------------ | ------------------------------------------------------------------ |
| Application (client) ID | Step 1             | Application (client) ID                                            |
| Client secret **Value** | Step 6             | Secret value                                                       |
| Directory (tenant) ID   | Step 1             | Azure Tenant URL (`https://login.microsoftonline.com/<TENANT_ID>`) |

Return to [`microsoft-sso.md`](./microsoft-sso.md), section "Supabase
dashboard setup," to finish.

---

## What this guide intentionally skips

These options exist in the Entra portal but are not used for PEN Ticketing.
Documented here so reviewers can see they were considered and rejected.

- **Publisher domain verification.** Removes the "unverified" warning on
  consent screens. For admin-consented internal apps, the warning is
  shown once to one person (IT) and never again — not worth the MPN
  enrollment overhead.
- **Optional ID token claims.** The default `name`, `email`, `oid`, `sub`
  claims are enough. `getProfile()` in this repo only reads `name` /
  `full_name` from `user_metadata`, which `profile` scope provides.
- **App branding** (logo, terms-of-service URL, privacy-statement URL).
  Shown on the Microsoft sign-in screen. Required only for apps published
  externally. Internal app — skip.
- **Certificates / federated credentials** instead of client secret.
  Microsoft recommends certificates over secrets for production confidential
  clients. We chose client secret because Supabase's hosted provider config
  UI is built around the secret flow and operational simplicity outweighs
  the marginal security gain for an internal tool. Reconsider if PEN
  security policy changes.
- **"Treat application as a public client"** toggle (under Authentication
  → Advanced settings). Leave **No** — we have a server-side secret, this
  is a confidential client.
- **App roles.** Used for role-based access via Azure AD groups. Our app
  manages roles in its own `Profile.role` field, not via token claims.

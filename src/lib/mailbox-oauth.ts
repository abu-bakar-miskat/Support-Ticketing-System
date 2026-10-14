import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MailProviderError, type OAuthMailboxCredentials } from "@/lib/mail-providers/types";

/**
 * OAuth for Microsoft 365 mailboxes (EM-05): the admin signs in with
 * Microsoft and grants read access to the mailbox, and we keep only the
 * (encrypted) refresh token. Plain `fetch` against the standard OAuth 2.0
 * endpoints — no provider SDK.
 *
 * One multi-tenant Entra app serves every organization: each one's admin signs
 * in with their own account, and the token their directory issues is stored on
 * that mailbox's connection only.
 *
 * Env: MAILBOX_M365_CLIENT_ID / MAILBOX_M365_CLIENT_SECRET (+ optional
 * MAILBOX_M365_TENANT, default "organizations"). Redirect URI to register:
 * `<app origin>/api/admin/mailbox-oauth/microsoft/callback`.
 */

/** The `[provider]` route segment. Microsoft is the only one implemented. */
export type OAuthProviderKey = "microsoft";

export const OAUTH_AUTH_TYPE = {
  microsoft: "OAUTH_M365",
} as const;

type ProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string | undefined;
  clientSecret: string | undefined;
  extraAuthorizeParams: Record<string, string>;
};

// Read lazily so env changes apply without a module reload (and tests can set them).
const PROVIDER_CONFIG: Record<OAuthProviderKey, () => ProviderConfig> = {
  microsoft: () => {
    const tenant = process.env.MAILBOX_M365_TENANT || "organizations";
    return {
      authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      // Mail.Read.Shared also covers shared mailboxes the signed-in user has
      // been granted access to; offline_access yields the refresh token.
      scopes: ["offline_access", "openid", "email", "User.Read", "Mail.Read", "Mail.Read.Shared"],
      clientId: process.env.MAILBOX_M365_CLIENT_ID,
      clientSecret: process.env.MAILBOX_M365_CLIENT_SECRET,
      extraAuthorizeParams: { prompt: "select_account" },
    };
  },
};

function providerConfig(provider: OAuthProviderKey): ProviderConfig {
  return PROVIDER_CONFIG[provider]();
}

export function isOAuthProviderConfigured(provider: OAuthProviderKey): boolean {
  const config = providerConfig(provider);
  return !!config.clientId && !!config.clientSecret;
}

export function oauthRedirectUri(origin: string, provider: OAuthProviderKey): string {
  return `${origin}/api/admin/mailbox-oauth/${provider}/callback`;
}

export function buildAuthorizeUrl(provider: OAuthProviderKey, redirectUri: string, state: string): string {
  const config = providerConfig(provider);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  for (const [key, value] of Object.entries(config.extraAuthorizeParams)) url.searchParams.set(key, value);
  return url.toString();
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(provider: OAuthProviderKey, params: Record<string, string>): Promise<TokenResponse> {
  const config = providerConfig(provider);
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId ?? "",
      client_secret: config.clientSecret ?? "",
      ...params,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    const reason = body.error_description || body.error || `HTTP ${res.status}`;
    // invalid_grant = revoked/expired refresh token or password change → reconnect.
    throw new MailProviderError(`Sign-in was rejected: ${reason}`, res.status === 400 || res.status === 401 ? "auth" : "unreachable");
  }
  return body;
}

/** Exchanges the authorization code for tokens and identifies the signed-in account. */
export async function exchangeAuthorizationCode(
  provider: OAuthProviderKey,
  code: string,
  redirectUri: string,
): Promise<OAuthMailboxCredentials> {
  const tokens = await tokenRequest(provider, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (!tokens.refresh_token) {
    throw new MailProviderError("The provider didn't return a refresh token. Remove the app's access from your account and try again.", "auth");
  }
  const account = await fetchAccountEmail(tokens.access_token);
  return {
    kind: "oauth",
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    account,
  };
}

async function fetchAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new MailProviderError(`Couldn't read the signed-in account (HTTP ${res.status})`, "auth");
  const body = (await res.json()) as { mail?: string | null; userPrincipalName?: string };
  const email = body.mail ?? body.userPrincipalName;
  if (!email) throw new MailProviderError("The signed-in account has no email address", "auth");
  return email.trim().toLowerCase();
}

/**
 * Returns a usable access token, refreshing (and persisting the rotated
 * credentials — Microsoft rotates refresh tokens) when it is near expiry.
 */
export async function getAccessToken(
  provider: OAuthProviderKey,
  credentials: OAuthMailboxCredentials,
  save: (next: OAuthMailboxCredentials) => Promise<void>,
): Promise<string> {
  if (credentials.accessToken && credentials.expiresAt && credentials.expiresAt - 60_000 > Date.now()) {
    return credentials.accessToken;
  }
  const tokens = await tokenRequest(provider, { grant_type: "refresh_token", refresh_token: credentials.refreshToken });
  const next: OAuthMailboxCredentials = {
    ...credentials,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? credentials.refreshToken,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
  await save(next);
  Object.assign(credentials, next);
  return next.accessToken!;
}

// ─── Signed OAuth state ─────────────────────────────────────────────────────

/** What the connect flow carries through the provider round-trip. */
export type MailboxOAuthState = {
  provider: OAuthProviderKey;
  actorId: string;
  departmentId: string;
  teamId: string;
  scopeType: "DEPARTMENT" | "SUB_DEPARTMENT";
  /** M365 shared mailbox to read instead of the signed-in account's own inbox. */
  mailbox?: string;
  /** Re-authorize an existing connection instead of creating one. */
  connectionId?: string;
  /** Same-origin path to send the admin back to. */
  returnTo: string;
  /** Matches the httpOnly nonce cookie set when the flow started (CSRF). */
  nonce: string;
  exp: number;
};

const STATE_TTL_MS = 10 * 60_000;

/** httpOnly cookie holding the per-flow nonce that `state` must match (CSRF). */
export const MAILBOX_OAUTH_NONCE_COOKIE = "mailbox_oauth_nonce";

function stateKey(): Buffer {
  const raw = process.env.MAILBOX_CREDENTIALS_KEY;
  if (!raw) throw new Error("MAILBOX_CREDENTIALS_KEY is not configured");
  // Derive a separate signing key so the encryption key is never used directly as an HMAC key.
  return createHmac("sha256", Buffer.from(raw, "base64")).update("mailbox-oauth-state").digest();
}

export function createOAuthNonce(): string {
  return randomBytes(16).toString("hex");
}

export function signOAuthState(state: Omit<MailboxOAuthState, "exp">): string {
  const payload = Buffer.from(JSON.stringify({ ...state, exp: Date.now() + STATE_TTL_MS })).toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(token: string): MailboxOAuthState | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", stateKey()).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as MailboxOAuthState;
    return state.exp > Date.now() ? state : null;
  } catch {
    return null;
  }
}

/** Only same-origin absolute paths are allowed as a post-connect destination. */
export function safeReturnPath(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

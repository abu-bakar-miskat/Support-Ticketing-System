import { createHmac, createHash } from "node:crypto";

/**
 * Presigned URLs for Cloudflare R2 (S3 SigV4 query auth), dependency-free.
 *
 * Screening video never touches this server: the browser PUTs straight to R2
 * with a short-lived presigned URL, and the review page plays back via a
 * presigned GET. Required env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET. See docs/screening.md for bucket setup
 * (CORS for PUT, 90-day lifecycle rule).
 */

const REGION = "auto";
const SERVICE = "s3";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function r2Configured(): boolean {
  return r2Config() !== null;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** Strict AWS-style URI encoding (RFC 3986, encode everything but unreserved). */
function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function presign(
  method: "PUT" | "GET" | "DELETE",
  objectKey: string,
  expiresSeconds: number,
  extraQuery: Record<string, string> = {},
): string {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 storage is not configured");

  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  // Path-style: /<bucket>/<key>, each path segment encoded. An empty key
  // targets the bucket itself (ListObjectsV2).
  const canonicalUri =
    "/" +
    (objectKey === ""
      ? awsEncode(cfg.bucket)
      : [cfg.bucket, ...objectKey.split("/")].map((s) => awsEncode(s)).join("/"));

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
    ...extraQuery,
  };

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${awsEncode(k)}=${awsEncode(query[k])}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac("AWS4" + cfg.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Short-lived URL the candidate's browser PUTs a recording to. */
export function presignR2Put(objectKey: string, expiresSeconds = 600): string {
  return presign("PUT", objectKey, expiresSeconds);
}

/** URL for playback on the review page / download for transcription. */
export function presignR2Get(objectKey: string, expiresSeconds = 3600): string {
  return presign("GET", objectKey, expiresSeconds);
}

/** URL for removing a recording when a screening invite is deleted. */
export function presignR2Delete(objectKey: string, expiresSeconds = 600): string {
  return presign("DELETE", objectKey, expiresSeconds);
}

// ── Bucket usage ─────────────────────────────────────────────────────────────

export type R2Usage = {
  totalBytes: number;
  objectCount: number;
  /** Bytes per top-level prefix, e.g. { screening: 123, attachments: 456 }. */
  byPrefix: Record<string, number>;
  measuredAt: number;
};

function xmlUnescape(v: string): string {
  return v
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

/** Sum the whole bucket via paginated ListObjectsV2. */
async function measureR2Usage(): Promise<R2Usage> {
  const usage: R2Usage = { totalBytes: 0, objectCount: 0, byPrefix: {}, measuredAt: Date.now() };
  let token: string | undefined;
  for (let page = 0; page < 50; page++) {
    const query: Record<string, string> = { "list-type": "2", "max-keys": "1000" };
    if (token) query["continuation-token"] = token;
    const res = await fetch(presign("GET", "", 120, query));
    if (!res.ok) throw new Error(`R2 list failed: ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>[\s\S]*?<\/Contents>/g)) {
      const key = xmlUnescape(m[0].match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? "");
      const size = Number(m[0].match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0);
      usage.totalBytes += size;
      usage.objectCount += 1;
      const prefix = key.includes("/") ? key.slice(0, key.indexOf("/")) : "(root)";
      usage.byPrefix[prefix] = (usage.byPrefix[prefix] ?? 0) + size;
    }
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) break;
    token = xmlUnescape(xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? "");
    if (!token) break;
  }
  return usage;
}

let usageCache: R2Usage | null = null;
const USAGE_TTL_MS = 2 * 60 * 1000;

/**
 * Bucket usage for display. Returns the cached figure immediately (sweeping
 * only when there is none yet); pair with refreshR2UsageIfStale() in after()
 * so renders never wait on a sweep but the figure stays ~2 minutes fresh.
 */
export async function r2UsageCached(): Promise<R2Usage | null> {
  if (!r2Configured()) return null;
  if (usageCache) return usageCache;
  try {
    usageCache = await measureR2Usage();
    return usageCache;
  } catch {
    return null;
  }
}

/** Re-sweep when the cached figure is older than the TTL. Safe to fire-and-forget. */
export async function refreshR2UsageIfStale(): Promise<void> {
  if (!r2Configured()) return;
  if (usageCache && Date.now() - usageCache.measuredAt < USAGE_TTL_MS) return;
  try {
    usageCache = await measureR2Usage();
  } catch {
    // keep the stale figure
  }
}

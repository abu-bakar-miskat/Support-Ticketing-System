// Provisions the Supabase Storage bucket used for every file upload in the app
// (avatars, tenant/department logos, ticket & project attachments, intake files).
//
// Idempotent and additive: creates the "attachments" bucket only if missing, and
// otherwise just ensures it's public without tightening existing limits — safe to
// run against the shared project. It does NOT touch RLS policies; run
// supabase-storage-policies.sql for those (service-role uploads bypass RLS, but
// authenticated browser uploads need the policies).
//
// Run: npx tsx scripts/setup-storage.ts
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

const BUCKET = "attachments"
const FILE_SIZE_LIMIT = 50 * 1024 * 1024 // 50 MB — matches MAX_FILE_BYTES in src/lib/storage.ts

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment",
    )
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  if (listError) throw new Error(`Could not list buckets: ${listError.message}`)

  const existing = buckets.find((b) => b.id === BUCKET || b.name === BUCKET)

  if (!existing) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: FILE_SIZE_LIMIT,
      // Allow all types — per-upload validation (images vs any file) lives in
      // src/lib/storage.ts, so we don't restrict at the bucket level.
      allowedMimeTypes: undefined,
    })
    if (error) throw new Error(`Could not create bucket: ${error.message}`)
    console.log(`✓ Created public bucket "${BUCKET}" (${FILE_SIZE_LIMIT} byte limit).`)
    return
  }

  console.log(
    `• Bucket "${BUCKET}" already exists (public=${existing.public}). Ensuring it is public…`,
  )
  if (!existing.public) {
    const { error } = await supabase.storage.updateBucket(BUCKET, { public: true })
    if (error) throw new Error(`Could not update bucket: ${error.message}`)
    console.log(`✓ Set bucket "${BUCKET}" to public.`)
  } else {
    console.log(`✓ Nothing to do — bucket is already public.`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗", err instanceof Error ? err.message : err)
    process.exit(1)
  })

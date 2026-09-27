// ─────────────────────────────────────────────────────────────────────────────
// Supabase Storage helpers. All uploads use the two-step signed-upload pattern
// (server issues a signed upload URL, client PUTs the bytes directly — file
// bytes never pass through this API server, so the Hono bodyLimit stays small).
// Downloads from the private bug-screenshots bucket use short-lived signed URLs;
// avatars live in a public bucket and are served by plain public URL.
// ─────────────────────────────────────────────────────────────────────────────
import { TRPCError } from "@trpc/server";
import { env } from "./env";
import { adminClient } from "./supabase-clients";

// Storage signing needs the service-role key; the shared factory adds a fetch
// timeout so a slow Storage API cannot hold a request open indefinitely.
const storageClient = adminClient;

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

export function imageExtFor(mime: string): string {
  const ext = MIME_EXT[mime];
  if (!ext) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only PNG, JPEG, or WebP images are allowed." });
  }
  return ext;
}

export function assertImageUpload(mime: string, size: number, maxBytes: number) {
  imageExtFor(mime); // throws on bad mime
  if (size > maxBytes) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `File too large — max ${Math.round(maxBytes / (1024 * 1024))} MB.`,
    });
  }
}

// Issue a signed upload URL the client PUTs to (via uploadToSignedUrl). Returns
// the storage path plus the token the client needs.
export async function createUpload(
  bucket: string,
  path: string,
  options: { upsert?: boolean } = {},
): Promise<{ path: string; token: string; uploadUrl: string }> {
  const { data, error } = await storageClient().storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: options.upsert ?? false });
  if (error || !data) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't start the upload." });
  }
  return { path: data.path, token: data.token, uploadUrl: data.signedUrl };
}

export function publicUrl(bucket: string, path: string): string {
  return storageClient().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function signedDownloadUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string> {
  const { data, error } = await storageClient().storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Couldn't load that file." });
  }
  return data.signedUrl;
}

// Fetch an object's bytes server-side (e.g. for text extraction).
export async function downloadObject(bucket: string, path: string, maxBytes: number): Promise<Buffer> {
  const client = storageClient().storage.from(bucket);
  const info = await client.info(path);
  if (info.error || !info.data) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Couldn't read that file." });
  }
  if (!Number.isFinite(info.data.size) || Number(info.data.size) > maxBytes) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Stored file exceeds the allowed size." });
  }
  const { data, error } = await client.download(
    path,
    {},
    { signal: AbortSignal.timeout(env.externalRequestTimeoutMs) },
  );
  if (error || !data) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Couldn't read that file." });
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Stored file exceeds the allowed size." });
  }
  return buffer;
}

export interface StoredObjectPolicy {
  allowedMimeTypes: readonly string[];
  maxBytes: number;
  expectedMime?: string;
  expectedSize?: number;
}

function hasExpectedSignature(mime: string, bytes: Uint8Array): boolean {
  if (mime === "application/pdf") return Buffer.from(bytes).subarray(0, 5).toString("ascii") === "%PDF-";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }
  if (mime === "text/plain") return !bytes.includes(0);
  if (mime === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/webp") {
    return Buffer.from(bytes).subarray(0, 4).toString("ascii") === "RIFF" &&
      Buffer.from(bytes).subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

async function objectPrefix(bucket: string, path: string): Promise<Uint8Array> {
  const url = await signedDownloadUrl(bucket, path, 60);
  const response = await fetch(url, {
    headers: { Range: "bytes=0-511" },
    signal: AbortSignal.timeout(env.externalRequestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Storage prefix read failed (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function assertStoredObject(
  bucket: string,
  path: string,
  policy: StoredObjectPolicy,
): Promise<{ mime: string; size: number }> {
  const client = storageClient().storage.from(bucket);
  const { data, error } = await client.info(path);
  const mime = data?.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const size = Number(data?.size);
  const metadataValid =
    !error &&
    Boolean(data) &&
    policy.allowedMimeTypes.includes(mime) &&
    Number.isInteger(size) &&
    size > 0 &&
    size <= policy.maxBytes &&
    (policy.expectedMime === undefined || mime === policy.expectedMime) &&
    (policy.expectedSize === undefined || size === policy.expectedSize);

  let signatureValid = false;
  if (metadataValid) {
    try {
      signatureValid = hasExpectedSignature(mime, await objectPrefix(bucket, path));
    } catch {
      signatureValid = false;
    }
  }

  if (!metadataValid || !signatureValid) {
    await removeObject(bucket, path);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The uploaded file does not match the allowed type or size.",
    });
  }
  return { mime, size };
}

// Best-effort object removal (row deletion must not fail on a missing object).
export async function removeObject(bucket: string, path: string): Promise<void> {
  await removeObjects(bucket, [path]);
}

/** Best-effort bulk removal, in Storage's 100-object batches. Failures are
 *  logged; the daily orphan sweep (storage-sweep.ts) picks up what was missed. */
export async function removeObjects(bucket: string, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await storageClient().storage.from(bucket).remove(batch);
    if (error) console.warn(`[storage] failed to remove ${batch.length} object(s) from ${bucket}:`, error.message);
  }
}

export interface StoredObjectInfo {
  name: string;
  /** Null (at runtime) for a folder entry. */
  id: string | null;
  createdAt: string | null;
}

/** One page of a bucket listing under `prefix`. Folders come back with a null id. */
export async function listObjects(bucket: string, prefix: string, limit: number, offset = 0): Promise<StoredObjectInfo[]> {
  const { data, error } = await storageClient().storage
    .from(bucket)
    .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(`Storage list failed for ${bucket}/${prefix}: ${error.message}`);
  return (data ?? []).map((o) => ({ name: o.name, id: (o.id as string | null) ?? null, createdAt: o.created_at ?? null }));
}

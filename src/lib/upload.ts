// Upload directly to a short-lived, server-issued Storage URL. No Supabase key
// is baked into the browser bundle and Docker builds need no VITE_* secrets.
export async function uploadToSignedUrl(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "x-upsert": "true" },
    body,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail.slice(0, 200) || `Upload failed (${response.status}).`);
  }
}

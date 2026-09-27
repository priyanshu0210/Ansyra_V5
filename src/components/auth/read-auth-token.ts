// Split out of AuthLayout.tsx so that file exports components only
// (react-refresh/only-export-components). Logic unchanged.

// Read token_hash + type from the query string, falling back to the URL hash
// fragment (Supabase's default recovery/invite links can land either place).
export function readAuthToken(): { tokenHash: string | null; type: string | null } {
  const qs = new URLSearchParams(window.location.search);
  let tokenHash = qs.get("token_hash");
  let type = qs.get("type");
  if (!tokenHash && window.location.hash) {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    tokenHash = tokenHash ?? hash.get("token_hash");
    type = type ?? hash.get("type");
  }
  return { tokenHash, type };
}

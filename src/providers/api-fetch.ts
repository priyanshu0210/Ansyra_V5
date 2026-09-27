// ─────────────────────────────────────────────────────────────────────────────
// ONE FETCH, AND IT FAILS IN ENGLISH.
//
// tRPC calls `.json()` on whatever comes back. When the response is not JSON at
// all the browser's own error surfaces instead, and the reader is shown:
//
//     Failed to execute 'json' on 'Response': Unexpected end of JSON input
//
// which was rendered verbatim under the password field on the login form. It
// names the parser, not the problem, and it appears in exactly the situations
// where the reader most needs to know what is wrong: a static host answering
// /api/* with its index.html or a 404 page, a proxy returning an HTML 502, a
// gateway timeout, an origin serving the built assets with no server behind
// them.
//
// So anything that is not JSON is turned into a sentence about the API before
// tRPC ever tries to parse it. Responses that ARE JSON — including every tRPC
// error, which is JSON with a non-2xx status — are passed straight through
// untouched, so the server's own messages keep arriving verbatim.
//
// THERE ARE TWO WAYS TO FAIL, AND THE FIRST VERSION ONLY COVERED ONE.
//
//   1. A response arrives and is not JSON  → handled below by content-type.
//   2. No response arrives at all           → `fetch` REJECTS, and the browser's
//      word for it is the bare string "Failed to fetch".
//
// The second is the commoner one in practice — the server is not running, it
// was restarted, the connection dropped — and it was shipped unhandled, so the
// login form displayed "Failed to fetch" and the fix was half a fix. Both paths
// now say which origin could not be reached and what to do.
// ─────────────────────────────────────────────────────────────────────────────

/** Named in the unreachable-server message, so the reader knows WHICH origin. */
function origin(): string {
  try {
    return globalThis.location?.origin || "this origin";
  } catch {
    return "this origin";
  }
}

function describeNonJson(res: Response, body: string): string {
  const where = `${res.status} ${res.statusText}`.trim();
  // A static file server answering an API path is the common case in a
  // misconfigured preview or deploy, and it is worth naming precisely, because
  // the fix is a server one and nothing about the request was wrong.
  if (res.status === 404) {
    return `The API did not respond at /api/trpc (${where}). The app is running without its server — check that the API is started and serving this origin.`;
  }
  if (res.status >= 500) {
    return `The server failed to handle this request (${where}). It returned a page rather than a response, which usually means it errored before reaching the app.`;
  }
  if (res.ok) {
    return `The API returned something that isn't a response (${where}). This origin is serving files where the API should be.`;
  }
  const snippet = body.trim().slice(0, 120);
  return `The API returned an unexpected response (${where})${snippet ? `: ${snippet}` : ""}`;
}

export async function apiFetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
  } catch (cause) {
    // NO RESPONSE EXISTS HERE. `fetch` rejects before there is anything to
    // inspect — the server is not listening, the connection dropped, DNS
    // failed, the origin was blocked. The browser's own word for all of that is
    // the bare string "Failed to fetch", which was rendered under the password
    // field and is exactly as useless as the JSON parser message this file was
    // written to replace. Half a fix, until this branch existed.
    //
    // A CANCELLED REQUEST IS NOT A FAILURE and must pass through untouched:
    // react-query aborts in-flight queries on unmount and on refetch, and
    // dressing those up as "the server is unreachable" would put an error in
    // front of the reader every time they navigated quickly.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    if (init?.signal?.aborted) throw cause;

    throw new Error(
      `Can't reach the Ansyra server at ${origin()}. It may not be running, or the connection dropped. Check the server is started, then reload.`,
      { cause },
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("json")) return res;

  // Read from a clone so the original body stays intact for anything that
  // inspects it, and so this never becomes the reason a good response fails.
  let body = "";
  try {
    body = await res.clone().text();
  } catch {
    /* unreadable body: the status alone still makes a better message than the parser's */
  }
  throw new Error(describeNonJson(res, body));
}

// Deduplicate read-only permission lookups within one HTTP request. No grant
// survives into another request, so revocations are checked on every request.
const requests = new WeakMap<Request, Map<string, Promise<Set<string>>>>();
export function requestFeatures(request: Request, userId: string, load: () => Promise<Set<string>>) {
  let users = requests.get(request);
  if (!users) { users = new Map(); requests.set(request, users); }
  let pending = users.get(userId);
  if (!pending) { pending = load(); users.set(userId, pending); }
  return pending;
}

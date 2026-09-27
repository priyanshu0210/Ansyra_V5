const UUID_LEAF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|txt|png|jpg|webp)$/i;
/** Accept only the exact prefix and leaf format emitted by the upload issuer. */
export function isIssuedUploadPath(path: string, prefix: string): boolean {
  const parts = path.split("/");
  return parts.length === 2 && parts[0] === prefix && UUID_LEAF.test(parts[1]);
}
export function isAvatarPath(path: string, userId: string): boolean {
  return ["png", "jpg", "webp"].some(ext => path === `${userId}.${ext}`);
}

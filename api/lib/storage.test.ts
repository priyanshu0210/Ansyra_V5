import { describe, expect, it } from "vitest";
import { assertImageUpload, imageExtFor } from "./storage";

// Pure validators guarding the two image-upload paths (avatars, bug
// screenshots). They are the only thing standing between a user-supplied
// content type and a storage object, and neither had a test.

describe("imageExtFor", () => {
  it("maps the accepted image types", () => {
    expect(imageExtFor("image/png")).toBe("png");
    expect(imageExtFor("image/jpeg")).toBe("jpg");
    expect(imageExtFor("image/jpg")).toBe("jpg");
    expect(imageExtFor("image/webp")).toBe("webp");
  });

  it("rejects anything else", () => {
    for (const mime of ["text/html", "application/pdf", "image/gif", ""]) {
      expect(() => imageExtFor(mime)).toThrow(/Only PNG, JPEG, or WebP/i);
    }
  });

  it("rejects SVG specifically", () => {
    // SVG is an image type that can carry script. Serving one from the PUBLIC
    // avatars bucket would be stored XSS, so this exclusion is load-bearing
    // rather than an oversight about which formats happen to be convenient.
    expect(() => imageExtFor("image/svg+xml")).toThrow(/Only PNG, JPEG, or WebP/i);
  });

  it("does not accept a mime with parameters appended", () => {
    // `image/png; charset=binary` is a legal header value and must not slip
    // through a map lookup that only knows the bare type.
    expect(() => imageExtFor("image/png; charset=binary")).toThrow();
  });
});

describe("assertImageUpload", () => {
  const MB = 1024 * 1024;

  it("accepts a valid image under the limit", () => {
    expect(() => assertImageUpload("image/png", 1 * MB, 5 * MB)).not.toThrow();
  });

  it("accepts a file exactly at the limit", () => {
    expect(() => assertImageUpload("image/png", 5 * MB, 5 * MB)).not.toThrow();
  });

  it("rejects a file one byte over the limit", () => {
    expect(() => assertImageUpload("image/png", 5 * MB + 1, 5 * MB)).toThrow(/max 5 MB/i);
  });

  it("checks the mime before the size", () => {
    // An oversized SVG should report the type problem, not the size one — the
    // type is the security issue and the message a user can act on.
    expect(() => assertImageUpload("image/svg+xml", 50 * MB, 5 * MB)).toThrow(/Only PNG, JPEG, or WebP/i);
  });

  it("accepts a zero-byte file, which is a real upload outcome", () => {
    // Documents current behaviour: size validation is a ceiling only. A truncated
    // or failed client upload lands as 0 bytes and is accepted here. Whether that
    // should be rejected is a product question, but it should not change silently.
    expect(() => assertImageUpload("image/png", 0, 5 * MB)).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { isAvatarPath, isIssuedUploadPath } from "./upload-path";
const leaf = "00000000-0000-4000-8000-000000000001.pdf";
describe("upload reference ownership", () => {
  it("accepts an issued document leaf", () => expect(isIssuedUploadPath(`12/${leaf}`, "12")).toBe(true));
  it.each([`12/../13/${leaf}`, `12/%2e%2e/${leaf}`, `13/${leaf}`, `12/a/${leaf}`, `12/${leaf}?x=1`, `12/${leaf}#x`])("rejects traversal or reinterpreted paths: %s", p => expect(isIssuedUploadPath(p, "12")).toBe(false));
  it("accepts only exact avatar names", () => {
    expect(isAvatarPath("user.png", "user")).toBe(true);
    expect(isAvatarPath("user.png/../other.jpg", "user")).toBe(false);
    expect(isAvatarPath("user.svg", "user")).toBe(false);
  });
});

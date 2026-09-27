// One definition of "the chunk didn't arrive", shared by both boundaries.
//
// There is no error code to key on — each engine words this differently and all
// of them only put it in the message — so the detection is a regex over prose.
// That makes it exactly the kind of thing that must live in one place and be
// unit-tested, rather than being retyped at each catch site with one engine
// forgotten.
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  // Chrome / Vite: "Failed to fetch dynamically imported module"
  // Firefox:       "error loading dynamically imported module"
  // Safari:        "Importing a module script failed"
  return /dynamically imported module|module script failed|Failed to fetch dynamically|ChunkLoadError/i.test(
    message,
  );
}

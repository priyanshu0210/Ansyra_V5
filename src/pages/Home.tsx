import { Experience } from "@/components/ansyra/experience";
import { Grain } from "@/components/ansyra/landing/Grain";

export default function Home() {
  return (
    <div
      className="relative min-h-screen w-full"
      style={{
        // `overflow-x: clip`, NOT `hidden`.
        //
        // `overflow-x: hidden` computes to `overflow: hidden auto` — the y axis
        // becomes `auto`, which makes this element a scroll container, and a
        // scroll container between the viewport and a `position: sticky` child
        // is exactly what stops it sticking. The pinned instrument stack has
        // therefore never pinned: it scrolled past like an ordinary block, on
        // every browser, since the day it was written. (docs/refraction-
        // outstanding.md listed B7's pin as untested; this is why.)
        //
        // `clip` still prevents the horizontal overflow this was here for, and
        // creates no scroll container, so sticky works.
        overflowX: "clip",
      }}
    >
      <Experience />
      <Grain />
    </div>
  );
}

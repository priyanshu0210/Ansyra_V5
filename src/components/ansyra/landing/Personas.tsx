import { Reveal, SectionHeading } from "./Reveal";
import { PersonaDeck } from "./PersonaDeck";

// ─────────────────────────────────────────────────────────────────────────────
// B4. Who it's for.
//
// Six equal blocks in a 3-col grid, which is the layout that says "these are
// interchangeable" about six audiences that are not. It is now one featured
// persona at double weight and five compact, in an asymmetric composition.
//
// UNPINNED, and that is a trade made on purpose. The plan had this as a
// ~450vh sticky-scroll deck; it gave up its pin so B7's stack could keep one.
// Of the three candidates this had the worst ratio of scroll cost to payoff:
// 450vh of held scrollbar to say "here is who uses it". B3's pin is short and
// load-bearing (light needs scroll to travel) and B7's is where tap-to-advance
// earns it. Composition can carry this section; a pin was never what made it
// work.
//
// NO PHOTOGRAPHY, NO PEOPLE, NO HANDSHAKES. The one imagery rule that survived
// the rework intact. Each persona carries a line about what it actually
// receives instead, which is worth more than a stock portrait of someone
// looking thoughtfully at a laptop.
// ─────────────────────────────────────────────────────────────────────────────

export function Personas() {
  return (
    <section id="roles" data-testid="section-roles" className="w-full py-20 md:py-28">
      <div className="mx-auto w-full max-w-[1560px] px-6">
        <Reveal>
          <div className="border-t" style={{ borderColor: "var(--fg)" }} />
        </Reveal>

        <div className="mt-10 max-w-3xl">
          <SectionHeading
            title="For everyone who has to defend a deal decision."
            lede="Before close, and long after."
          />
        </div>

        {/* THE DECK. Six audiences that are the same KIND of thing, one of them
            in front. This replaces an asymmetric grid in which exactly one
            persona had a surface and the other five were bare text on the
            ground — so the featured one read as the only one that had rendered,
            and the section contained no interactive element at all. */}
        <div className="mt-14">
          <PersonaDeck />
        </div>
      </div>
    </section>
  );
}

import { ArcZone } from "./Ground";
import { Movements } from "./Movements";
import { Personas } from "./Personas";
import { AISection, PlatformSection, ProblemSection } from "./sections";
import { Closing } from "./Closing";

export default function LandingBody({
  attachArc,
}: {
  attachArc: (node: HTMLDivElement | null) => void;
}) {
  return (
    <>
      <Movements />
      <ProblemSection />
      <ArcZone zoneRef={attachArc} />
      <PlatformSection />
      <AISection />
      <Personas />
      <Closing />
    </>
  );
}

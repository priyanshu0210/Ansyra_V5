import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Binoculars,
  BookOpen,
  Check,
  ChevronRight,
  CircleDot,
  Database,
  Eye,
  Gavel,
  Landmark,
  Scale,
  ScanSearch,
  Users,
  type LucideIcon,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// C1. Icons.
//
// The site was text-only, and part of why it read as empty. Lucide, used
// generously but never randomly.
//
// ONE STROKE WIDTH, SITE-WIDE. 1.5, locked here and nowhere else. Mixed stroke
// weights are the fastest way to make an icon set look assembled rather than
// chosen, and the only reliable way to prevent it is to make the weight
// impossible to pass in. There is deliberately no `strokeWidth` prop.
//
// WHERE ICONS ARE ALLOWED (the whole list):
//   MEANING     severity bands, the sign-off gate, pipeline stage kinds. Always
//               paired with a text label, never standing in for one.
//   STRUCTURAL  arrows on links and CTAs, disclosure chevrons, external marks.
//   SCALE       one large mark per persona and per instrument page, as a
//               graphic element rather than an annotation.
//
// WHERE THEY ARE NOT: beside every heading, as a bullet substitute, or inside
// ledger rows. The ledger already encodes severity three ways (illumination,
// backlight blur, hue); a fourth channel there would be noise, not redundancy.
// ─────────────────────────────────────────────────────────────────────────────

/** The one stroke weight. Not overridable, on purpose. */
const STROKE = 1.5;

export type IconName =
  | "arrow"
  | "arrow-out"
  | "chevron"
  | "flag"
  | "watch"
  | "grounded"
  | "scope"
  | "ground"
  | "analyze"
  | "verdict"
  | "study"
  | "node"
  | "pe"
  | "corpdev"
  | "advisor"
  | "consultant"
  | "family"
  | "counsel";

const MAP: Record<IconName, LucideIcon> = {
  arrow: ArrowRight,
  "arrow-out": ArrowUpRight,
  chevron: ChevronRight,
  // Severity. Paired with the label, never replacing it.
  flag: AlertTriangle,
  watch: Eye,
  grounded: Check,
  // Pipeline stage kinds: what each stage DOES, not four variations of a dot.
  scope: ScanSearch,
  ground: Database,
  analyze: Binoculars,
  verdict: Gavel,
  study: BookOpen,
  node: CircleDot,
  // Personas.
  pe: Landmark,
  corpdev: Users,
  advisor: Scale,
  consultant: Binoculars,
  family: Landmark,
  counsel: Gavel,
};

export function Icon({
  name,
  size = 16,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const C = MAP[name];
  return (
    <C
      size={size}
      strokeWidth={STROKE}
      className={className}
      style={style}
      aria-hidden
      focusable={false}
    />
  );
}

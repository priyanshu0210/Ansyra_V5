import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { useMotionPref } from "@/hooks/useMotionPref";

// Parchment motion layer (Phase 12.x polish). One small, reduced-motion-aware
// set of entrance primitives so the app surfaces get the same restrained
// rise-in the landing "acts" already have (see `.act-stagger` in index.css:
// 12px rise, ~500ms ease-out, 80ms stagger).
//
// Motion policy (premium but respectful — matches the landing's two tiers):
//   • full motion → fade + 12px rise.
//   • reduced     → a CALM opacity-only fade (no movement, so it can't trigger
//                   vestibular discomfort) — never a dead, instant cut. The
//                   surface still breathes in; it just doesn't move.
// Do NOT add these to the landing (`ansyra/*`); it owns its own motion.
//
// THE INPUT IS `useMotionPref`, NOT framer's `useReducedMotion`.
//
// These four components used to read the OS media query directly, while the CSS
// tier they were written to match (`.act-stagger`, src/index.css) was moved onto
// the app's own `data-motion` attribute. That left the dashboard with two motion
// authorities disagreeing in BOTH directions:
//
//   • a visitor whose OS asks for reduced motion got these suppressed while the
//     CSS staggers kept running;
//   • a visitor who pressed **Still** got the CSS suppressed while these kept
//     animating.
//
// `useMotionPref` is the single source of truth for the whole app: it is what
// the Still control writes, what the pre-paint boot script reads, and what sets
// `data-motion` on <html>. Reading anything else here means the control only
// governs half the surface. The two-tier policy above is unchanged — only where
// the answer comes from.

const RISE = 12; // px, matches @keyframes stagger-rise
const EASE = [0.16, 1, 0.3, 1] as const; // gentle ease-out, paper-like settle
const DUR = 0.5;
const DUR_REDUCED = 0.45; // opacity-only fade still reads as intentional
const STEP = 0.08; // 80ms between children, matches act-stagger delays
const STEP_REDUCED = 0.05; // keep a gentle sequence even without movement

/** Container that reveals its <Reveal>/<StaggerItem> children in sequence. */
export function Stagger({
  children,
  className,
  step = STEP,
  once = true,
  inView = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Delay between children, in seconds. */
  step?: number;
  /** Animate only the first time it enters (ignored when inView is false). */
  once?: boolean;
  /** Trigger on scroll-into-view instead of on mount. */
  inView?: boolean;
} & Record<string, unknown>) {
  const reduced = useMotionPref();
  const variants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? STEP_REDUCED : step } },
  };
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      {...(inView ? { whileInView: "show", viewport: { once, amount: 0.2 } } : { animate: "show" })}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

const itemVariants = (reduced: boolean | null): Variants => ({
  hidden: { opacity: 0, y: reduced ? 0 : RISE },
  show: { opacity: 1, y: 0, transition: { duration: reduced ? DUR_REDUCED : DUR, ease: EASE } },
});

/** A single child of <Stagger>. Rises in when the container plays. */
export function StaggerItem({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & Record<string, unknown>) {
  const reduced = useMotionPref();
  return (
    <motion.div className={className} variants={itemVariants(reduced)} {...rest}>
      {children}
    </motion.div>
  );
}

/** Standalone fade+rise, for a single element outside a <Stagger>. */
export function Reveal({
  children,
  className,
  delay = 0,
  inView = false,
  once = true,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  inView?: boolean;
  once?: boolean;
} & Record<string, unknown>) {
  const reduced = useMotionPref();
  const variants: Variants = {
    hidden: { opacity: 0, y: reduced ? 0 : RISE },
    show: { opacity: 1, y: 0, transition: { duration: reduced ? DUR_REDUCED : DUR, ease: EASE, delay } },
  };
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      {...(inView ? { whileInView: "show", viewport: { once, amount: 0.2 } } : { animate: "show" })}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Hover-lift wrapper for interactive cards. Deeper, springier than the
 *  CSS `-translate-y-[1px]`; disabled under reduced motion. */
export function HoverLift({
  children,
  className,
  onClick,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
} & Record<string, unknown>) {
  const reduced = useMotionPref();
  return (
    <motion.div
      className={className}
      onClick={onClick}
      whileHover={reduced ? undefined : { y: -3 }}
      whileTap={reduced ? undefined : { y: -1 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

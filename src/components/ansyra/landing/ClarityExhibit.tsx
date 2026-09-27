import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, FileText, GitBranch, RotateCcw, ScanLine, ShieldCheck } from "lucide-react";
import "./ClarityExhibit.css";

const stories = [
  {
    question: "What supports the valuation?", short: "Valuation", outcome: "A price you can explain.",
    description: "Follow the numbers back to their source, then see what changed the decision.",
    nodes: [
      { title: "The earnings report", value: "$24M EBITDA", label: "Source evidence", detail: "Management presents $24M of adjusted earnings. The quality-of-earnings report identifies $4M of adjustments that still need support.", source: "Illustrative quality-of-earnings report · page 12", excerpt: "Adjusted EBITDA: $24M. Unverified add-backs: $4M.", type: "document" },
      { title: "The entry case", value: "8.0× → 9.6×", label: "Working assumption", detail: "A $192M enterprise value is 8.0× management EBITDA. Against $20M of supported earnings, the same price is 9.6×. The price has not changed; the evidence behind it has.", source: "Illustrative valuation bridge · USD", excerpt: "$192M ÷ $24M = 8.0×   /   $192M ÷ $20M = 9.6×", type: "math" },
      { title: "The reviewer’s challenge", value: "$4M to substantiate", label: "Human review", detail: "The reviewer asks for invoices and a reconciliation for the disputed adjustments. Until those arrive, the investment case uses the supported earnings base.", source: "Illustrative diligence note · financial review", excerpt: "Which adjustments are truly non-recurring, and where is the evidence?", type: "review" },
      { title: "The recorded decision", value: "Revisit the price", label: "Decision record", detail: "The committee records a conditional decision to revisit price. The source, calculation, and reviewer’s concern stay connected, so the next person can understand why.", source: "Illustrative committee record · conditional", excerpt: "Re-underwrite on $20M of supported earnings before advancing.", type: "decision" },
    ],
  },
  {
    question: "What could stop the deal?", short: "Deal risk", outcome: "A concern with a clear owner.",
    description: "Trace a contract clause to the assumption it challenges and the action it requires.",
    nodes: [
      { title: "The customer contract", value: "Consent required", label: "Source evidence", detail: "A major customer contract contains a change-of-control consent clause. The clause is surfaced for the deal team to review with counsel.", source: "Illustrative customer agreement · clause 14.2", excerpt: "Prior written consent is required upon a change of control.", type: "document" },
      { title: "The revenue case", value: "18% concentration", label: "Working assumption", detail: "The base case assumes revenue from this customer continues after closing. With 18% of sales tied to the relationship, that assumption needs explicit support.", source: "Illustrative customer concentration schedule", excerpt: "Base case assumes uninterrupted customer revenue after close.", type: "math" },
      { title: "The unanswered question", value: "Who owns consent?", label: "Human review", detail: "The reviewer assigns the consent request to transaction counsel and asks the commercial team to confirm the customer’s position. A reassuring forecast is not a signed consent.", source: "Illustrative legal diligence note", excerpt: "Attach written consent, or document the contingency and its owner.", type: "review" },
      { title: "The recorded decision", value: "Hold for evidence", label: "Decision record", detail: "The deal stays on hold until the concern is answered. The record makes the missing evidence and next action visible, without inventing a legal conclusion.", source: "Illustrative committee record · hold", excerpt: "Do not advance until consent or an approved contingency is recorded.", type: "decision" },
    ],
  },
  {
    question: "Did the synergies materialise?", short: "Post-close", outcome: "A promise measured against reality.",
    description: "Follow an acquisition promise through its delivery plan to the first operating review.",
    nodes: [
      { title: "The integration plan", value: "$6M promised", label: "Source evidence", detail: "The acquisition case targets $6M of annual procurement savings. The plan records the baseline, delivery owner, and measurement period.", source: "Illustrative integration plan · procurement", excerpt: "Annual procurement savings target: $6M. Review at year one.", type: "document" },
      { title: "The delivery assumption", value: "12 months to deliver", label: "Working assumption", detail: "The case assumes supplier consolidation can be completed in the first year. Contract renewal dates and qualification lead times are the dependencies to test.", source: "Illustrative synergy assumption · year one", excerpt: "Savings depend on supplier qualification and contract renewal.", type: "math" },
      { title: "The operating review", value: "$3.6M realised", label: "Human review", detail: "At year one, recorded savings total $3.6M: 60% of the $6M plan, a $2.4M shortfall. The review separates delivered savings from benefits that remain forecast.", source: "Illustrative operating scorecard · year one", excerpt: "$3.6M actual ÷ $6M planned = 60% realised.", type: "review" },
      { title: "The recorded decision", value: "Reset the delivery plan", label: "Decision record", detail: "The team records a revised timetable and the workstreams still outstanding. The original promise remains visible alongside the outcome, informing the next acquisition case.", source: "Illustrative integration review · corrective action", excerpt: "Assign an owner and a revised date to each undelivered workstream.", type: "decision" },
    ],
  },
] as const;
const icons = [FileText, GitBranch, ScanLine, ShieldCheck];
type Point = { x: number; y: number };
const arrangements: Point[][] = [
  [{ x: 17, y: 158 }, { x: 72, y: 98 }, { x: 27, y: 445 }, { x: 83, y: 390 }],
  [{ x: 24, y: 108 }, { x: 82, y: 184 }, { x: 17, y: 375 }, { x: 71, y: 454 }],
  [{ x: 15, y: 213 }, { x: 66, y: 90 }, { x: 34, y: 462 }, { x: 83, y: 350 }],
];
const mobileArrangements: Point[][] = [
  [{ x: 22, y: 123 }, { x: 77, y: 100 }, { x: 23, y: 402 }, { x: 77, y: 438 }],
  [{ x: 23, y: 99 }, { x: 76, y: 130 }, { x: 22, y: 433 }, { x: 77, y: 398 }],
  [{ x: 22, y: 135 }, { x: 77, y: 99 }, { x: 23, y: 398 }, { x: 77, y: 435 }],
];
const satellites = [
  ["Earnings report", "Adjustments", "Committee memo", "Price calculation"],
  ["Clause 14.2", "Customer mix", "Consent", "Counsel"],
  ["Baseline", "Renewal dates", "Actual savings", "Delivery owner"],
];
const photo = "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=640&q=85";

export function ClarityExhibit() {
  const [storyIndex, setStoryIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [positions, setPositions] = useState(arrangements[0]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [compact, setCompact] = useState(false);
  const [motionOff, setMotionOff] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; x: number; y: number; point: Point; moved: boolean } | null>(null);
  const reducedMotion = useReducedMotion();
  const quiet = reducedMotion || motionOff;
  const story = stories[storyIndex];
  const selected = story.nodes[step];
  const points = compact ? mobileArrangements[storyIndex] : positions;
  const highlighted = hovered ?? step;

  useEffect(() => {
    let inView = false;
    const updateVisibility = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; updateVisibility(); }, { threshold: 0.15 });
    document.addEventListener("visibilitychange", updateVisibility);
    const breakpoint = window.matchMedia("(max-width: 760px)");
    const updateCompact = () => setCompact(breakpoint.matches);
    updateCompact();
    breakpoint.addEventListener("change", updateCompact);
    if (canvas.current) observer.observe(canvas.current);
    const updateMotion = () => setMotionOff(document.documentElement.dataset.motion === "off");
    updateMotion();
    const preferences = new MutationObserver(updateMotion);
    preferences.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => { observer.disconnect(); preferences.disconnect(); breakpoint.removeEventListener("change", updateCompact); document.removeEventListener("visibilitychange", updateVisibility); };
  }, []);

  function startDrag(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (event.pointerType !== "mouse" || event.button !== 0 || !canvas.current || compact) return;
    drag.current = { index, x: event.clientX, y: event.clientY, point: positions[index], moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || !canvas.current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.hypot(dx, dy) < 5 && !current.moved) return;
    current.moved = true;
    setDragging(current.index);
    setPositions(previous => previous.map((point, index) => index === current.index ? {
      x: Math.max(12, Math.min(88, current.point.x + dx / canvas.current!.clientWidth * 100)),
      y: Math.max(75, Math.min(480, current.point.y + dy)),
    } : point));
  }
  function chooseStory(index: number) {
    setStoryIndex(index); setStep(0); setHovered(null); setPositions(arrangements[index]);
  }

  return (
    <section className="clarity-map" aria-labelledby="clarity-map-title" data-testid="clarity-exhibit" data-running={visible && !quiet}>
      <div className="clarity-map__intro">
        <h3 id="clarity-map-title">Every decision has a backstory.<br /><span>Follow the connections.</span></h3>
        <p>A number. A clause. A question someone asked.<br />Explore how they become a decision you can defend.</p>
      </div>
      <div className="clarity-map__questions" role="group" aria-label="Choose a deal question">
        {stories.map((item, index) => <button key={item.short} type="button" aria-pressed={storyIndex === index} onClick={() => chooseStory(index)}>
          <span className="clarity-map__question-dot" aria-hidden="true" />{item.question}<ArrowRight size={16} aria-hidden="true" />
        </button>)}
      </div>

      <div ref={canvas} className="clarity-map__canvas" data-dragging={dragging !== null}>
        <div className="clarity-map__map-tools"><span>One deal. A constellation of evidence.</span><button type="button" onClick={() => setPositions(arrangements[storyIndex])} aria-label="Reset constellation arrangement"><RotateCcw size={13} />Reset view</button></div>
        <svg className="clarity-map__connections" viewBox="0 0 1000 640" preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx="500" cy="280" rx="245" ry="190" className="clarity-map__orbit" transform="rotate(-18 500 280)" />
          <ellipse cx="500" cy="280" rx="350" ry="120" className="clarity-map__orbit" transform="rotate(20 500 280)" />
          {points.map((point, index) => {
            const x = point.x * 10;
            const path = `M 500 280 L ${(500 + x) / 2} ${(280 + point.y) / 2 - 22} L ${x} ${point.y}`;
            const next = points[(index + 1) % 4];
            return <g key={index}>
              <motion.path className="clarity-map__crosslink" animate={{ d: `M ${x} ${point.y} L ${next.x * 10} ${next.y}` }} transition={{ duration: quiet || dragging !== null ? 0 : .65 }} />
              <motion.path className="clarity-map__branch" data-lit={highlighted === index} animate={{ d: path }} transition={{ duration: quiet || dragging !== null ? 0 : .65 }} />
            </g>;
          })}
          {[[37, 69], [91, 269], [58, 491], [8, 328], [44, 158], [65, 370], [9, 95], [91, 473]].map(([x, y], i) => <g key={i} className="clarity-map__star"><circle cx={x * 10} cy={y} r={i % 3 === 0 ? 3 : 1.8} /><path d={`M ${x * 10 - 6} ${y} h 12 M ${x * 10} ${y - 6} v 12`} /></g>)}
        </svg>

        <div className="clarity-map__hub">
          <div className="clarity-map__hub-ring" aria-hidden="true" />
          <div className="clarity-map__photo">{!imageFailed ? <img src={photo} alt="Two professionals shaking hands across a meeting table, representing an M&A agreement" width={640} height={427} loading="lazy" decoding="async" onError={() => setImageFailed(true)} /> : <GitBranch size={48} aria-hidden="true" />}</div>
          <strong>Project Meridian</strong><span>Fictional M&A transaction</span>
          <span className="clarity-map__hub-point" aria-hidden="true" />
        </div>

        {story.nodes.map((node, index) => {
          const Icon = icons[index];
          const point = points[index];
          return <div key={index} className={`clarity-map__cluster clarity-map__cluster--${index}`} style={{ "--node-x": point.x - 50, "--node-y": `${point.y - 280}px` } as CSSProperties}>
            <button type="button" className="clarity-map__node" aria-pressed={step === index} aria-controls="clarity-map-detail" onPointerDown={event => startDrag(event, index)} onPointerMove={moveDrag} onPointerUp={() => setDragging(null)} onPointerCancel={() => { drag.current = null; setDragging(null); }} onClick={() => { if (!drag.current?.moved) setStep(index); drag.current = null; }} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}>
              <span className="clarity-map__node-star" aria-hidden="true"><Icon size={20} /><span>0{index + 1}</span></span>
              <span className="clarity-map__node-label">{node.label}</span>
              <strong>{node.title}</strong>
              <span className="clarity-map__node-value">{node.value}<ArrowRight size={13} aria-hidden="true" /></span>
            </button>
            <span className="clarity-map__satellite" aria-hidden="true"><span />{satellites[storyIndex][index]}</span>
          </div>;
        })}
        <div className="clarity-map__map-caption"><span className="clarity-map__desktop-hint">Drag the nodes to explore. </span>Select a star to follow its story.</div>
      </div>

      <div id="clarity-map-detail" className="clarity-map__detail" aria-live="polite" aria-atomic="true">
        <div className="clarity-map__detail-copy" key={`${storyIndex}-${step}`}><span className="clarity-map__detail-step">0{step + 1} / 04 <span>{selected.label}</span></span><h4>{selected.title}</h4><p>{selected.detail}</p></div>
        <div className="clarity-map__excerpt"><FileText size={18} aria-hidden="true" /><blockquote>{selected.excerpt}</blockquote><p>{selected.source}</p></div>
      </div>
      <div className="clarity-map__footer">
        <p><span className="clarity-map__status-dot" aria-hidden="true" />{story.outcome}</p>
        <button type="button" onClick={() => { setStep((step + 1) % 4); setHovered(null); }}>{step === 3 ? "Trace it again" : "Follow the next connection"}<ArrowRight size={17} aria-hidden="true" /></button>
      </div>
      <p className="clarity-map__disclaimer">An interactive illustration with fictional data. Photo: <a href="https://unsplash.com/photos/two-people-shaking-hands-n95VMLxqM2I" target="_blank" rel="noreferrer">Cytonn Photography / Unsplash</a>.</p>
    </section>
  );
}

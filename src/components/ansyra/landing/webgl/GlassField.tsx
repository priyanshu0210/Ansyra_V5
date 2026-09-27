import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getArcProgress } from "../arc-progress";

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2 of the living field: one refracting solid, floating over everything.
//
// THE CANVAS IS TRANSPARENT, AND THAT IS THE WHOLE DESIGN.
// The obvious build is an opaque in-scene backdrop with the solid in front of
// it — that is what the reference does, and it is wrong here, because the
// ground already crossfades on scroll in CSS and an opaque canvas would paint
// straight over it. So the scene carries no background: the solid is lit and
// refracted by an ENVIRONMENT MAP, and the real page shows through everywhere
// else. The CSS field keeps doing its job underneath.
//
// Dispersion is `MeshPhysicalMaterial.dispersion` (three >= 0.163), not a
// hand-rolled chromatic-aberration pass. It is real wavelength-dependent IOR,
// which is the point: the design system's accent is a dispersion PAIR because
// white light through glass never returns one colour. This is that claim,
// rendered rather than asserted.
//
// Everything here is torn down on unmount. A leaked WebGL context survives
// route changes and there are only ~16 of them per tab.
// ─────────────────────────────────────────────────────────────────────────────

/** Read a resolved CSS colour token so the scene tracks the active theme. */
function token(name: string, fallback: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  try {
    return new THREE.Color(v || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

/**
 * A tiny equirectangular gradient used as the environment.
 *
 * Cheaper than RoomEnvironment and, more usefully, it is made of the palette:
 * the highlights the glass throws are the same prism/caustic pair the rest of
 * the page uses, so the object looks like it belongs to this site rather than
 * to a default studio HDRI.
 */
function paletteEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const w = 128;
  const h = 64;
  // FLOAT, not Uint8, and this is the difference between glass and grey putty.
  // The first version wrote 8-bit pastels: every value landed near mid-grey, so
  // the facets had nothing bright to reflect and the solid rendered as a lump.
  // Glass is legible only through HIGH DYNAMIC RANGE — a few small sources far
  // brighter than 1.0, against a dark surround. That contrast is what the
  // facets sample, and what iridescence needs in order to interfere at all.
  const data = new Float32Array(w * h * 4);

  const cool = token("--prism", "#7cc6d4");
  const warm = token("--caustic", "#e0a15c");
  const grounded = token("--settle", "#4fa593");

  // Three sources, in the palette. Positions are in equirect UV space.
  const lights = [
    { u: 0.24, v: 0.3, r: 0.14, c: cool, power: 7.5 },
    { u: 0.68, v: 0.62, r: 0.17, c: warm, power: 5.5 },
    { u: 0.46, v: 0.16, r: 0.1, c: grounded, power: 4.0 },
  ];

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      // Dark surround with a gentle vertical lift, so the object still reads
      // against a light page without washing out.
      let rr = 0.06 + v * 0.10;
      let gg = 0.07 + v * 0.11;
      let bb = 0.09 + v * 0.12;

      for (const L of lights) {
        // Wrap horizontally: the map is a sphere, not a strip.
        let du = Math.abs(u - L.u);
        du = Math.min(du, 1 - du);
        const dv = v - L.v;
        const d = Math.sqrt(du * du + dv * dv);
        const fall = Math.max(0, 1 - d / L.r);
        const e = fall * fall * L.power;
        rr += L.c.r * e;
        gg += L.c.g * e;
        bb += L.c.b * e;
      }

      const i = (y * w + x) * 4;
      data[i] = rr;
      data[i + 1] = gg;
      data[i + 2] = bb;
      data[i + 3] = 1;
    }
  }

  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  // Float data is already linear. Tagging it sRGB would double-decode it.
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

export default function GlassField() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let raf = 0;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    // Capped hard. Transmission renders the scene to an offscreen target, so
    // DPR is paid twice; at 3x on a laptop this is the whole frame budget.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearAlpha(0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const canvas = renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    // Fades in only once a frame has actually rendered, so a slow GPU shows the
    // CSS field rather than an empty rectangle.
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 900ms ease";
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 6);

    let env = paletteEnvironment(renderer);
    scene.environment = env;

    // ── THE MÖBIUS FIELD ────────────────────────────────────────────────────
    //
    // Not a solid. A cloud of points that STARTS scattered and assembles into a
    // Möbius strip as you scroll, then turns; scroll back up and it comes apart
    // along the same path.
    //
    // WHY A MÖBIUS: it is the one surface with a single side and a single edge —
    // follow it far enough and you arrive where you began, on what looks like
    // the opposite face. That is the product's argument about deal memory
    // rendered as geometry rather than asserted in copy. It also gives the dot
    // grid a reason to twist, which is what makes a point cloud read as a form.
    //
    // DOTS IN ROWS, NOT NOISE. The grid is sampled along u (around the strip)
    // and v (across its width), so each row of points reads as a dotted line.
    // Random sampling of the same surface looks like static.
    // FEWER AND FURTHER APART. 220x14 was 3080 points at a 0.028 size, which
    // read as a dense mesh rather than a dot field, and made every scroll tick
    // move three thousand vertices. 168x9 is half the count and reads as
    // scattered, which is what the form is supposed to be doing before it
    // assembles.
    const U_STEPS = 168; // around the strip
    const V_STEPS = 9; // across its width
    const COUNT = U_STEPS * V_STEPS;
    const RADIUS = 1.15;

    /** Möbius parametrisation. u around, v across, half-twist over one loop. */
    const mobius = (u: number, v: number) => {
      const a = u * Math.PI * 2;
      const h = v * 0.42; // half-width
      const c = 1 + h * Math.cos(a / 2);
      return [
        RADIUS * c * Math.cos(a),
        RADIUS * c * Math.sin(a),
        RADIUS * h * Math.sin(a / 2),
      ] as const;
    };

    // Two position sets per point: where it starts, and where it belongs.
    // Interpolating between them on ONE value is what makes the reverse exact
    // rather than a second animation that has to be kept in sync.
    const formed = new Float32Array(COUNT * 3);
    const scattered = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);

    for (let i = 0, iu = 0; iu < U_STEPS; iu++) {
      for (let iv = 0; iv < V_STEPS; iv++, i++) {
        const [x, y, z] = mobius(iu / U_STEPS, (iv / (V_STEPS - 1)) * 2 - 1);
        formed[i * 3] = x;
        formed[i * 3 + 1] = y;
        formed[i * 3 + 2] = z;

        // Scattered: a loose shell, so "unformed" reads as a cloud with volume
        // rather than a flat spray. Deterministic-ish per index so the assembly
        // looks choreographed instead of random on every reload.
        const t = i * 2.399963; // golden angle, spreads indices over the sphere
        // A much deeper shell: 3.4-6.4 rather than 2.6-4.3. "Unformed" has to
        // read as genuinely dispersed, otherwise the assembled state is barely
        // a change and the whole gesture is invisible.
        const rr = 3.4 + ((i % 17) / 17) * 3.0;
        const ph = Math.acos(1 - (2 * (i % 101)) / 101);
        scattered[i * 3] = rr * Math.sin(ph) * Math.cos(t);
        scattered[i * 3 + 1] = rr * Math.sin(ph) * Math.sin(t);
        scattered[i * 3 + 2] = rr * Math.cos(ph);

        // Per-point offset so they do not all arrive on the same frame.
        seeds[i] = (i % 53) / 53;
      }
    }

    const positions = new Float32Array(COUNT * 3);
    positions.set(scattered);

    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Additive, so overlapping dots build light instead of flat-shading into a
    // grey mass — the same reason the environment had to be HDR.
    const pointMat = new THREE.PointsMaterial({
      // Bigger and dimmer: a sparser field needs each point to carry more
      // presence, and additive blending on fewer overlaps needs less alpha to
      // reach the same total light.
      size: 0.036,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: token("--prism", "#7cc6d4"),
    });
    const points = new THREE.Points(pointGeo, pointMat);

    // The two edges of the strip, dashed. A Möbius has ONE edge; drawing it as a
    // single continuous dashed line is the cheapest way to show that, and it
    // gives the cloud a readable silhouette once formed.
    const edgePts: THREE.Vector3[] = [];
    for (let iu = 0; iu <= U_STEPS * 2; iu++) {
      // Twice around: the single edge only closes after two laps.
      const [x, y, z] = mobius(iu / U_STEPS, iu <= U_STEPS ? 1 : -1);
      edgePts.push(new THREE.Vector3(x, y, z));
    }
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
    const edgeMat = new THREE.LineDashedMaterial({
      color: token("--caustic", "#e0a15c"),
      dashSize: 0.06,
      gapSize: 0.05,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edge = new THREE.Line(edgeGeo, edgeMat);
    edge.computeLineDistances(); // required, or the dashes never render

    const strip = new THREE.Group();
    strip.add(points, edge);
    scene.add(strip);

    // ── FRAMING ─────────────────────────────────────────────────────────────
    //
    // Off-axis AND partly off-canvas, still: the headline is centred, so
    // anything behind it is a legibility problem wearing an art-direction
    // costume; and a form fully in frame reads as an illustration sitting on
    // the page rather than as something the page is moving past.
    //
    // WHAT CHANGED: that intent was expressed as the world coordinate 3.2,
    // which is not a framing rule — it is a framing rule's answer at one aspect
    // ratio. The camera's half-width scales with aspect while 3.2 does not, so
    // the crop drifted with the viewport and broke the rule at both ends.
    // Measured at 92% scroll, formed:
    //
    //     1440x900  (1.60)   about half the form off-canvas — too little read
    //     2560x1080 (2.37)   the WHOLE form inside the frame — an illustration
    //
    // So it is derived now. `VISIBLE_FRACTION` is the share of the form's own
    // width that sits inside the right edge, which is the thing the eye
    // actually judges, and it holds at every aspect ratio.
    const DEG = Math.PI / 180;
    // The form's in-plane extent: `c` peaks at 1 + 0.42 (see `mobius`), so the
    // silhouette reaches this far from the group origin before scaling.
    const FORM_RADIUS = RADIUS * 1.42;
    const VISIBLE_FRACTION = 0.85;
    // ...but the left edge may never cross into the page's middle, which is the
    // half of the original rule that still has to hold on a narrow viewport.
    // Expressed as a share of the half-width so it, too, tracks the frame.
    const MIN_CENTRE_CLEARANCE = 0.18;

    /** Where the form sits so the right edge crops it by a constant fraction. */
    const frameX = (z: number, radius: number) => {
      // Half-width of the frustum AT THE FORM'S DEPTH — it comes forward as it
      // closes, and a plane 0.85 nearer the camera is a materially narrower
      // frame. Measuring at z=0 would let it drift back off-canvas exactly when
      // it is meant to arrive.
      const halfW =
        Math.tan((camera.fov / 2) * DEG) * (camera.position.z - z) * camera.aspect;
      const wanted = halfW + radius * (1 - 2 * VISIBLE_FRACTION);
      const floor = halfW * MIN_CENTRE_CLEARANCE + radius;
      return Math.max(wanted, floor);
    };

    strip.position.set(frameX(0, FORM_RADIUS), 0.5, 0);

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-3, 2.5, 4);
    scene.add(key);

    const resize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // `updateProjectionMatrix` FIRST: frameX reads camera.aspect, and setting
      // the position from a stale frustum puts the form one resize behind.
      //
      // The line this replaces was `strip.position.x = w < 1100 ? 2.2 : 3.2`,
      // and it was DEAD CODE. The frame loop assigns position.x unconditionally
      // every frame, so the narrow-viewport value survived exactly until the
      // next animation tick and never reached the screen. One expression owns
      // this now, and both callers use it.
      strip.position.x = frameX(strip.position.z, FORM_RADIUS * strip.scale.x);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // Theme changes rebuild the environment, which is what makes the glass pick
    // up the new palette instead of staying lit by the old one.
    const themeObserver = new MutationObserver(() => {
      const next = paletteEnvironment(renderer);
      scene.environment = next;
      env.dispose();
      env = next;
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-ground"],
    });

    let shown = false;
    // Eased separately from `formation` so an instant jump into the arc zone
    // still reads as the form advancing rather than teleporting.
    let arc = 0;
    // 0 = scattered, 1 = fully formed. The single source of truth for the whole
    // assemble/disassemble behaviour.
    let formation = 0;
    const start = performance.now();
    let previousFrame = start;

    const frame = () => {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      // Nothing to see in a background tab, and rAF is throttled there anyway.
      if (document.hidden) return;

      const now = performance.now();
      const dt = Math.min(50, now - previousFrame);
      previousFrame = now;
      const t = (now - start) / 1000;

      // FORMATION IS READ FROM SCROLL, PER FRAME.
      //
      // Deliberately not a scroll listener: constitution §6 bans
      // `addEventListener("scroll")`, and this loop is already running, so a
      // property read costs nothing and can never fall out of step with the
      // frame it is driving. It is also why scrolling back up reverses exactly
      // — there is one value, not two animations.
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const page = Math.min(1, Math.max(0, window.scrollY / max));
      // Assembles across the first 85% of the page rather than the first 50%.
      // The old range packed the entire formation into half a page, so a slow
      // scroll moved every point a long way per tick and the field read as
      // vibrating rather than as assembling.
      const target = Math.min(1, page / 0.85);
      // Eased toward the target rather than snapped, so a jump-scroll still
      // assembles rather than teleporting into shape.
      // 0.035, not 0.08. This lerp is the single biggest cause of the jitter:
      // it is the per-frame fraction of the remaining distance, so it sets how
      // violently the cloud reacts to a scroll delta. Slower here reads as
      // weight, not as lag.
      formation += (target - formation) * (1 - Math.pow(1 - 0.035, dt / (1000 / 60)));

      const pos = pointGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        // Per-point delay: points arrive in waves instead of all at once.
        const k = Math.min(1, Math.max(0, (formation - seeds[i] * 0.35) / 0.65));
        // Smoothstep, so each point decelerates into place.
        const e = k * k * (3 - 2 * k);
        const j = i * 3;
        pos[j] = scattered[j] + (formed[j] - scattered[j]) * e;
        pos[j + 1] = scattered[j + 1] + (formed[j + 1] - scattered[j + 1]) * e;
        pos[j + 2] = scattered[j + 2] + (formed[j + 2] - scattered[j + 2]) * e;
      }
      pointGeo.attributes.position.needsUpdate = true;

      // THE ARC ZONE IS WHERE THE FORM CLOSES.
      //
      // The passage between the problem section and the platform section exists
      // to give the ground crossfade room to happen, and it renders nothing but
      // gradient: a full screen of empty page whose only job is to be scrolled
      // through. It is now the moment the strip finishes arriving. The dots have
      // been assembling for the whole page; here the form comes forward, its
      // edge lights, and it settles. No page height is added — this spends
      // scroll the page was already spending.
      arc += (getArcProgress() - arc) * (1 - Math.pow(1 - 0.05, dt / (1000 / 60)));
      const closing = arc * arc * (3 - 2 * arc); // smoothstep

      // The edge only earns its line once there is a form to bound. Fading it in
      // late stops it reading as a hoop the dots are falling into, and the arc
      // is what finally brings it to full.
      edgeMat.opacity =
        0.55 * Math.max(0, (formation - 0.55) / 0.45) * (0.45 + closing * 0.55);

      // Rotation scales with formation: scattered dots drift, a formed strip
      // turns. One value again, so the motion arrives with the shape.
      strip.rotation.x = t * 0.045 * (0.25 + formation * 0.75);
      strip.rotation.y = t * 0.07 * (0.25 + formation * 0.75);
      // A slight vertical breathe so it reads as suspended, not mounted.
      // Halved in both amplitude and frequency. At 0.35Hz against the
      // rotation this was a second competing motion, and two slow frequencies
      // beating against each other is what reads as unsteadiness.
      strip.position.y = 0.5 + Math.sin(t * 0.18) * 0.08;
      // Comes forward and grows through the arc. Small numbers on purpose: this
      // is an ambient layer arriving, not a set piece taking the screen.
      strip.position.z = closing * 0.85;
      const s = 1 + closing * 0.14;
      strip.scale.set(s, s, s);
      // Derived, not a second hardcoded coordinate. The inward drift that used
      // to be written as `3.2 - closing * 0.5` now falls out of the geometry:
      // the form comes forward, the frustum at its depth narrows, and the frame
      // brings it in to keep the same share of it on screen. The scale has to
      // be passed in for the same reason — a form 14% larger is cropped 14%
      // harder by the same edge.
      strip.position.x = frameX(strip.position.z, FORM_RADIUS * s);

      renderer.render(scene, camera);

      if (!shown) {
        shown = true;
        canvas.style.opacity = "1";
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeObserver.disconnect();
      pointGeo.dispose();
      pointMat.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
      env.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;
}

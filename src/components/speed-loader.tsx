"use client";

import { useEffect, useRef, useState } from "react";

/**
 * HakimEzy — Precision Horology & Mechanism Loader
 * Replaces old Lottie animations with custom SVG gears, stitching text & dial mechanism.
 */
export function SpeedLoader({ fullScreen = true }: { fullScreen?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const gearARef = useRef<SVGSVGElement | null>(null);
  const gearBRef = useRef<SVGSVGElement | null>(null);
  const gearCRef = useRef<SVGSVGElement | null>(null);
  const rigRef = useRef<HTMLDivElement | null>(null);
  const digitsRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const NS = "http://www.w3.org/2000/svg";

    function gearOutline(cx: number, cy: number, teeth: number, rootR: number, tipR: number) {
      const step = (2 * Math.PI) / teeth;
      const tipHalf = step * 0.22;
      const rootHalf = step * 0.30;
      const p = (r: number, a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
      let d = "";
      for (let i = 0; i < teeth; i++) {
        const base = i * step;
        const a0 = base - rootHalf;
        const a1 = base - tipHalf;
        const a2 = base + tipHalf;
        const a3 = base + rootHalf;
        const [x0, y0] = p(rootR, a0);
        const [x1, y1] = p(tipR, a1);
        const [x2, y2] = p(tipR, a2);
        const [x3, y3] = p(rootR, a3);
        d += i === 0 ? `M ${x0} ${y0} ` : `L ${x0} ${y0} `;
        d += `L ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} `;
        const nextA0 = base + step - rootHalf;
        const [nx, ny] = p(rootR, nextA0);
        d += `A ${rootR} ${rootR} 0 0 1 ${nx} ${ny} `;
      }
      return d + "Z";
    }

    function buildGear(
      svgEl: SVGSVGElement | null,
      teeth: number,
      rootR: number,
      tipR: number,
      hubR: number,
      slotCount: number,
      slotR: number,
      slotDist: number,
      rivetCount: number
    ) {
      if (!svgEl) return;
      svgEl.innerHTML = "";
      const cx = 50,
        cy = 50;

      const outline = document.createElementNS(NS, "path");
      outline.setAttribute("d", gearOutline(cx, cy, teeth, rootR, tipR));
      outline.setAttribute("class", "rim");
      svgEl.appendChild(outline);

      const groove = document.createElementNS(NS, "circle");
      groove.setAttribute("cx", String(cx));
      groove.setAttribute("cy", String(cy));
      groove.setAttribute("r", String(rootR - 3));
      groove.setAttribute("class", "groove");
      svgEl.appendChild(groove);

      for (let i = 0; i < slotCount; i++) {
        const a = ((2 * Math.PI) / slotCount) * i;
        const sx = cx + slotDist * Math.sin(a);
        const sy = cy - slotDist * Math.cos(a);
        const slot = document.createElementNS(NS, "ellipse");
        slot.setAttribute("cx", String(sx));
        slot.setAttribute("cy", String(sy));
        slot.setAttribute("rx", String(slotR * 1.5));
        slot.setAttribute("ry", String(slotR));
        slot.setAttribute("transform", `rotate(${(a * 180) / Math.PI} ${sx} ${sy})`);
        slot.setAttribute("class", "slot");
        svgEl.appendChild(slot);
      }

      const hub = document.createElementNS(NS, "circle");
      hub.setAttribute("cx", String(cx));
      hub.setAttribute("cy", String(cy));
      hub.setAttribute("r", String(hubR));
      hub.setAttribute("class", "hub");
      svgEl.appendChild(hub);

      for (let i = 0; i < rivetCount; i++) {
        const a = ((2 * Math.PI) / rivetCount) * i + Math.PI / rivetCount;
        const rx = cx + hubR * 0.62 * Math.sin(a);
        const ry = cy - hubR * 0.62 * Math.cos(a);
        const rivet = document.createElementNS(NS, "circle");
        rivet.setAttribute("cx", String(rx));
        rivet.setAttribute("cy", String(ry));
        rivet.setAttribute("r", String(hubR * 0.13));
        rivet.setAttribute("class", "rivet");
        svgEl.appendChild(rivet);
      }

      const centerDot = document.createElementNS(NS, "circle");
      centerDot.setAttribute("cx", String(cx));
      centerDot.setAttribute("cy", String(cy));
      centerDot.setAttribute("r", String(hubR * 0.22));
      centerDot.setAttribute("class", "rivet-hl");
      svgEl.appendChild(centerDot);

      const shine = document.createElementNS(NS, "circle");
      shine.setAttribute("cx", String(cx));
      shine.setAttribute("cy", String(cy));
      shine.setAttribute("r", String(tipR));
      shine.setAttribute("class", "shine");
      svgEl.appendChild(shine);
    }

    buildGear(gearARef.current, 22, 32, 37, 12, 6, 2.6, 22, 6);
    buildGear(gearBRef.current, 14, 31, 37, 13, 5, 3.0, 21, 5);
    buildGear(gearCRef.current, 9, 30, 37, 14, 4, 3.4, 20, 4);

    // Gauge numbers around the dial ring
    const rig = rigRef.current;
    if (rig) {
      // Remove any existing gauge numbers
      rig.querySelectorAll(".gauge-num").forEach((n) => n.remove());
      const rigSize = rig.getBoundingClientRect().width || 380;
      const radius = rigSize * 0.47;
      const cx = rigSize / 2,
        cy = rigSize / 2;
      const count = 12;
      for (let i = 0; i < count; i++) {
        const a = ((2 * Math.PI) / count) * i;
        const x = cx + radius * Math.sin(a);
        const y = cy - radius * Math.cos(a);
        const num = document.createElement("div");
        num.className = "gauge-num";
        num.style.left = x + "px";
        num.style.top = y + "px";
        num.style.transform = "translate(-50%, -50%)";
        num.style.animationDelay = i * 0.4 + "s";
        num.textContent = String(i + 1).padStart(2, "0");
        rig.appendChild(num);
      }
    }

    // Ticking reference counter
    let n = 0;
    const interval = setInterval(() => {
      if (digitsRef.current) {
        digitsRef.current.classList.add("fading");
        setTimeout(() => {
          n = (n + 7) % 10000;
          if (digitsRef.current) {
            digitsRef.current.textContent = "REF·" + String(n).padStart(4, "0");
            digitsRef.current.classList.remove("fading");
          }
        }, 180);
      }
    }, 900);

    return () => clearInterval(interval);
  }, [mounted]);

  if (!mounted) return null;

  const content = (
    <div className={`hakim-loader-stage ${fullScreen ? "fullscreen" : "inline"}`}>
      <style>{`
        .hakim-loader-stage {
          --loader-bg: #d1e2ea;
          --loader-ink: #201C16;
          --loader-ink-dim: #8B857A;
          --loader-steel-dark: #4B4B4E;
          --loader-steel: #8C8C90;
          --loader-steel-light: #DEDEDF;
          --loader-brass: #228B22;
          --loader-brass-light: #32CD32;
          --loader-thread: #7A2635;
          --loader-line: rgba(32,28,22,0.10);

          position: relative;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: clamp(14px, 3.4vmin, 34px);
          padding: 2vh 4vw;
          overflow: hidden;
          font-family: 'Cormorant Garamond', serif;
          background: var(--loader-bg);
          box-sizing: border-box;
        }

        .hakim-loader-stage.fullscreen {
          position: fixed;
          inset: 0;
          height: 100vh;
          height: 100dvh;
          z-index: 99999;
        }

        .hakim-loader-stage.inline {
          position: relative;
          min-height: 280px;
          border-radius: 1.5rem;
        }

        .dark .hakim-loader-stage {
          --loader-bg: #141416;
          --loader-ink: #F2F1ED;
          --loader-ink-dim: #A49F95;
          --loader-line: rgba(255,255,255,0.12);
        }

        /* ---------- MECHANISM ---------- */
        .hakim-loader-stage .rig {
          position: relative;
          width: min(48vmin, 320px);
          height: min(48vmin, 320px);
          flex-shrink: 0;
        }

        .hakim-loader-stage .dial-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid var(--loader-line);
        }
        .hakim-loader-stage .dial-ring::before {
          content: "";
          position: absolute;
          inset: 9%;
          border-radius: 50%;
          border: 1px dashed var(--loader-line);
        }

        .hakim-loader-stage .gauge-num {
          position: absolute;
          top: 50%; left: 50%;
          font-family: 'Share Tech Mono', monospace;
          font-size: clamp(9px, 1.6vmin, 12px);
          color: var(--loader-steel);
          letter-spacing: 1px;
          transform-origin: 0 0;
          animation: hakimGaugeFade 4.8s ease-in-out infinite;
        }

        @keyframes hakimGaugeFade {
          0%   { opacity: 0.05; }
          12%  { opacity: 0.9; }
          28%  { opacity: 0.9; }
          42%  { opacity: 0.05; }
          100% { opacity: 0.05; }
        }

        .hakim-loader-stage .gear-wrap {
          position: absolute;
          top: 50%; left: 50%;
          filter: drop-shadow(0 6px 10px rgba(32,28,22,0.16));
        }
        .hakim-loader-stage .gear-wrap svg { display: block; overflow: visible; }

        .hakim-loader-stage .gear-a {
          width: min(25vmin, 175px); height: min(25vmin, 175px);
          margin: calc(-1 * min(12.5vmin, 87.5px)) 0 0 calc(-1 * min(12.5vmin, 87.5px));
          animation: hakimSpinCw 11s linear infinite;
        }
        .hakim-loader-stage .gear-b {
          width: min(16vmin, 110px); height: min(16vmin, 110px);
          margin: calc(-1 * min(16.5vmin, 85px)) 0 0 min(7.5vmin, 50px);
          animation: hakimSpinCcw 6.875s linear infinite;
        }
        .hakim-loader-stage .gear-c {
          width: min(10vmin, 70px); height: min(10vmin, 70px);
          margin: min(5vmin, 34px) 0 0 calc(-1 * min(20vmin, 125px));
          animation: hakimSpinCw 4.4s linear infinite;
        }

        @keyframes hakimSpinCw { to { transform: rotate(360deg); } }
        @keyframes hakimSpinCcw { to { transform: rotate(-360deg); } }

        .hakim-loader-stage .tooth { fill: url(#steelGrad); }
        .hakim-loader-stage .rim { fill: url(#steelGrad); stroke: var(--loader-steel-dark); stroke-width: 0.6; }
        .hakim-loader-stage .groove { fill: none; stroke: rgba(32,28,22,0.18); stroke-width: 1; }
        .hakim-loader-stage .slot { fill: var(--loader-bg); }
        .hakim-loader-stage .hub { fill: url(#hubGrad); stroke: var(--loader-steel-dark); stroke-width: 0.8; }
        .hakim-loader-stage .rivet { fill: var(--loader-brass); }
        .hakim-loader-stage .rivet-hl { fill: var(--loader-brass-light); opacity: 0.7; }
        .hakim-loader-stage .shine { fill: url(#shineGrad); }

        /* needle assembly on gear-b */
        .hakim-loader-stage .needle-post {
          position: absolute;
          top: 50%; left: 50%;
          width: 2.5px;
          height: min(7.5vmin, 50px);
          margin-left: min(7.5vmin, 50px);
          margin-top: calc(-1 * min(16.5vmin, 85px) - min(7.5vmin, 50px) + min(1.8vmin, 10px));
          background: linear-gradient(to bottom, var(--loader-brass-light), var(--loader-brass) 55%, var(--loader-steel-dark));
          transform-origin: top center;
          animation: hakimNeedleDip 2.29s ease-in-out infinite;
        }
        .hakim-loader-stage .needle-post::after {
          content: "";
          position: absolute;
          left: 50%; bottom: -3px;
          width: 6px; height: 6px;
          background: var(--loader-ink);
          border-radius: 50%;
          transform: translateX(-50%);
        }
        @keyframes hakimNeedleDip {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(min(2.2vmin, 15px)); }
        }

        /* ---------- TEXT (below mechanism) ---------- */
        .hakim-loader-stage .mark {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: clamp(6px, 1.8vmin, 12px);
        }

        .hakim-loader-stage .brand {
          font-family: 'Cinzel', serif;
          font-weight: 700;
          font-size: clamp(22px, 5.5vmin, 40px);
          letter-spacing: clamp(2px, 0.5vmin, 4px);
          color: var(--loader-ink);
          display: flex;
        }
        .hakim-loader-stage .brand span {
          position: relative;
          display: inline-block;
          padding-bottom: 0.14em;
        }
        .hakim-loader-stage .brand span::after {
          content: "";
          position: absolute;
          left: 0; bottom: 0;
          width: 100%; height: 2px;
          background: var(--loader-thread);
          transform: scaleX(0);
          transform-origin: left;
          animation: hakimStitch 2.4s ease-in-out infinite;
        }
        .hakim-loader-stage .brand span:nth-child(1)::after { animation-delay: 0.00s; }
        .hakim-loader-stage .brand span:nth-child(2)::after { animation-delay: 0.07s; }
        .hakim-loader-stage .brand span:nth-child(3)::after { animation-delay: 0.14s; }
        .hakim-loader-stage .brand span:nth-child(4)::after { animation-delay: 0.21s; }
        .hakim-loader-stage .brand span:nth-child(5)::after { animation-delay: 0.28s; }
        .hakim-loader-stage .brand span:nth-child(6)::after { animation-delay: 0.35s; }
        .hakim-loader-stage .brand span:nth-child(7)::after { animation-delay: 0.42s; }
        .hakim-loader-stage .brand span:nth-child(8)::after { animation-delay: 0.49s; }
        .hakim-loader-stage .brand span:nth-child(9)::after { animation-delay: 0.56s; }
        .hakim-loader-stage .brand span:nth-child(10)::after { animation-delay: 0.63s; }
        .hakim-loader-stage .brand span:nth-child(11)::after { animation-delay: 0.70s; }
        .hakim-loader-stage .brand span:nth-child(12)::after { animation-delay: 0.77s; }
        .hakim-loader-stage .brand span:nth-child(13)::after { animation-delay: 0.84s; }

        @keyframes hakimStitch {
          0%   { transform: scaleX(0); opacity: 0.2; }
          35%  { transform: scaleX(1); opacity: 1; }
          70%  { transform: scaleX(1); opacity: 1; }
          85%  { transform: scaleX(1); opacity: 0.15; }
          100% { transform: scaleX(0); opacity: 0.15; }
        }

        .hakim-loader-stage .divider {
          width: clamp(40px, 9vmin, 75px);
          height: 1px;
          background: linear-gradient(to right, transparent, var(--loader-brass), transparent);
          opacity: 0.8;
        }

        .hakim-loader-stage .tagline {
          font-family: 'Share Tech Mono', monospace;
          font-size: clamp(10px, 1.8vmin, 12px);
          letter-spacing: clamp(2px, 0.6vmin, 3.5px);
          text-transform: uppercase;
          color: var(--loader-ink-dim);
          white-space: nowrap;
        }
        .hakim-loader-stage .tagline .accent { color: var(--loader-brass); }

        .hakim-loader-stage .counter {
          margin-top: 2px;
          font-family: 'Share Tech Mono', monospace;
          font-size: clamp(9px, 1.4vmin, 11px);
          letter-spacing: 2px;
          color: var(--loader-steel);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .hakim-loader-stage .counter .digits {
          display: inline-block;
          min-width: 3.6em;
          text-align: left;
          transition: opacity 0.18s ease;
        }
        .hakim-loader-stage .counter .digits.fading { opacity: 0.15; }
        .hakim-loader-stage .counter .bar {
          width: clamp(55px, 11vmin, 100px);
          height: 1px;
          background: var(--loader-line);
          position: relative;
          overflow: hidden;
        }
        .hakim-loader-stage .counter .bar::after {
          content: "";
          position: absolute;
          top: 0; left: 0; height: 100%;
          width: 36%;
          background: var(--loader-brass);
          animation: hakimSweep 1.6s ease-in-out infinite;
        }
        @keyframes hakimSweep {
          0% { left: -40%; }
          100% { left: 104%; }
        }
      `}</style>

      {/* SVG Definitions */}
      <svg width="0" height="0" style={{ position: "absolute", visibility: "hidden" }}>
        <defs>
          <linearGradient id="steelGrad" x1="15%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor="#EDEDEE" />
            <stop offset="35%" stopColor="#B9B9BC" />
            <stop offset="60%" stopColor="#8C8C90" />
            <stop offset="100%" stopColor="#4B4B4E" />
          </linearGradient>
          <radialGradient id="hubGrad" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#F2F2F2" />
            <stop offset="55%" stopColor="#C7C7C9" />
            <stop offset="100%" stopColor="#5A5A5D" />
          </radialGradient>
          <radialGradient id="shineGrad" cx="30%" cy="22%" r="55%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>

      {/* Mechanism Rig */}
      <div className="rig" ref={rigRef}>
        <div className="dial-ring"></div>

        <div className="gear-wrap gear-c">
          <svg ref={gearCRef} viewBox="0 0 100 100"></svg>
        </div>
        <div className="gear-wrap gear-b">
          <svg ref={gearBRef} viewBox="0 0 100 100"></svg>
        </div>
        <div className="gear-wrap gear-a">
          <svg ref={gearARef} viewBox="0 0 100 100"></svg>
        </div>

        <div className="needle-post"></div>
      </div>

      {/* Branding & Counter */}
      <div className="mark">
        <div className="brand" aria-label="Classic World">
          <span>C</span>
          <span>l</span>
          <span>a</span>
          <span>s</span>
          <span>s</span>
          <span>i</span>
          <span>c</span>
          <span style={{ width: "0.28em" }}>&nbsp;</span>
          <span>W</span>
          <span>o</span>
          <span>r</span>
          <span>l</span>
          <span>d</span>
        </div>
        <div className="divider"></div>
        <div className="tagline">
          <span className="accent">Smart POS</span> & Billing Software
        </div>
        <div className="counter">
          <span className="digits" ref={digitsRef}>
            REF·0000
          </span>
          <span className="bar"></span>
        </div>
      </div>
    </div>
  );

  return content;
}

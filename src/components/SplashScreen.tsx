import { useEffect, useState } from "react";

interface Props {
  message?: string;
}

/**
 * Startup-only animation. The loading bar is intentionally indeterminate:
 * the underlying DB initialization does not report measurable percentages.
 * This component unmounts as soon as App.tsx reaches the ready/setup stage.
 */
export default function SplashScreen({ message = "Initializing…" }: Props) {
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: "#FFFFFF",
        color: "#202124",
        fontFamily: '"Inter Variable", "Inter", sans-serif',
      }}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      {/* Quiet, four-color atmosphere. No black splash overlay. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 45% 38%, rgba(66,133,244,0.07), transparent 38%), radial-gradient(circle at 63% 62%, rgba(52,168,83,0.05), transparent 33%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center px-6" style={{ width: "100%", maxWidth: 440 }}>
        {/* Lightweight inline SVG: ticket arrival + four orbiting accents. */}
        <div className="lm-ticket-stage" aria-hidden="true">
          <svg viewBox="0 0 240 188" width="240" height="188" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="lm-ticket-paper" x1="50" y1="40" x2="194" y2="150" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFFFFF" />
                <stop offset="1" stopColor="#F8F9FA" />
              </linearGradient>
              <filter id="lm-ticket-shadow" x="-35%" y="-40%" width="170%" height="190%">
                <feDropShadow dx="0" dy="9" stdDeviation="10" floodColor="#202124" floodOpacity="0.12" />
              </filter>
            </defs>

            <g className="lm-orbit">
              <circle cx="120" cy="94" r="79" stroke="#E8EAED" strokeWidth="1.5" strokeDasharray="2 9" />
              <circle cx="120" cy="15" r="6.5" fill="#4285F4" />
              <circle cx="199" cy="94" r="6.5" fill="#EA4335" />
              <circle cx="120" cy="173" r="6.5" fill="#FBBC05" />
              <circle cx="41" cy="94" r="6.5" fill="#34A853" />
            </g>

            <g className="lm-ticket-back" transform="rotate(-13 120 94)" opacity="0.95">
              <path d="M53 52 H187 Q195 52 195 60 V82 A11 11 0 0 0 195 104 V128 Q195 136 187 136 H53 Q45 136 45 128 V104 A11 11 0 0 0 45 82 V60 Q45 52 53 52Z"
                fill="#EAF1FB" stroke="#4285F4" strokeWidth="2" />
              <path d="M69 69 H169" stroke="#4285F4" strokeOpacity="0.32" strokeWidth="3" strokeLinecap="round" />
              <path d="M69 79 H146" stroke="#4285F4" strokeOpacity="0.22" strokeWidth="3" strokeLinecap="round" />
            </g>

            <g className="lm-ticket-front" filter="url(#lm-ticket-shadow)">
              <path
                d="M55 40 H185 Q195 40 195 50 V74 A12 12 0 0 0 195 98 V138 Q195 148 185 148 H55 Q45 148 45 138 V98 A12 12 0 0 0 45 74 V50 Q45 40 55 40Z"
                fill="url(#lm-ticket-paper)" stroke="#DADCE0" strokeWidth="1.5"
              />
              <path d="M46 57 H194" stroke="#4285F4" strokeWidth="4" />
              <path d="M46 131 H194" stroke="#34A853" strokeWidth="4" />
              <path d="M82 58 V130" stroke="#DADCE0" strokeDasharray="3 5" strokeWidth="1.5" />
              <circle cx="65" cy="75" r="9" fill="#EAF1FB" />
              <path d="M61 75 L64 78 L69 71" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="65" cy="98" r="9" fill="#E6F4EA" />
              <path d="M61 98 L64 101 L69 94" stroke="#34A853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="65" cy="121" r="6" fill="#FEF9E0" stroke="#FBBC05" strokeWidth="2" />
              <rect x="98" y="69" width="78" height="5" rx="2.5" fill="#202124" />
              <rect x="98" y="82" width="58" height="4" rx="2" fill="#9AA0A6" />
              <g className="lm-ticket-numbers">
                <circle cx="108" cy="109" r="12" fill="#4285F4" />
                <circle cx="137" cy="109" r="12" fill="#EA4335" />
                <circle cx="166" cy="109" r="12" fill="#34A853" />
                <circle cx="108" cy="109" r="4" fill="#FFFFFF" opacity="0.9" />
                <circle cx="137" cy="109" r="4" fill="#FFFFFF" opacity="0.9" />
                <circle cx="166" cy="109" r="4" fill="#FFFFFF" opacity="0.9" />
              </g>
              <circle cx="178" cy="128" r="4" fill="#FBBC05" />
            </g>
          </svg>
        </div>

        <div className="lm-brand-enter">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight" style={{ color: "#202124", letterSpacing: "-0.035em" }}>
            Ajith Rohana
          </h1>
          <p className="mt-1 text-base font-bold" style={{ color: "#4285F4", letterSpacing: "0.01em" }}>
            Lottery Manager
          </p>
          <p className="mt-1 text-xs font-medium" style={{ color: "#5F6368" }}>Enterprise Edition</p>
        </div>

        {/* Four-color indeterminate bar; never implies a real completion %. */}
        <div className="mt-9 w-full" style={{ maxWidth: 260 }}>
          <div className="lm-progress-track" aria-hidden="true">
            <div className="lm-progress-runner" />
          </div>
          <p className="mt-3 text-xs font-medium" style={{ color: "#5F6368" }}>
            {message}{dots}
          </p>
        </div>
      </div>

      <footer className="absolute bottom-7 inset-x-0 flex flex-col items-center gap-1 text-center px-4">
        <p className="text-[10px] uppercase font-semibold tracking-[0.16em]" style={{ color: "#5F6368" }}>Powered by</p>
        <div className="flex items-center gap-1.5">
          <span className="font-black text-base tracking-[0.07em]" style={{ color: "#4285F4" }}>A</span>
          <span className="font-black text-base tracking-[0.07em]" style={{ color: "#EA4335" }}>S</span>
          <span className="font-black text-base tracking-[0.07em]" style={{ color: "#FBBC05" }}>R</span>
          <span className="font-black text-base tracking-[0.07em]" style={{ color: "#34A853" }}>O</span>
          <span className="font-black text-base tracking-[0.07em]" style={{ color: "#4285F4" }}>Z</span>
        </div>
        <p className="text-[10px]" style={{ color: "#5F6368" }}>Enterprise Software Solutions</p>
      </footer>

      <style>{`
        .lm-ticket-stage { width:240px; height:188px; margin-bottom:18px; }
        .lm-ticket-stage svg { overflow:visible; }
        .lm-orbit { transform-origin:120px 94px; animation:lm-orbit-rotate 8s linear infinite; }
        .lm-ticket-back { transform-origin:120px 94px; animation:lm-ticket-secondary 3.4s ease-in-out infinite; }
        .lm-ticket-front { transform-origin:120px 94px; animation:lm-ticket-arrive 3.4s cubic-bezier(.2,.7,.2,1) infinite; }
        .lm-ticket-numbers { animation:lm-numbers 3.4s ease-in-out infinite; transform-origin:137px 109px; }
        .lm-brand-enter { animation:lm-brand-in .55s ease-out both; }
        .lm-progress-track { height:5px; border-radius:999px; background:#E8EAED; overflow:hidden; position:relative; }
        .lm-progress-runner { position:absolute; inset:0 auto 0 0; width:45%; border-radius:999px;
          background:linear-gradient(90deg,#4285F4 0%,#EA4335 33%,#FBBC05 65%,#34A853 100%);
          animation:lm-progress-slide 1.65s cubic-bezier(.65,0,.35,1) infinite; }
        @keyframes lm-orbit-rotate { to { transform:rotate(360deg); } }
        @keyframes lm-ticket-secondary {
          0%,100% { transform:translateY(2px) rotate(-9deg); }
          50% { transform:translateY(-2px) rotate(-14deg); }
        }
        @keyframes lm-ticket-arrive {
          0% { opacity:.5; transform:translate(20px,7px) rotate(8deg) scale(.91); }
          22%,70% { opacity:1; transform:translate(0,0) rotate(0deg) scale(1); }
          100% { opacity:.5; transform:translate(-13px,-2px) rotate(-5deg) scale(.96); }
        }
        @keyframes lm-numbers { 0%,16%,100% {opacity:.3;} 30%,80% {opacity:1;} }
        @keyframes lm-progress-slide { 0% {transform:translateX(-110%);} 100% {transform:translateX(340%);} }
        @keyframes lm-brand-in { from {opacity:0;transform:translateY(8px);} to {opacity:1;transform:translateY(0);} }
        @media(prefers-reduced-motion:reduce) {
          .lm-orbit,.lm-ticket-back,.lm-ticket-front,.lm-ticket-numbers,.lm-brand-enter,.lm-progress-runner {
            animation:none !important;
          }
          .lm-ticket-front { opacity:1; }
          .lm-ticket-numbers { opacity:1; }
          .lm-progress-runner { transform:translateX(60%); }
        }
      `}</style>
    </div>
  );
}

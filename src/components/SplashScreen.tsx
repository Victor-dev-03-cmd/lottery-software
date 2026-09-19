import { useEffect, useState } from "react";
import { Ticket } from "lucide-react";

interface Props {
  message?: string;
}

export default function SplashScreen({ message = "Initializing…" }: Props) {
  const [dots, setDots] = useState(".");

  // Animate the loading dots
  useEffect(() => {
    const id = setInterval(() =>
      setDots((d) => (d.length >= 3 ? "." : d + ".")), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-[9999]"
      style={{ background: "#131313" }}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(207,41,29,0.12) 0%, transparent 70%)",
        }}
      />

      {/* Logo mark */}
      <div className="relative flex flex-col items-center gap-6 z-10">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg"
          style={{ background: "#CF291D", boxShadow: "0 0 40px rgba(207,41,29,0.35)" }}
        >
          <Ticket size={38} className="text-white" />
        </div>

        {/* Brand name */}
        <div className="text-center">
          <h1
            className="text-3xl font-black tracking-tight"
            style={{ color: "#FFFFFF", letterSpacing: "-0.02em" }}
          >
            Ajith Rohana
          </h1>
          <p className="text-base font-semibold mt-0.5" style={{ color: "#CF291D" }}>
            Lottery Manager
          </p>
          <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
            Enterprise Edition
          </p>
        </div>

        {/* Loading bar */}
        <div
          className="w-48 h-1 rounded-full overflow-hidden"
          style={{ background: "#2A2A2A" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              background: "#CF291D",
              animation: "loadProgress 2.5s ease-in-out infinite",
            }}
          />
        </div>

        {/* Status message */}
        <p className="text-xs" style={{ color: "#6B7280" }}>
          {message}{dots}
        </p>
      </div>

      {/* "Powered by Asroz" footer */}
      <div
        className="absolute bottom-8 flex flex-col items-center gap-1"
        style={{ color: "#4B5563" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-px h-3" style={{ background: "#374151" }} />
          <span className="text-xs font-medium tracking-widest uppercase">
            Powered by
          </span>
          <div className="w-px h-3" style={{ background: "#374151" }} />
        </div>
        <span
          className="text-sm font-bold tracking-wide"
          style={{ color: "#CF291D", letterSpacing: "0.08em" }}
        >
          ASROZ
        </span>
        <span className="text-[10px]" style={{ color: "#374151" }}>
          Enterprise Software Solutions
        </span>
      </div>

      <style>{`
        @keyframes loadProgress {
          0%   { width: 0%;   margin-left: 0; }
          50%  { width: 60%;  margin-left: 20%; }
          100% { width: 0%;   margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}

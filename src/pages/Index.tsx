import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const formatHuman = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} second${s !== 1 ? "s" : ""}`;
  if (s === 0) return `${m} minute${m !== 1 ? "s" : ""}`;
  return `${m} minute${m !== 1 ? "s" : ""} and ${s} second${s !== 1 ? "s" : ""}`;
};

const CIRCLE_RADIUS = 120;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

// Gentle color journey: neutral → blue → teal → green → gold
const getStrokeColor = (seconds: number): string => {
  const stages = [
    { time: 0, h: 0, s: 0, l: 10 },       // neutral
    { time: 30, h: 210, s: 30, l: 40 },    // soft blue
    { time: 120, h: 180, s: 35, l: 38 },   // teal
    { time: 300, h: 150, s: 30, l: 35 },   // sage green
    { time: 600, h: 42, s: 45, l: 45 },    // warm gold
  ];
  
  let i = 0;
  while (i < stages.length - 1 && seconds >= stages[i + 1].time) i++;
  if (i >= stages.length - 1) return `hsl(${stages[stages.length - 1].h}, ${stages[stages.length - 1].s}%, ${stages[stages.length - 1].l}%)`;
  
  const from = stages[i];
  const to = stages[i + 1];
  const t = (seconds - from.time) / (to.time - from.time);
  const ease = t * t * (3 - 2 * t); // smoothstep
  const h = from.h + (to.h - from.h) * ease;
  const s = from.s + (to.s - from.s) * ease;
  const l = from.l + (to.l - from.l) * ease;
  return `hsl(${h}, ${s}%, ${l}%)`;
};

type Phase = "idle" | "running" | "done";

const Index = () => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setPhase("done");
  }, []);

  const start = useCallback(() => {
    setElapsed(0);
    setPhase("running");
    const startTime = Date.now();
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 250);
  }, []);

  const handleTap = useCallback(() => {
    if (phase === "idle") start();
    else if (phase === "running") stop();
    else { setPhase("idle"); setElapsed(0); }
  }, [phase, start, stop]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Keep screen awake
  useEffect(() => {
    if (phase === "running" && "wakeLock" in navigator) {
      let lock: WakeLockSentinel | null = null;
      (navigator as any).wakeLock.request("screen").then((l: WakeLockSentinel) => { lock = l; }).catch(() => {});
      return () => { lock?.release(); };
    }
  }, [phase]);

  const progress = phase === "running" ? (elapsed % 60) / 60 : phase === "done" ? 1 : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className="h-svh w-full flex flex-col items-center select-none overflow-hidden bg-background">
      {/* Nothing heading */}
      <motion.h1
        className="mt-[15vh] font-extralight tracking-tighter text-foreground"
        style={{ fontSize: "clamp(4rem, 15vw, 8rem)" }}
        animate={{ opacity: phase === "done" ? 0.1 : 1 }}
        transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
      >
        Nothing
      </motion.h1>

      {/* Clock */}
      <motion.div
        className="mt-[10vh] relative flex items-center justify-center cursor-pointer"
        style={{ width: 256, height: 256 }}
        onClick={handleTap}
        whileTap={{ scale: 0.98 }}
        animate={phase === "running" ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        transition={
          phase === "running"
            ? { duration: 4, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", stiffness: 300, damping: 30 }
        }
      >
        <svg width={256} height={256} className="absolute inset-0">
          {/* Background circle */}
          <circle
            cx={128}
            cy={128}
            r={CIRCLE_RADIUS}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={1}
          />
          {/* Progress circle */}
          <circle
            cx={128}
            cy={128}
            r={CIRCLE_RADIUS}
            fill="none"
            stroke={phase === "idle" ? "hsl(var(--foreground))" : getStrokeColor(elapsed)}
            strokeWidth={phase === "idle" ? 1 : 1.5}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 128 128)"
            style={{ transition: "stroke-dashoffset 1s linear, stroke 2s ease, stroke-width 0.5s ease" }}
          />
        </svg>

        {/* Timer text */}
        <span
          className="text-foreground tabular-nums"
          style={{ fontFamily: "'Geist Mono', monospace", fontSize: "1.5rem", fontWeight: 400 }}
        >
          {phase === "idle" ? "tap" : formatTime(elapsed)}
        </span>
      </motion.div>

      {/* Success message */}
      <AnimatePresence>
        {phase === "done" && (
          <motion.p
            className="fixed bottom-[10vh] left-0 right-0 text-center text-muted-foreground px-8"
            style={{ fontSize: "1rem", letterSpacing: "0.02em", fontWeight: 400 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          >
            You have successfully done nothing for {formatHuman(elapsed)}. Well done.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;

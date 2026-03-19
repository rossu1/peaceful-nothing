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

const getStrokeColor = (seconds: number): string => {
  const stages = [
    { time: 0, h: 0, s: 0, l: 10 },
    { time: 30, h: 210, s: 30, l: 40 },
    { time: 120, h: 180, s: 35, l: 38 },
    { time: 300, h: 150, s: 30, l: 35 },
    { time: 600, h: 42, s: 45, l: 45 },
  ];
  let i = 0;
  while (i < stages.length - 1 && seconds >= stages[i + 1].time) i++;
  if (i >= stages.length - 1) {
    const s = stages[stages.length - 1];
    return `hsl(${s.h}, ${s.s}%, ${s.l}%)`;
  }
  const from = stages[i];
  const to = stages[i + 1];
  const t = (seconds - from.time) / (to.time - from.time);
  const ease = t * t * (3 - 2 * t);
  return `hsl(${from.h + (to.h - from.h) * ease}, ${from.s + (to.s - from.s) * ease}%, ${from.l + (to.l - from.l) * ease}%)`;
};

const MOODS = [
  { id: "rain", label: "rain", prompt: "Gentle rain falling on leaves and rooftops, soft ambient rain sounds, peaceful and calming, no music, pure nature recording feel" },
  { id: "bowls", label: "bowls", prompt: "Tibetan singing bowls meditation, resonant harmonics, deep calming vibrations, slow and meditative, no percussion, pure bowl tones" },
  { id: "ocean", label: "ocean", prompt: "Soft ocean waves gently lapping on a shore, distant seagulls, peaceful coastal ambient soundscape, calming and meditative" },
  { id: "forest", label: "forest", prompt: "Gentle forest ambience, soft birdsong, rustling leaves, distant stream, peaceful woodland atmosphere, no music, pure nature" },
  { id: "drone", label: "drone", prompt: "Soft ambient meditation music, gentle drones and pads, peaceful calming atmosphere, no percussion, slow evolving warm textures" },
] as const;

type MoodId = typeof MOODS[number]["id"];
type Phase = "idle" | "running" | "done";
type MusicState = "off" | "picking" | "loading" | "playing" | "error";

const Index = () => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [musicState, setMusicState] = useState<MusicState>("off");
  const [activeMood, setActiveMood] = useState<MoodId | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const fadeOutAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const fadeInterval = setInterval(() => {
      if (audio.volume > 0.05) {
        audio.volume = Math.max(0, audio.volume - 0.05);
      } else {
        clearInterval(fadeInterval);
        audio.pause();
        audio.volume = 1;
        setMusicState("off");
        setActiveMood(null);
      }
    }, 100);
  }, []);

  const generateAndPlayMusic = useCallback(async (moodId: MoodId) => {
    const mood = MOODS.find((m) => m.id === moodId);
    if (!mood) return;

    setMusicState("loading");
    setActiveMood(moodId);

    // Create and unlock audio immediately within user gesture context
    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0;
    audioRef.current = audio;
    // Unlock audio context on mobile browsers
    await audio.play().catch(() => {});
    audio.pause();

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-music`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ prompt: mood.prompt, duration: 120 }),
        }
      );

      if (!response.ok) throw new Error("Music generation failed");

      const blob = await response.blob();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      audio.src = url;
      await audio.play();

      const fadeIn = setInterval(() => {
        if (audio.volume < 0.45) {
          audio.volume = Math.min(0.5, audio.volume + 0.05);
        } else {
          clearInterval(fadeIn);
        }
      }, 100);

      setMusicState("playing");
    } catch (err) {
      console.error("Music error:", err);
      setMusicState("error");
      setTimeout(() => { setMusicState("off"); setActiveMood(null); }, 3000);
    }
  }, []);

  const handleAmbientClick = useCallback(() => {
    if (musicState === "playing") {
      fadeOutAudio();
    } else if (musicState === "picking") {
      setMusicState("off");
    } else if (musicState === "off" || musicState === "error") {
      setMusicState("picking");
    }
  }, [musicState, fadeOutAudio]);

  const handleMoodSelect = useCallback((moodId: MoodId) => {
    generateAndPlayMusic(moodId);
  }, [generateAndPlayMusic]);

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

    // Auto-start ambient music if not already playing
    if (musicState === "off" || musicState === "error") {
      generateAndPlayMusic("drone");
    }
  }, [musicState, generateAndPlayMusic]);

  const handleTap = useCallback(() => {
    if (phase === "idle") start();
    else if (phase === "running") stop();
    else { setPhase("idle"); setElapsed(0); }
  }, [phase, start, stop]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioRef.current) audioRef.current.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase === "running" && "wakeLock" in navigator) {
      let lock: WakeLockSentinel | null = null;
      (navigator as any).wakeLock.request("screen").then((l: WakeLockSentinel) => { lock = l; }).catch(() => {});
      return () => { lock?.release(); };
    }
  }, [phase]);

  const progress = phase === "running" ? (elapsed % 60) / 60 : phase === "done" ? 1 : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const ambientLabel = (() => {
    if (musicState === "off") return "ambient";
    if (musicState === "picking") return "cancel";
    if (musicState === "loading") return "generating…";
    if (musicState === "playing") return `${activeMood} ·  stop`;
    if (musicState === "error") return "retry";
    return "ambient";
  })();

  return (
    <div className="h-svh w-full flex flex-col items-center select-none overflow-hidden bg-background">
      <motion.h1
        className="mt-[15vh] font-extralight tracking-tighter text-foreground"
        style={{ fontSize: "clamp(4rem, 15vw, 8rem)" }}
        animate={{ opacity: phase === "done" ? 0.1 : 1 }}
        transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
      >
        Nothing
      </motion.h1>

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
          <circle cx={128} cy={128} r={CIRCLE_RADIUS} fill="none" stroke="hsl(var(--muted))" strokeWidth={1} />
          <circle
            cx={128} cy={128} r={CIRCLE_RADIUS} fill="none"
            stroke={phase === "idle" ? "hsl(var(--foreground))" : getStrokeColor(elapsed)}
            strokeWidth={phase === "idle" ? 1 : 1.5}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 128 128)"
            style={{ transition: "stroke-dashoffset 1s linear, stroke 2s ease, stroke-width 0.5s ease" }}
          />
        </svg>
        <span
          className="text-foreground tabular-nums"
          style={{ fontFamily: "'Geist Mono', monospace", fontSize: "1.5rem", fontWeight: 400 }}
        >
          {phase === "idle" ? "tap" : formatTime(elapsed)}
        </span>
      </motion.div>

      {/* Ambient controls */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <motion.button
          className="text-muted-foreground bg-transparent border-none cursor-pointer"
          style={{ fontSize: "0.8rem", letterSpacing: "0.05em", fontWeight: 400 }}
          onClick={(e) => { e.stopPropagation(); handleAmbientClick(); }}
          whileTap={{ scale: 0.95 }}
          animate={{ opacity: musicState === "loading" ? 0.4 : 0.6 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {ambientLabel}
        </motion.button>

        {/* Mood picker */}
        <AnimatePresence>
          {musicState === "picking" && (
            <motion.div
              className="flex gap-4 flex-wrap justify-center"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              {MOODS.map((mood) => (
                <motion.button
                  key={mood.id}
                  className="text-muted-foreground bg-transparent border border-border rounded-full px-4 py-1.5 cursor-pointer"
                  style={{ fontSize: "0.75rem", letterSpacing: "0.04em", fontWeight: 400 }}
                  onClick={(e) => { e.stopPropagation(); handleMoodSelect(mood.id); }}
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ borderColor: "hsl(var(--foreground))", color: "hsl(var(--foreground))" }}
                  transition={{ duration: 0.2 }}
                >
                  {mood.label}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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

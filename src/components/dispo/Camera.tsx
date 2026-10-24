import { useEffect, useRef, useState } from "react";
import { IconButton, Wordmark } from "./shared";

export function Camera({
  framesLeft,
  onCapture,
  onClose,
  onFallbackFile,
}: {
  framesLeft: number;
  onCapture: (c: HTMLCanvasElement, flashLook: boolean) => void;
  onClose: () => void;
  onFallbackFile: (f: File, flashLook: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [flashLook, setFlashLook] = useState(false);
  const [flashKey, setFlashKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Live camera isn't available in this browser. Use the system camera instead.");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch(() => {});
        }
        setError(null);
      } catch (e) {
        const n = (e as Error).name;
        setError(
          n === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in Settings, or use the system camera."
            : "Couldn't start the camera. You can still use the system camera.",
        );
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setFlashKey((k) => k + 1);
    navigator.vibrate?.(18);
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    if (facing === "user") {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    setTimeout(() => onCapture(c, flashLook), 260);
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground">
      <header className="safe-top flex items-center justify-between px-4 pb-3">
        <IconButton label="Close camera" onClick={onClose}>✕</IconButton>
        <Wordmark className="text-2xl" />
        <div className="body-panel flex items-center gap-2 rounded-lg px-3 py-2">
          <span className="label-mono text-muted-foreground">Exp</span>
          <span className="font-mono text-lg font-semibold tabular-nums text-primary">
            {String(framesLeft).padStart(2, "0")}
          </span>
        </div>
      </header>

      <div className="relative mx-3 flex-1 overflow-hidden rounded-2xl body-panel">
        {!error && (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            onLoadedData={() => setReady(true)}
            className={`h-full w-full object-cover transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"} ${facing === "user" ? "-scale-x-100" : ""}`}
          />
        )}
        {/* viewfinder brackets */}
        <div className="pointer-events-none absolute inset-6 rounded-xl border border-cream/25" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cream/40" />
        {!ready && !error && (
          <p className="absolute inset-0 grid place-items-center label-mono text-muted-foreground">
            Winding film…
          </p>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="font-display text-xl">{error}</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="key rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground"
            >
              Use system camera
            </button>
          </div>
        )}
        {flashKey > 0 && (
          <div key={flashKey} className="pointer-events-none absolute inset-0 bg-cream animate-shutter" />
        )}
        {flashLook && (
          <span className="absolute left-4 top-4 rounded-full bg-accent px-3 py-1 label-mono text-accent-foreground">
            Flash look · simulated
          </span>
        )}
      </div>

      <footer className="safe-bottom flex items-center justify-between px-8 pt-5">
        <button
          type="button"
          onClick={() => setFlashLook((f) => !f)}
          aria-pressed={flashLook}
          className={`key flex h-14 w-16 flex-col items-center justify-center rounded-xl ${flashLook ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`}
        >
          <span className="text-lg leading-none">ϟ</span>
          <span className="mt-1 text-[0.55rem] font-mono uppercase tracking-widest">Flash look</span>
        </button>
        <button
          type="button"
          aria-label="Take photo"
          onClick={error ? () => fileRef.current?.click() : shoot}
          className="key grid h-20 w-20 place-items-center rounded-full bg-primary ring-4 ring-secondary"
        >
          <span className="h-14 w-14 rounded-full border-2 border-primary-foreground/20 bg-primary" />
        </button>
        <IconButton
          label="Flip camera"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          disabled={!!error}
        >
          ⟲
        </IconButton>
      </footer>
      <p className="pb-2 text-center label-mono text-muted-foreground">
        Phone flash is not used · flash look is applied in processing
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFallbackFile(f, flashLook);
        }}
      />
    </div>
  );
}
import { useEffect, useMemo, useRef, useState } from "react";
import { PRESETS, renderFilm, exportMaxEdge, type FilmSettings, type PresetId } from "@/lib/film";
import { IconButton, shareOrDownload, toGalleryItem, type GalleryItem } from "./shared";

const PREVIEW_EDGE = 1100;

function blit(target: HTMLCanvasElement | null, src: HTMLCanvasElement) {
  if (!target) return;
  target.width = src.width;
  target.height = src.height;
  target.getContext("2d")!.drawImage(src, 0, 0);
}

export function Editor({
  source,
  date,
  seed,
  settings,
  onChange,
  onBack,
  onSaved,
  galleryCount,
  onOpenGallery,
}: {
  source: HTMLCanvasElement;
  date: Date;
  seed: number;
  settings: FilmSettings;
  onChange: (s: FilmSettings) => void;
  onBack: () => void;
  onSaved: (g: GalleryItem) => void;
  galleryCount: number;
  onOpenGallery: () => void;
}) {
  const afterRef = useRef<HTMLCanvasElement>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50);
  const [aspect, setAspect] = useState(source.width / source.height);
  const [busy, setBusy] = useState<null | "save" | "share">(null);
  const [toast, setToast] = useState<string | null>(null);
  const savedFor = useRef<{ key: string; item: GalleryItem } | null>(null);

  const preview = useMemo(() => {
    const s = Math.min(1, PREVIEW_EDGE / Math.max(source.width, source.height));
    const c = document.createElement("canvas");
    c.width = Math.round(source.width * s);
    c.height = Math.round(source.height * s);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  }, [source]);

  // original (only framing applied so it aligns with the processed print)
  useEffect(() => {
    const o = renderFilm(preview, settings, { maxEdge: PREVIEW_EDGE, seed, date, bypass: true });
    blit(beforeRef.current, o);
    setAspect(o.width / o.height);
  }, [preview, settings.frame, seed, date]); // eslint-disable-line react-hooks/exhaustive-deps

  // processed preview, coalesced to animation frames
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const out = renderFilm(preview, settings, { maxEdge: PREVIEW_EDGE, seed, date });
      blit(afterRef.current, out);
      out.width = 0;
    });
    return () => cancelAnimationFrame(id);
  }, [preview, settings, seed, date]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function set<K extends keyof FilmSettings>(k: K, v: FilmSettings[K]) {
    onChange({ ...settings, [k]: v });
  }

  function dragTo(clientX: number) {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    setSplit(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  }

  async function exportPrint(mode: "save" | "share") {
    setBusy(mode);
    try {
      await new Promise((r) => setTimeout(r, 30)); // let the UI paint the busy state
      const key = JSON.stringify(settings);
      let item = savedFor.current?.key === key ? savedFor.current.item : null;
      if (!item) {
        const full = renderFilm(source, settings, { maxEdge: exportMaxEdge(), seed, date });
        item = await toGalleryItem(full, PRESETS[settings.preset].name);
        full.width = 0;
        savedFor.current = { key, item };
        onSaved(item);
      }
      const res = await shareOrDownload(item.blob, item.name, mode === "share");
      if (res === "downloaded") setToast(`Saved ${item.width}×${item.height} JPG`);
      if (res === "shared") setToast("Shared");
    } catch {
      setToast("Couldn't export this photo. Try a smaller image.");
    } finally {
      setBusy(null);
    }
  }

  const preset = PRESETS[settings.preset];

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="safe-top flex items-center justify-between px-4 pb-3">
        <IconButton label="Back" onClick={onBack}>←</IconButton>
        <div className="text-center">
          <p className="label-mono text-muted-foreground">Film lab</p>
          <p className="font-display text-lg font-semibold">{preset.name}</p>
        </div>
        <IconButton label="Session gallery" onClick={onOpenGallery}>
          ▦ {galleryCount}
        </IconButton>
      </header>

      <div className="px-3">
        <div
          ref={boxRef}
          className="relative mx-auto max-h-[42dvh] touch-none select-none overflow-hidden rounded-xl bg-muted"
          style={{ aspectRatio: String(aspect), maxWidth: `calc(42dvh * ${aspect})` }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            dragTo(e.clientX);
          }}
          onPointerMove={(e) => e.buttons && dragTo(e.clientX)}
        >
          <canvas ref={afterRef} className="absolute inset-0 h-full w-full" />
          <canvas
            ref={beforeRef}
            className="absolute inset-0 h-full w-full"
            style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
          />
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${split}%` }}>
            <div className="key absolute top-1/2 left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-sm text-primary-foreground">
              ⇆
            </div>
          </div>
          <span className="absolute left-2 top-2 rounded bg-background/70 px-2 py-0.5 label-mono">Before</span>
          <span className="absolute right-2 top-2 rounded bg-primary px-2 py-0.5 label-mono text-primary-foreground">After</span>
        </div>
      </div>

      <section className="body-panel mt-3 flex-1 rounded-t-3xl px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+7rem)]">
        <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Disposable camera lighting">
          <button type="button" aria-pressed={settings.preset !== "nightflash800"} onClick={() => set("preset", "disposable800")} className={`key rounded-xl px-4 py-3 text-left font-semibold ${settings.preset !== "nightflash800" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>☀ No flash<span className="block text-xs font-normal opacity-75">Daylight film</span></button>
          <button type="button" aria-pressed={settings.preset === "nightflash800"} onClick={() => set("preset", "nightflash800")} className={`key rounded-xl px-4 py-3 text-left font-semibold ${settings.preset === "nightflash800" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>⚡ Flash<span className="block text-xs font-normal opacity-75">Indoor snapshots</span></button>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-3">
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => set("preset", id)}
              aria-pressed={settings.preset === id}
              className={`key shrink-0 rounded-xl px-4 py-3 text-left ${
                settings.preset === id ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}
            >
              <span className="block label-mono opacity-70">ISO {PRESETS[id].iso}</span>
              <span className="block font-display text-base font-semibold">{PRESETS[id].name}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{preset.blurb}</p>

        <div className="mt-4 grid gap-1">
          <Dial label="Intensity" value={settings.intensity} min={0} max={100} onChange={(v) => set("intensity", v)} fmt={(v) => `${v}%`} />
          <Dial label="Grain" value={settings.grain} min={0} max={100} onChange={(v) => set("grain", v)} fmt={(v) => `${v}`} />
          <Dial label="Warmth" value={settings.warmth} min={-50} max={50} onChange={(v) => set("warmth", v)} fmt={(v) => (v > 0 ? `+${v}` : `${v}`)} />
          <Dial label="Exposure" value={settings.exposure} min={-100} max={100} onChange={(v) => set("exposure", v)} fmt={(v) => `${v >= 0 ? "+" : ""}${(v / 100).toFixed(1)} EV`} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Toggle label="Date" sub="'98 stamp" on={settings.dateStamp} onClick={() => set("dateStamp", !settings.dateStamp)} />
          <Toggle label="Leak" sub="light leak" on={settings.lightLeak} onClick={() => set("lightLeak", !settings.lightLeak)} />
          <Toggle label="Border" sub="print frame" on={settings.frame} onClick={() => set("frame", !settings.frame)} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 pb-4">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => exportPrint("save")}
            className="key rounded-full bg-secondary py-4 font-semibold disabled:opacity-60"
          >
            {busy === "save" ? "Developing…" : "Save JPG"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => exportPrint("share")}
            className="key rounded-full bg-primary py-4 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy === "share" ? "Developing…" : "Share"}
          </button>
        </div>
        <p className="text-center label-mono text-muted-foreground">Processed on this device · never uploaded</p>
      </section>

      {toast && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-50 flex justify-center px-4 animate-rise">
          <p className="rounded-full bg-cream px-5 py-3 text-sm font-medium text-primary-foreground">{toast}</p>
        </div>
      )}
    </div>
  );
}

function Dial({
  label,
  value,
  min,
  max,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
}) {
  return (
    <label className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3">
      <span className="label-mono text-muted-foreground">{label}</span>
      <input
        className="dial"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(label === "Intensity" ? 85 : label === "Grain" ? 34 : 0)}
      />
      <span className="text-right font-mono text-sm tabular-nums text-primary">{fmt(value)}</span>
    </label>
  );
}

function Toggle({ label, sub, on, onClick }: { label: string; sub: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`key flex flex-col items-start rounded-xl px-3 py-2.5 ${on ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
    >
      <span className="flex w-full items-center justify-between">
        <span className="font-semibold">{label}</span>
        <span className={`h-2 w-2 rounded-full ${on ? "bg-accent" : "bg-muted-foreground/40"}`} />
      </span>
      <span className="label-mono opacity-70">{sub}</span>
    </button>
  );
}
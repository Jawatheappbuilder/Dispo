import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, DecodeError, decodeImageFile, exportMaxEdge, sanitizeSettings, type FilmSettings } from "@/lib/film";
import { Camera } from "@/components/dispo/Camera";
import { Editor } from "@/components/dispo/Editor";
import { Gallery } from "@/components/dispo/Gallery";
import { Wordmark, type GalleryItem } from "@/components/dispo/shared";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DISPO. — Disposable film camera" },
      { name: "description", content: "Turn your photos into disposable-camera film prints, processed privately on your device." },
      { property: "og:title", content: "DISPO. — Disposable film camera" },
      { property: "og:description", content: "Disposable 800 film simulation. On-device, no uploads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const KEY = "dispo.settings.v2";
const FRAMES = "dispo.frames.v1";

function Index() {
  const [screen, setScreen] = useState<"home" | "camera" | "edit" | "gallery">("home");
  const [settings, setSettings] = useState<FilmSettings>(DEFAULT_SETTINGS);
  const [frames, setFrames] = useState(27);
  const [photo, setPhoto] = useState<{ c: HTMLCanvasElement; date: Date; seed: number } | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setSettings(sanitizeSettings(JSON.parse(localStorage.getItem(KEY) || "{}")));
      const f = Number(localStorage.getItem(FRAMES));
      if (f > 0 && f <= 27) setFrames(f);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ } }, [settings]);

  function useFrame() {
    setFrames((f) => {
      const n = f <= 1 ? 27 : f - 1;
      try { localStorage.setItem(FRAMES, String(n)); } catch { /* ignore */ }
      return n;
    });
  }
  function openCanvas(c: HTMLCanvasElement, date: Date, flash: boolean) {
    if (flash) setSettings((s) => ({ ...s, preset: "nightflash800" }));
    setPhoto({ c, date, seed: (Math.random() * 1e9) | 0 });
    useFrame();
    setScreen("edit");
  }
  async function openFile(f: File, flash = false) {
    setError(null);
    setLoading(true);
    try {
      const c = await decodeImageFile(f, exportMaxEdge());
      openCanvas(c, new Date(f.lastModified || Date.now()), flash);
    } catch (e) {
      setError(e instanceof DecodeError ? e.message : "Couldn't open that photo.");
      setScreen("home");
    } finally {
      setLoading(false);
    }
  }

  const fileInput = (
    <input ref={fileRef} type="file" accept="image/*" className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) openFile(f); }} />
  );

  if (screen === "camera")
    return <Camera framesLeft={frames} onClose={() => setScreen("home")}
      onCapture={(c, fl) => openCanvas(c, new Date(), fl)} onFallbackFile={(f, fl) => openFile(f, fl)} />;
  if (screen === "gallery")
    return <Gallery items={gallery} onBack={() => setScreen(photo ? "edit" : "home")}
      onDelete={(id) => setGallery((g) => g.filter((i) => { if (i.id === id) URL.revokeObjectURL(i.url); return i.id !== id; }))} />;
  if (screen === "edit" && photo)
    return <Editor source={photo.c} date={photo.date} seed={photo.seed} settings={settings} onChange={setSettings}
      onBack={() => setScreen("home")} onSaved={(g) => setGallery((l) => [g, ...l])}
      galleryCount={gallery.length} onOpenGallery={() => setScreen("gallery")} />;

  return (
    <main className="flex min-h-dvh flex-col px-6 safe-top safe-bottom text-foreground">
      {fileInput}
      <div className="flex items-center justify-between pt-2">
        <span className="label-mono text-muted-foreground">35mm · 27 exp</span>
        <button type="button" onClick={() => setScreen("gallery")} className="label-mono text-muted-foreground underline-offset-4 hover:underline">
          Prints ({gallery.length})
        </button>
      </div>
      <section className="flex flex-1 flex-col justify-center animate-rise">
        <div className="body-panel relative overflow-hidden rounded-3xl p-6">
          <div className="absolute right-6 top-6 h-3 w-3 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
          <Wordmark className="text-7xl text-cream" />
          <div className="mt-3 h-2 w-24 rounded-full bg-primary" />
          <p className="mt-5 font-display text-2xl leading-tight">Disposable 800.<br />Every photo, a print.</p>
          <p className="mt-3 text-sm text-muted-foreground">Film simulation developed on your phone. Nothing leaves your device.</p>
          <div className="mt-6 flex items-center gap-3">
            <span className="label-mono text-muted-foreground">Exp. left</span>
            <span className="font-mono text-2xl font-semibold text-primary tabular-nums">{String(frames).padStart(2, "0")}</span>
          </div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-accent/20 p-4 text-sm">{error}</p>}
      </section>
      <div className="grid gap-3 pb-4">
        <button type="button" disabled={loading} onClick={() => fileRef.current?.click()}
          className="key rounded-full bg-primary py-5 text-lg font-semibold text-primary-foreground disabled:opacity-60">
          {loading ? "Loading film…" : "Open photo"}
        </button>
        <button type="button" onClick={() => setScreen("camera")} className="key rounded-full bg-secondary py-5 text-lg font-semibold">
          Take photo
        </button>
      </div>
    </main>
  );
}
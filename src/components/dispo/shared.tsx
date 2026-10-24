import type { ReactNode } from "react";
import { canvasToJpeg } from "@/lib/film";

export interface GalleryItem {
  id: string;
  url: string;
  blob: Blob;
  name: string;
  preset: string;
  width: number;
  height: number;
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-tight letterpress ${className}`}>
      DISPO<span className="text-accent">.</span>
    </span>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`key grid h-11 min-w-11 place-items-center rounded-full px-3 label-mono disabled:opacity-40 ${
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function canNativeShareFiles(file: File): boolean {
  try {
    return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareOrDownload(blob: Blob, name: string, preferShare: boolean) {
  const file = new File([blob], name, { type: "image/jpeg" });
  if (preferShare && canNativeShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title: "DISPO." });
      return "shared" as const;
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled" as const;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded" as const;
}

export async function toGalleryItem(c: HTMLCanvasElement, preset: string): Promise<GalleryItem> {
  const blob = await canvasToJpeg(c, 0.92);
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = `DISPO_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
  return {
    id: `${d.getTime()}-${Math.round(performance.now())}`,
    url: URL.createObjectURL(blob),
    blob,
    name,
    preset,
    width: c.width,
    height: c.height,
  };
}
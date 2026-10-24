import { useState } from "react";
import { IconButton, shareOrDownload, type GalleryItem } from "./shared";

export function Gallery({
  items,
  onBack,
  onDelete,
}: {
  items: GalleryItem[];
  onBack: () => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState<GalleryItem | null>(null);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="safe-top flex items-center justify-between px-4 pb-4">
        <IconButton label="Back" onClick={onBack}>←</IconButton>
        <div className="text-center">
          <p className="label-mono text-muted-foreground">This session</p>
          <p className="font-display text-lg font-semibold">Contact sheet</p>
        </div>
        <span className="w-11" />
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
          <div className="h-24 w-20 rotate-[-4deg] rounded-sm bg-paper p-2 shadow-lg">
            <div className="h-full w-full bg-muted" />
          </div>
          <p className="font-display text-xl">No prints yet</p>
          <p className="text-sm text-muted-foreground">
            Photos you save or share appear here until you close the app. Nothing is stored online.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 safe-bottom sm:grid-cols-3">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setOpen(it)}
              className="animate-rise rounded-sm bg-paper p-1.5 pb-5 shadow-lg transition-transform active:scale-95"
              style={{ rotate: `${(i % 3) - 1}deg`, animationDelay: `${i * 40}ms` }}
            >
              <img src={it.url} alt={`${it.preset} print`} className="aspect-square w-full object-cover" loading="lazy" />
              <span className="mt-1 block font-mono text-[0.6rem] uppercase text-primary-foreground/70">{it.preset}</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur safe-top safe-bottom">
          <div className="flex justify-end px-4">
            <IconButton label="Close" onClick={() => setOpen(null)}>✕</IconButton>
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            <img src={open.url} alt={`${open.preset} print`} className="max-h-full max-w-full rounded-md" />
          </div>
          <div className="grid grid-cols-3 gap-3 px-4">
            <button type="button" className="key rounded-full bg-secondary py-3 font-semibold" onClick={() => shareOrDownload(open.blob, open.name, false)}>
              Save
            </button>
            <button type="button" className="key rounded-full bg-primary py-3 font-semibold text-primary-foreground" onClick={() => shareOrDownload(open.blob, open.name, true)}>
              Share
            </button>
            <button
              type="button"
              className="key rounded-full bg-accent py-3 font-semibold text-accent-foreground"
              onClick={() => {
                onDelete(open.id);
                setOpen(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
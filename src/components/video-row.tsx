import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowDown, ArrowUp, CircleCheck, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Episode } from "@/lib/parse";

export type Video = { name: string; path: string; created: number };
export type Done = { id: string; privacy?: string; at?: string };
export type Dims = { w: number; h: number; d: number };

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

// YouTube treats a video as a Short when it is vertical or square and at most 3 minutes long.
function shortsWarning(dims?: Dims) {
  if (!dims) return null;
  if (dims.w > dims.h) return "Horizontal, YouTube will not show it as a Short";
  if (dims.d > 180) return "Longer than 3 minutes, YouTube will not show it as a Short";
  return null;
}

type Props = {
  ep?: Episode;
  video?: Video;
  /** Publish time when scheduling, else null */
  slot: Date | null;
  scheduling: boolean;
  done?: Done;
  progress: number | null;
  dims?: Dims;
  locked: boolean;
  canUp: boolean;
  canDown: boolean;
  dropTarget: boolean;
  onUp: () => void;
  onDown: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => boolean;
  onDragLeave: () => void;
  onDrop: () => void;
  onDims: (d: Dims) => void;
};

export function VideoRow(p: Props) {
  const passed = !p.done && p.slot && p.slot.getTime() <= Date.now();
  const shorts = shortsWarning(p.dims);
  const doneAt = p.done?.at ? new Date(p.done.at) : null;

  return (
    <li
      onDragOver={(e) => {
        if (p.onDragOver()) e.preventDefault();
      }}
      onDragLeave={p.onDragLeave}
      onDrop={p.onDrop}
      className={cn(
        "grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-3 transition-colors",
        p.dropTarget && "bg-primary/10",
      )}
    >
      {p.video ? (
        <div
          draggable={!p.locked}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            p.onDragStart();
          }}
          onDragEnd={p.onDragEnd}
          title={p.locked ? undefined : "Drag onto another episode to swap"}
          className={cn("flex items-center gap-1", !p.locked && "cursor-grab active:cursor-grabbing")}
        >
          <GripVertical className={cn("size-4 text-muted-foreground", p.locked && "invisible")} />
          <video
            src={`${convertFileSrc(p.video.path)}#t=0.1`}
            muted
            loop
            playsInline
            preload="metadata"
            width={54}
            height={96}
            aria-label={`Preview of ${p.video.name}`}
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => e.currentTarget.pause()}
            onLoadedMetadata={(e) => {
              const { videoWidth: w, videoHeight: h, duration: d } = e.currentTarget;
              p.onDims({ w, h, d });
            }}
            className="aspect-[9/16] h-24 w-auto rounded-md bg-black object-cover"
          />
        </div>
      ) : (
        <div className="ml-5 flex aspect-[9/16] h-24 items-center justify-center rounded-md border border-dashed text-center text-xs text-muted-foreground">
          No
          <br />
          video
        </div>
      )}

      <div className="min-w-0 space-y-0.5">
        <p className="text-xs text-muted-foreground tabular-nums">{p.ep ? `Episode ${p.ep.ep}` : "No episode"}</p>
        <p className={cn("truncate font-medium", !p.ep?.title && "text-muted-foreground")}>
          {p.ep ? p.ep.title || "Title missing" : "Paste a title and description for this video"}
        </p>
        {p.ep?.description && (
          <p className="truncate text-sm text-muted-foreground">{p.ep.description.split("\n")[0]}</p>
        )}
        {p.video && <p className="truncate text-xs text-muted-foreground/80">{p.video.name}</p>}
        {p.ep?.problems.map((msg) => (
          <p key={msg} className="text-xs text-destructive">{msg}</p>
        ))}
        {shorts && <p className="text-xs text-amber-700 dark:text-amber-400">{shorts}</p>}
      </div>

      <div className="min-w-28 text-right text-sm tabular-nums">
        {p.done ? (
          <>
            <p className="flex items-center justify-end gap-1 font-medium text-green-700 dark:text-green-500">
              <CircleCheck className="size-4" />
              {doneAt ? "Scheduled" : `Uploaded, ${p.done.privacy ?? "private"}`}
            </p>
            {doneAt && <p className="text-muted-foreground">{dateTimeFmt.format(doneAt)}</p>}
            <button
              type="button"
              onClick={() => openUrl(`https://studio.youtube.com/video/${p.done!.id}/edit`)}
              className="rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Open in YouTube Studio
            </button>
          </>
        ) : p.progress !== null ? (
          <>
            <p className="font-medium">Uploading {Math.floor(p.progress * 100)}%</p>
            <div className="mt-1.5 ml-auto h-1 w-24 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${p.progress * 100}%` }} />
            </div>
          </>
        ) : p.scheduling ? (
          p.slot ? (
            <>
              <p className={cn("text-lg font-medium", passed && "text-destructive")}>{timeFmt.format(p.slot)}</p>
              {passed && <p className="text-xs text-destructive">Already passed</p>}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Set a date and time</p>
          )
        ) : null}
      </div>

      <div className="flex flex-col">
        <Button variant="ghost" size="icon-xs" aria-label={`Move ${p.video?.name} up`} disabled={!p.canUp} onClick={p.onUp}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label={`Move ${p.video?.name} down`} disabled={!p.canDown} onClick={p.onDown}>
          <ArrowDown />
        </Button>
      </div>
    </li>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowDown, ArrowUp, FolderOpen, GripVertical, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseMetadata } from "@/lib/parse";
import { scheduleSlots } from "@/lib/schedule";

type Video = { name: string; path: string; created: number };
type Saved = { metadata?: string; order?: string[]; start?: string; times?: string[] };

const pad = (n: number) => String(n).padStart(2, "0");
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tomorrow = () => toDateInput(new Date(Date.now() + 864e5));
const fmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export default function App() {
  const [dir, setDir] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [metadata, setMetadata] = useState("");
  const [start, setStart] = useState(tomorrow);
  const [times, setTimes] = useState(["09:00"]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const txtInput = useRef<HTMLInputElement>(null);

  async function openDir(path: string) {
    setLoaded(false);
    setError("");
    try {
      const found = await invoke<Video[]>("scan_folder", { dir: path });
      let saved: Saved = {};
      try {
        saved = JSON.parse((await invoke<string | null>("load_state", { dir: path })) ?? "{}");
      } catch {
        setError("Could not read .clumyoup.json, starting fresh.");
      }
      // Saved order first, then new files by creation time (render order usually matches episode order).
      const order = saved.order ?? [];
      const rank = (v: Video) => (order.includes(v.name) ? order.indexOf(v.name) : Infinity);
      found.sort((a, b) => rank(a) - rank(b) || a.created - b.created || a.name.localeCompare(b.name));
      setDir(path);
      setVideos(found);
      setMetadata(saved.metadata ?? "");
      setStart(saved.start ?? tomorrow());
      setTimes(saved.times?.length ? saved.times : ["09:00"]);
      setLoaded(true);
    } catch (e) {
      setError(`Could not open ${path}: ${e}`);
    }
  }

  async function pickDir() {
    const picked = await open({ directory: true });
    if (typeof picked === "string") openDir(picked);
  }

  useEffect(() => {
    invoke<string | null>("start_dir").then((d) => {
      if (d) openDir(d);
    });
  }, []);

  useEffect(() => {
    if (!dir || !loaded) return;
    const json = JSON.stringify({ metadata, order: videos.map((v) => v.name), start, times }, null, 2);
    const t = setTimeout(() => {
      invoke("save_state", { dir, json }).catch((e) => setError(`Could not save .clumyoup.json: ${e}`));
    }, 300);
    return () => clearTimeout(t);
  }, [dir, loaded, metadata, videos, start, times]);

  const episodes = useMemo(() => parseMetadata(metadata), [metadata]);
  const rows = Math.max(episodes.length, videos.length);
  const slots = useMemo(() => scheduleSlots(rows, start, times), [rows, start, times]);
  const problemCount = episodes.filter((e) => e.problems.length).length;
  const now = Date.now();

  function swap(a: number, b: number) {
    if (a === b || a < 0 || b < 0 || a >= videos.length || b >= videos.length) return;
    setVideos((v) => {
      const next = [...v];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  }

  function setPerDay(n: number) {
    const count = Math.min(24, Math.max(1, n || 1));
    setTimes((t) => Array.from({ length: count }, (_, i) => t[i] ?? t[t.length - 1] ?? "09:00"));
  }

  if (!dir) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Open a folder of videos</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Or run <code className="rounded bg-muted px-1.5 py-0.5">clumyoup .</code> inside the folder from a terminal.
        </p>
        <Button size="lg" onClick={pickDir}>
          <FolderOpen /> Open folder
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </main>
    );
  }

  const lastSlot = slots[slots.length - 1];
  const days = Math.ceil(rows / times.length);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{dir.split(/[\\/]/).pop()}</h1>
          <p className="truncate text-xs text-muted-foreground">{dir}</p>
        </div>
        <Button variant="outline" onClick={pickDir}>
          <FolderOpen /> Open folder
        </Button>
      </header>
      {error && <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid min-h-0 flex-1 grid-cols-[360px_1fr]">
        <aside className="space-y-6 overflow-y-auto border-r p-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="metadata" className="text-sm font-medium">Titles and descriptions</label>
              <Button variant="ghost" size="sm" onClick={() => txtInput.current?.click()}>Load .txt</Button>
              <input
                ref={txtInput}
                type="file"
                accept=".txt,text/plain"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setMetadata(await file.text());
                  e.target.value = "";
                }}
              />
            </div>
            <textarea
              id="metadata"
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              placeholder={"Ep 1\nTitle\n===\nDescription\n\nEp 2\n..."}
              spellCheck={false}
              className="h-72 w-full resize-y rounded-lg border border-input bg-transparent p-2.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
            <p className="text-xs text-muted-foreground">
              {episodes.length} episodes
              {problemCount > 0 && <span className="text-destructive"> · {problemCount} need fixing</span>}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Schedule</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                First day
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                Videos per day
                <Input type="number" min={1} max={24} value={times.length} onChange={(e) => setPerDay(+e.target.value)} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {times.map((t, i) => (
                <label key={i} className="space-y-1 text-xs text-muted-foreground">
                  Video {i + 1} of the day
                  <Input
                    type="time"
                    value={t}
                    onChange={(e) => setTimes((ts) => ts.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                </label>
              ))}
            </div>
            {rows > 0 && lastSlot && (
              <p className="text-xs text-muted-foreground">
                {rows} videos over {days} {days === 1 ? "day" : "days"}, last one {fmt.format(lastSlot)}.
              </p>
            )}
          </section>
        </aside>

        <main className="overflow-y-auto">
          {episodes.length !== videos.length && (
            <p className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
              <TriangleAlert className="size-4 shrink-0" />
              {episodes.length} episodes but {videos.length} videos in this folder.
            </p>
          )}
          {rows === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No videos in this folder yet, and no episodes pasted.
            </p>
          ) : (
            <ol>
              {Array.from({ length: rows }, (_, i) => {
                const ep = episodes[i];
                const video = videos[i];
                const slot = slots[i];
                return (
                  <li
                    key={i}
                    onDragOver={(e) => {
                      if (dragFrom.current === null || !video) return;
                      e.preventDefault();
                      setDropTarget(i);
                    }}
                    onDragLeave={() => setDropTarget((t) => (t === i ? null : t))}
                    onDrop={() => {
                      if (dragFrom.current !== null) swap(dragFrom.current, i);
                      dragFrom.current = null;
                      setDropTarget(null);
                    }}
                    className={cn(
                      "grid grid-cols-[3rem_1fr_16rem_11rem_auto] items-center gap-4 border-b px-4 py-2",
                      dropTarget === i && "bg-primary/10",
                    )}
                  >
                    <span className="text-sm tabular-nums text-muted-foreground">{ep ? `Ep ${ep.ep}` : "–"}</span>

                    <div className="min-w-0">
                      <p className={cn("truncate text-sm", !ep?.title && "text-muted-foreground")}>
                        {ep ? ep.title || "(no title)" : "No title for this video"}
                      </p>
                      {ep?.problems.map((p) => (
                        <p key={p} className="text-xs text-destructive">{p}</p>
                      ))}
                    </div>

                    {video ? (
                      <div
                        draggable
                        onDragStart={(e) => {
                          dragFrom.current = i;
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          dragFrom.current = null;
                          setDropTarget(null);
                        }}
                        className="flex cursor-grab items-center gap-2 rounded-lg border bg-card p-1.5 active:cursor-grabbing"
                      >
                        <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                        <video
                          src={`${convertFileSrc(video.path)}#t=0.1`}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          aria-label={`Preview of ${video.name}`}
                          onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                          onMouseLeave={(e) => e.currentTarget.pause()}
                          className="h-20 w-[45px] shrink-0 rounded bg-black object-cover"
                        />
                        <span className="min-w-0 break-all text-xs">{video.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No video</span>
                    )}

                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        slot && slot.getTime() <= now ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {slot ? fmt.format(slot) : "Set a date and time"}
                      {slot && slot.getTime() <= now && <><br />Already passed</>}
                    </span>

                    <div className="flex flex-col">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Move ${video?.name} up`}
                        disabled={!video || i === 0}
                        onClick={() => swap(i, i - 1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Move ${video?.name} down`}
                        disabled={!video || i >= videos.length - 1}
                        onClick={() => swap(i, i + 1)}
                      >
                        <ArrowDown />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </main>
      </div>
    </div>
  );
}

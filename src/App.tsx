import { useEffect, useMemo, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CircleCheck, FolderOpen, Minus, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DatePicker } from "@/components/date-picker";
import { TimePicker } from "@/components/time-picker";
import { VideoRow, type Dims, type Done, type Video } from "@/components/video-row";
import { parseMetadata, toStandard } from "@/lib/parse";
import { FORMAT_NAMES, FormatGuide } from "@/components/format-guide";
import { scheduleSlots } from "@/lib/schedule";
import { addDays, startOfToday, toDateString } from "@/lib/calendar";

type Visibility = "schedule" | "public" | "unlisted" | "private";
type Saved = {
  metadata?: string;
  order?: string[];
  start?: string;
  times?: string[];
  visibility?: Visibility;
  madeForKids?: boolean;
  /** file name -> what is on YouTube, so a re-run never uploads the same file twice */
  uploaded?: Record<string, Done>;
};
type YtStatus = { has_client: boolean; connected: boolean };

const VISIBILITY: { value: Visibility; label: string; help: string }[] = [
  { value: "schedule", label: "Scheduled", help: "Uploaded as private. YouTube makes each video public at its time." },
  { value: "public", label: "Public", help: "Each video is public as soon as it finishes uploading." },
  { value: "unlisted", label: "Unlisted", help: "Only people with the link can watch. YouTube cannot schedule unlisted videos." },
  { value: "private", label: "Private", help: "Only you can watch until you change it in YouTube Studio." },
];

const tomorrow = () => toDateString(addDays(startOfToday(), 1));
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fullFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});
const segment = "flex-1 text-muted-foreground data-[state=on]:bg-muted data-[state=on]:font-semibold data-[state=on]:text-foreground";

export default function App() {
  const [dir, setDir] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [metadata, setMetadata] = useState("");
  // text before "Convert to standard", so it can be undone
  const [beforeConvert, setBeforeConvert] = useState<string | null>(null);
  const [start, setStart] = useState(tomorrow);
  const [times, setTimes] = useState(["09:00"]);
  const [visibility, setVisibility] = useState<Visibility>("schedule");
  const [madeForKids, setMadeForKids] = useState(false);
  const [uploaded, setUploaded] = useState<Record<string, Done>>({});
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [dims, setDims] = useState<Record<string, Dims>>({});
  const [yt, setYt] = useState<YtStatus>({ has_client: false, connected: false });
  const [connecting, setConnecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const dragFrom = useRef<number | null>(null);
  const txtInput = useRef<HTMLInputElement>(null);
  const connectAttempt = useRef(0);

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
      setVisibility(saved.visibility ?? "schedule");
      setMadeForKids(saved.madeForKids ?? false);
      setUploaded(saved.uploaded ?? {});
      setLoaded(true);
    } catch (e) {
      setError(`Could not open ${path}: ${e}`);
    }
  }

  async function pickDir() {
    const picked = await open({ directory: true });
    if (typeof picked === "string") openDir(picked);
  }

  async function refreshYt() {
    setYt(await invoke<YtStatus>("youtube_status"));
  }

  useEffect(() => {
    invoke<string | null>("start_dir").then((d) => {
      if (d) openDir(d);
    });
    refreshYt();
  }, []);

  useEffect(() => {
    if (!dir || !loaded) return;
    const state: Saved = {
      metadata, order: videos.map((v) => v.name), start, times, visibility, madeForKids, uploaded,
    };
    const json = JSON.stringify(state, null, 2);
    const t = setTimeout(() => {
      invoke("save_state", { dir, json }).catch((e) => setError(`Could not save .clumyoup.json: ${e}`));
    }, 300);
    return () => clearTimeout(t);
  }, [dir, loaded, metadata, videos, start, times, visibility, madeForKids, uploaded]);

  const parsed = useMemo(() => parseMetadata(metadata), [metadata]);
  const episodes = parsed.episodes;
  const rows = Math.max(episodes.length, videos.length);
  const scheduling = visibility === "schedule";
  const slots = useMemo(() => scheduleSlots(rows, start, times), [rows, start, times]);
  const problemCount = episodes.filter((e) => e.problems.length).length;
  const pending = videos.flatMap((v, i) => (uploaded[v.name] ? [] : [i]));
  const now = Date.now();

  const blockers: string[] = [];
  if (!yt.connected) blockers.push("Connect YouTube first.");
  if (episodes.length !== videos.length) blockers.push("Every video needs exactly one episode.");
  if (parsed.error) blockers.push("Fix the episode text so it can be read.");
  if (problemCount) blockers.push("Fix the episodes marked in red.");
  if (scheduling && pending.some((i) => !slots[i] || slots[i]!.getTime() <= now)) {
    blockers.push("Every publish time must be in the future.");
  }
  if (videos.length && !pending.length) blockers.push("Every video in this folder is already on YouTube.");

  // If Google blocks sign-in on its own page the browser never comes back, so a retry starts a
  // fresh attempt and the abandoned one (which times out by itself) is ignored.
  async function connect() {
    const attempt = ++connectAttempt.current;
    setConnecting(true);
    setError("");
    try {
      await invoke("connect");
    } catch (e) {
      if (attempt === connectAttempt.current) setError(String(e));
    } finally {
      if (attempt === connectAttempt.current) setConnecting(false);
      refreshYt();
    }
  }

  async function addClientSecret() {
    const path = await open({ filters: [{ name: "Google OAuth client", extensions: ["json"] }] });
    if (typeof path !== "string") return;
    try {
      await invoke("set_client_secret", { path });
      setError("");
    } catch (e) {
      setError(String(e));
    }
    refreshYt();
  }

  async function disconnect() {
    await invoke("disconnect").catch((e) => setError(String(e)));
    refreshYt();
  }

  async function uploadAll() {
    setUploading(true);
    setError("");
    const privacy = scheduling ? "private" : visibility;
    try {
      for (const i of pending) {
        const video = videos[i];
        const ep = episodes[i];
        const at = scheduling ? slots[i]! : null;
        if (at && at.getTime() <= Date.now()) throw new Error(`Episode ${ep.ep}'s publish time has already passed.`);
        setProgress({ name: video.name, pct: 0 });
        const onProgress = new Channel<number>();
        onProgress.onmessage = (pct) => setProgress({ name: video.name, pct });
        const id = await invoke<string>("upload_video", {
          path: video.path,
          title: ep.title,
          description: ep.description,
          privacy,
          madeForKids,
          publishAt: at?.toISOString() ?? null,
          onProgress,
        });
        setUploaded((u) => ({ ...u, [video.name]: { id, privacy, at: at?.toISOString() } }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.startsWith("QUOTA:") ? msg.slice(6).trim() : `Upload stopped: ${msg}`);
      refreshYt();
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  // Videos already on YouTube keep their title there, so they stay on their row.
  const locked = (i: number) => uploading || !videos[i] || !!uploaded[videos[i].name];

  function swap(a: number, b: number) {
    if (a === b || a < 0 || b < 0 || a >= videos.length || b >= videos.length) return;
    if (locked(a) || locked(b)) return;
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
        <h1 className="text-2xl font-semibold tracking-tight">Open a folder of videos</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Or run <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">clumyoup .</code> inside the
          folder from a terminal.
        </p>
        <Button size="lg" onClick={pickDir}>
          <FolderOpen /> Open folder
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </main>
    );
  }

  // One group per publish day when scheduling, otherwise a single list in upload order.
  const perGroup = scheduling ? times.length : Math.max(rows, 1);
  const groups = Array.from({ length: Math.ceil(rows / perGroup) }, (_, g) =>
    Array.from({ length: Math.min(perGroup, rows - g * perGroup) }, (_, k) => g * perGroup + k),
  );
  const lastSlot = slots[rows - 1];
  const action = scheduling ? "Schedule" : `Upload as ${visibility}:`;
  const count = `${pending.length} ${pending.length === 1 ? "video" : "videos"}`;
  const done = videos.length - pending.length;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b px-5 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">{dir.split(/[\\/]/).pop()}</h1>
          <p className="truncate text-xs text-muted-foreground">{dir}</p>
        </div>
        {!yt.has_client ? (
          <Button variant="outline" onClick={addClientSecret}>Add client_secret.json</Button>
        ) : !yt.connected ? (
          <>
            {connecting && <span className="text-sm text-muted-foreground">Finish signing in in your browser.</span>}
            <Button variant="outline" onClick={connect}>{connecting ? "Try again" : "Connect YouTube"}</Button>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-green-600 dark:text-green-500" /> YouTube connected
            <Button variant="ghost" size="sm" onClick={disconnect} disabled={uploading}>Disconnect</Button>
          </span>
        )}
        <Button variant="outline" onClick={pickDir} disabled={uploading}>
          <FolderOpen /> Open folder
        </Button>
      </header>
      {error && (
        <p role="alert" className="border-b bg-destructive/10 px-5 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr]">
        <aside className="flex min-h-0 flex-col border-r bg-muted/30">
          <fieldset disabled={uploading} className="min-h-0 flex-1 space-y-7 overflow-y-auto p-5">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="metadata" className="font-medium">Episodes</label>
                <Button variant="ghost" size="sm" onClick={() => txtInput.current?.click()}>Load file</Button>
                <input
                  ref={txtInput}
                  type="file"
                  accept=".txt,.md,.json,.csv,text/plain,application/json,text/csv"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setMetadata(await file.text());
                      setBeforeConvert(null);
                    }
                    e.target.value = "";
                  }}
                />
              </div>
              <textarea
                id="metadata"
                value={metadata}
                onChange={(e) => {
                  setMetadata(e.target.value);
                  setBeforeConvert(null);
                }}
                placeholder={"---\nep: 1\ntitle: Title\n---\nDescription\n\n---\nep: 2\n..."}
                spellCheck={false}
                className="h-44 w-full resize-y rounded-lg border border-input bg-background p-2.5 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
              {parsed.error ? (
                <p role="alert" className="text-xs text-destructive">{parsed.error}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {episodes.length} {episodes.length === 1 ? "episode" : "episodes"} found
                  {metadata.trim() && <> in {FORMAT_NAMES[parsed.format]} format</>}
                  {problemCount > 0 && <span className="text-destructive">, {problemCount} need fixing</span>}
                </p>
              )}
              <div className="flex items-center gap-3">
                <FormatGuide current={parsed.format} />
                {beforeConvert !== null ? (
                  <Button
                    variant="link"
                    size="xs"
                    className="h-auto px-0 text-xs"
                    onClick={() => {
                      setMetadata(beforeConvert);
                      setBeforeConvert(null);
                    }}
                  >
                    Undo convert
                  </Button>
                ) : (
                  parsed.format !== "standard" &&
                  episodes.length > 0 &&
                  !parsed.error && (
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto px-0 text-xs"
                      onClick={() => {
                        setBeforeConvert(metadata);
                        setMetadata(toStandard(episodes));
                      }}
                    >
                      Convert to standard
                    </Button>
                  )
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h2 id="visibility" className="font-medium">Visibility</h2>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={visibility}
                onValueChange={(v) => v && setVisibility(v as Visibility)}
                aria-labelledby="visibility"
                className="w-full bg-background"
              >
                {VISIBILITY.map((o) => (
                  <ToggleGroupItem key={o.value} value={o.value} className={segment}>{o.label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">{VISIBILITY.find((o) => o.value === visibility)!.help}</p>
            </section>

            <section className="space-y-2">
              <h2 id="audience" className="font-medium">Audience</h2>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={madeForKids ? "kids" : "not-kids"}
                onValueChange={(v) => v && setMadeForKids(v === "kids")}
                aria-labelledby="audience"
                className="w-full bg-background"
              >
                <ToggleGroupItem value="not-kids" className={segment}>Not made for kids</ToggleGroupItem>
                <ToggleGroupItem value="kids" className={segment}>Made for kids</ToggleGroupItem>
              </ToggleGroup>
              {madeForKids && (
                <p className="text-xs text-muted-foreground">
                  YouTube turns off comments and personalized ads on videos made for kids.
                </p>
              )}
            </section>

            {scheduling && (
              <section className="space-y-3">
                <h2 className="font-medium">Schedule</h2>
                <div className="space-y-1">
                  <label htmlFor="first-day" className="text-xs text-muted-foreground">First day</label>
                  <DatePicker id="first-day" value={start} onChange={setStart} days={groups.length} />
                </div>
                <div className="flex items-center justify-between">
                  <p id="per-day" className="text-sm">Videos per day</p>
                  <div role="group" aria-labelledby="per-day" className="flex items-center rounded-lg border bg-background">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="One less per day"
                      disabled={times.length <= 1}
                      onClick={() => setPerDay(times.length - 1)}
                    >
                      <Minus />
                    </Button>
                    <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{times.length}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="One more per day"
                      disabled={times.length >= 24}
                      onClick={() => setPerDay(times.length + 1)}
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {times.map((t, i) => (
                    <TimePicker
                      key={i}
                      label={times.length === 1 ? "Time" : `Video ${i + 1} of the day`}
                      value={t}
                      onChange={(v) => setTimes((ts) => ts.map((x, j) => (j === i ? v : x)))}
                    />
                  ))}
                </div>
                {rows > 0 && lastSlot && (
                  <p className="text-xs text-muted-foreground">
                    {groups.length} {groups.length === 1 ? "day" : "days"}, the last video goes public{" "}
                    {fullFmt.format(lastSlot)}.
                  </p>
                )}
              </section>
            )}
          </fieldset>

          <div className="space-y-2 border-t bg-background p-5">
            {uploading && (
              <p className="text-xs text-muted-foreground tabular-nums">
                Video {done + 1} of {videos.length}. Keep the app open until it finishes.
              </p>
            )}
            <Button size="lg" className="h-10 w-full" onClick={uploadAll} disabled={uploading || blockers.length > 0}>
              {uploading ? "Uploading…" : `${action} ${count}`}
            </Button>
            {!uploading && blockers.map((b) => (
              <p key={b} className="text-xs text-muted-foreground">{b}</p>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto">
          {episodes.length !== videos.length && rows > 0 && (
            <p className="flex items-center gap-2 border-b bg-amber-500/10 px-5 py-2 text-sm text-amber-800 dark:text-amber-300">
              <TriangleAlert className="size-4 shrink-0" />
              {episodes.length} {episodes.length === 1 ? "episode" : "episodes"} but {videos.length}{" "}
              {videos.length === 1 ? "video" : "videos"} in this folder.
            </p>
          )}
          {rows === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="font-medium">Nothing here yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Put your videos in this folder and paste the episode titles and descriptions on the left.
              </p>
            </div>
          ) : (
            groups.map((group, g) => (
              <section key={g} aria-label={scheduling ? `Day ${g + 1}` : "Upload order"}>
                <h2 className="sticky top-0 z-10 flex items-baseline justify-between border-b bg-background/95 px-5 py-2 backdrop-blur">
                  <span className="font-semibold">
                    {scheduling ? (slots[group[0]] ? dayFmt.format(slots[group[0]]!) : `Day ${g + 1}`) : "Upload order"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {group.length} {group.length === 1 ? "video" : "videos"}
                  </span>
                </h2>
                <ol className="divide-y border-b">
                  {group.map((i) => {
                    const video = videos[i];
                    return (
                        <VideoRow
                          key={i}
                          ep={episodes[i]}
                          video={video}
                          slot={scheduling ? slots[i] : null}
                          scheduling={scheduling}
                          done={video && uploaded[video.name]}
                          progress={progress && video?.name === progress.name ? progress.pct : null}
                          dims={video && dims[video.name]}
                          locked={locked(i)}
                          canUp={!locked(i) && i > 0 && !locked(i - 1)}
                          canDown={!locked(i) && i < videos.length - 1 && !locked(i + 1)}
                          dropTarget={dropTarget === i}
                          onUp={() => swap(i, i - 1)}
                          onDown={() => swap(i, i + 1)}
                          onDragStart={() => (dragFrom.current = i)}
                          onDragEnd={() => {
                            dragFrom.current = null;
                            setDropTarget(null);
                          }}
                          onDragOver={() => {
                            if (dragFrom.current === null || locked(i)) return false;
                            setDropTarget(i);
                            return true;
                          }}
                          onDragLeave={() => setDropTarget((t) => (t === i ? null : t))}
                          onDrop={() => {
                            if (dragFrom.current !== null) swap(dragFrom.current, i);
                            dragFrom.current = null;
                            setDropTarget(null);
                          }}
                          onDims={(d) => video && setDims((all) => ({ ...all, [video.name]: d }))}
                        />
                    );
                  })}
                </ol>
              </section>
            ))
          )}
        </main>
      </div>
    </div>
  );
}

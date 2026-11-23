export type Episode = {
  ep: number;
  title: string;
  description: string;
  problems: string[];
};

export type Format = "standard" | "loose" | "json" | "csv";
export type Parsed = { format: Format; episodes: Episode[]; error?: string };

// YouTube limits; the API also rejects "<" and ">" in titles and descriptions.
const TITLE_MAX = 100;
const DESC_MAX = 5000;

type Raw = { ep: number; title: string; description: string; problems?: string[] };

/** Detects the format from the text itself and parses it. */
export function parseMetadata(text: string): Parsed {
  const t = text.replace(/\r\n?/g, "\n").trim();
  if (!t) return { format: "loose", episodes: [] };
  try {
    if (t.startsWith("[") || t.startsWith("{")) return finish("json", parseJson(t));
    if (t.startsWith("---")) return finish("standard", parseStandard(t));
    if (isCsvHeader(t.split("\n")[0])) return finish("csv", parseCsv(t));
    return finish("loose", parseLoose(t));
  } catch (e) {
    const format: Format = t.startsWith("[") || t.startsWith("{") ? "json" : "csv";
    return { format, episodes: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Writes episodes in the standard format. */
export function toStandard(episodes: Episode[]): string {
  return episodes
    .map((e) => `---\nep: ${e.ep}\ntitle: ${e.title}\n---\n${e.description}\n`)
    .join("\n");
}

function finish(format: Format, raw: Raw[]): Parsed {
  const episodes = raw
    .map(({ ep, title, description, problems = [] }) => {
      title = title.trim();
      description = description.trim();
      const p = [...problems];
      if (!title) p.push("Title is empty");
      if (title.length > TITLE_MAX) p.push(`Title is ${title.length}/${TITLE_MAX} characters`);
      if (description.length > DESC_MAX) p.push(`Description is ${description.length}/${DESC_MAX} characters`);
      if (/[<>]/.test(title + description)) p.push("YouTube does not allow < or >");
      return { ep, title, description, problems: p };
    })
    .sort((a, b) => a.ep - b.ep);
  for (let i = 1; i < episodes.length; i++) {
    if (episodes[i].ep === episodes[i - 1].ep) episodes[i].problems.push(`Episode ${episodes[i].ep} appears twice`);
  }
  return { format, episodes };
}

/**
 * Ep 1
 * <title>
 * ===
 * <description...>
 * "Ep"/"ep"/"Episode", any number of "=" (3+), blank lines anywhere.
 */
function parseLoose(text: string): Raw[] {
  // split() with a capture group gives [before, num, body, num, body, ...]
  const parts = text.split(/^[ \t]*ep(?:isode)?[ \t]*(\d+)[ \t]*$/gim);
  const out: Raw[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const lines = parts[i + 1].split("\n");
    const sep = lines.findIndex((l) => /^\s*={3,}\s*$/.test(l));
    const head = (sep === -1 ? lines : lines.slice(0, sep)).filter((l) => l.trim());
    const title = head[0] ?? "";
    const description = sep === -1 ? head.slice(1).join("\n") : lines.slice(sep + 1).join("\n");
    const problems = sep === -1 && title.trim() ? ['No "===" line between title and description'] : [];
    out.push({ ep: Number(parts[i]), title, description, problems });
  }
  return out;
}

/**
 * ---
 * ep: 1
 * title: <title>
 * ---
 * <description...>
 * A block header is "---", then only "key: value" lines, then "---".
 */
function parseStandard(text: string): Raw[] {
  const lines = text.split("\n");
  const isKey = (l: string) => /^\s*[\w-]+\s*:/.test(l);
  // index of the closing "---" if a header starts at i, else -1
  const headerEnd = (i: number) => {
    if (lines[i]?.trim() !== "---") return -1;
    let j = i + 1;
    while (j < lines.length && isKey(lines[j])) j++;
    return j > i + 1 && lines[j]?.trim() === "---" ? j : -1;
  };

  const out: Raw[] = [];
  let i = 0;
  while (i < lines.length) {
    const end = headerEnd(i);
    if (end === -1) {
      i++;
      continue;
    }
    const fields: Record<string, string> = {};
    for (const l of lines.slice(i + 1, end)) {
      const k = l.indexOf(":");
      fields[l.slice(0, k).trim().toLowerCase()] = l.slice(k + 1).trim();
    }
    let next = end + 1;
    while (next < lines.length && headerEnd(next) === -1) next++;
    const n = Number(fields.ep ?? fields.episode);
    out.push({
      ep: Number.isFinite(n) && n > 0 ? n : out.length + 1,
      title: fields.title ?? "",
      description: lines.slice(end + 1, next).join("\n"),
      problems: fields.ep || fields.episode ? [] : ['Missing "ep:" line, numbered by position'],
    });
    i = next;
  }
  return out;
}

/** [{ "ep": 1, "title": "...", "description": "..." }] or { "episodes": [...] } */
function parseJson(text: string): Raw[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Not valid JSON: ${e instanceof Error ? e.message : e}`);
  }
  const list = Array.isArray(data) ? data : (data as { episodes?: unknown }).episodes;
  if (!Array.isArray(list)) throw new Error('JSON must be a list of episodes, or { "episodes": [...] }');
  return list.map((item, i) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const n = Number(o.ep ?? o.episode);
    return {
      ep: Number.isFinite(n) && n > 0 ? n : i + 1,
      title: String(o.title ?? ""),
      description: String(o.description ?? ""),
    };
  });
}

/** Header row with ep (or episode), title, description. Quoted fields may span lines. */
function parseCsv(text: string): Raw[] {
  const rows = csvRows(text);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const [ep, title, desc] = [col("ep", "episode"), col("title"), col("description", "desc")];
  if (title === -1) throw new Error('CSV needs a "title" column in the first row');
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r, i) => {
      const n = Number(r[ep]);
      return {
        ep: ep !== -1 && Number.isFinite(n) && n > 0 ? n : i + 1,
        title: r[title] ?? "",
        description: desc === -1 ? "" : (r[desc] ?? ""),
      };
    });
}

function isCsvHeader(line: string) {
  return line.split(/[,;]/).length > 1 && line.split(/[,;]/).some((c) => c.trim().replace(/"/g, "").toLowerCase() === "title");
}

function csvRows(text: string): string[][] {
  // Spreadsheets in some locales export with ";" instead of ","
  const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [[]];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) rows[rows.length - 1].push(cell), (cell = "");
    else if (c === "\n") rows[rows.length - 1].push(cell), (cell = ""), rows.push([]);
    else cell += c;
  }
  if (quoted) throw new Error("CSV has a quote that is never closed");
  rows[rows.length - 1].push(cell);
  return rows;
}

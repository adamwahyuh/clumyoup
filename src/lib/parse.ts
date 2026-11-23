export type Episode = {
  ep: number;
  title: string;
  description: string;
  problems: string[];
};

// YouTube limits; the API also rejects "<" and ">" in titles and descriptions.
const TITLE_MAX = 100;
const DESC_MAX = 5000;

/**
 * Parses blocks like:
 *   Ep 1
 *   <title>
 *   ===
 *   <description...>
 * "Ep"/"ep"/"Episode", any number of "=" (3+), blank lines anywhere.
 */
export function parseMetadata(text: string): Episode[] {
  // split() with a capture group gives [before, num, body, num, body, ...]
  const parts = text.replace(/\r\n?/g, "\n").split(/^[ \t]*ep(?:isode)?[ \t]*(\d+)[ \t]*$/gim);
  const episodes: Episode[] = [];

  for (let i = 1; i < parts.length; i += 2) {
    const lines = parts[i + 1].split("\n");
    const sep = lines.findIndex((l) => /^\s*={3,}\s*$/.test(l));
    const head = (sep === -1 ? lines : lines.slice(0, sep)).filter((l) => l.trim());
    const title = (head[0] ?? "").trim();
    const description = (
      sep === -1 ? head.slice(1).join("\n") : lines.slice(sep + 1).join("\n")
    ).trim();

    const problems: string[] = [];
    if (!title) problems.push("Title is empty");
    if (title.length > TITLE_MAX) problems.push(`Title is ${title.length}/${TITLE_MAX} characters`);
    if (description.length > DESC_MAX) problems.push(`Description is ${description.length}/${DESC_MAX} characters`);
    if (/[<>]/.test(title + description)) problems.push("YouTube does not allow < or >");
    if (sep === -1 && title) problems.push('No "===" line between title and description');

    episodes.push({ ep: Number(parts[i]), title, description, problems });
  }

  episodes.sort((a, b) => a.ep - b.ep);
  for (let i = 1; i < episodes.length; i++) {
    if (episodes[i].ep === episodes[i - 1].ep) episodes[i].problems.push(`Ep ${episodes[i].ep} appears twice`);
  }
  return episodes;
}

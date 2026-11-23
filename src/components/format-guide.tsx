import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Format } from "@/lib/parse";

export const FORMAT_NAMES: Record<Format, string> = {
  standard: "Standard",
  loose: "Ep / ===",
  json: "JSON",
  csv: "CSV",
};

const GUIDE: Record<Format, { when: string; example: string }> = {
  standard: {
    when: "Recommended. Every episode starts with a small header, so nothing is guessed. The description is everything until the next header.",
    example: `---
ep: 1
title: The Sun Rose Twice… And Nobody Noticed | The Last Timeline Ep 1
---
The sun rose twice this morning. Nobody even looked up.

#TheLastTimeline #Shorts

---
ep: 2
title: He Caught It Before It Even Fell… | The Last Timeline Ep 2
---
Elias gets a new partner. Funny. Friendly. Way too fast.
`,
  },
  loose: {
    when: '"Ep" and a number on its own line, the title on the next line, a line of "===", then the description. Blank lines are fine.',
    example: `Ep 1
The Sun Rose Twice… And Nobody Noticed | The Last Timeline Ep 1
===
The sun rose twice this morning. Nobody even looked up.

#TheLastTimeline #Shorts

Ep 2
He Caught It Before It Even Fell… | The Last Timeline Ep 2
===
Elias gets a new partner. Funny. Friendly. Way too fast.
`,
  },
  json: {
    when: "For titles written by a script or an AI tool. A list of episodes, or an object with an \"episodes\" list. Use \\n for new lines.",
    example: `[
  {
    "ep": 1,
    "title": "The Sun Rose Twice… And Nobody Noticed | The Last Timeline Ep 1",
    "description": "The sun rose twice this morning. Nobody even looked up.\\n\\n#TheLastTimeline #Shorts"
  },
  {
    "ep": 2,
    "title": "He Caught It Before It Even Fell… | The Last Timeline Ep 2",
    "description": "Elias gets a new partner. Funny. Friendly. Way too fast."
  }
]
`,
  },
  csv: {
    when: "For a sheet in Google Sheets or Excel: columns ep, title, description. Save or copy as CSV; quoted cells can hold several lines.",
    example: `ep,title,description
1,"The Sun Rose Twice… And Nobody Noticed | The Last Timeline Ep 1","The sun rose twice this morning. Nobody even looked up.

#TheLastTimeline #Shorts"
2,"He Caught It Before It Even Fell… | The Last Timeline Ep 2","Elias gets a new partner. Funny. Friendly. Way too fast."
`,
  },
};

export function FormatGuide({ current }: { current: Format }) {
  const [tab, setTab] = useState<Format>("standard");
  const [copied, setCopied] = useState(false);

  return (
    <Dialog onOpenChange={(o) => o && (setTab(current), setCopied(false))}>
      <DialogTrigger asChild>
        <Button variant="link" size="xs" className="h-auto px-0 text-xs">Formats</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogTitle className="text-base font-semibold">Episode formats</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          Paste or load any of these. Clumyoup recognizes the format by itself.
        </DialogDescription>

        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={tab}
          onValueChange={(v) => v && (setTab(v as Format), setCopied(false))}
          aria-label="Format"
          className="mt-4 w-full"
        >
          {(Object.keys(GUIDE) as Format[]).map((f) => (
            <ToggleGroupItem
              key={f}
              value={f}
              className="flex-1 text-muted-foreground data-[state=on]:bg-muted data-[state=on]:font-semibold data-[state=on]:text-foreground"
            >
              {FORMAT_NAMES[f]}
              {f === current && <span className="sr-only"> (current)</span>}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <p className="mt-3 text-sm text-muted-foreground">{GUIDE[tab].when}</p>
        <div className="relative mt-3">
          <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {GUIDE[tab].example}
          </pre>
          <Button
            variant="outline"
            size="sm"
            className="absolute top-2 right-2 bg-background"
            onClick={async () => {
              await navigator.clipboard.writeText(GUIDE[tab].example);
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy example"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useLayoutEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ITEM = 44; // px per row; the wheel shows 5 rows with the chosen one in the middle
const pad = (n: number) => String(n).padStart(2, "0");

function Wheel({ count, value, onChange, label }: {
  count: number;
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // The dialog mounts the wheel on open, so this lands on the current value without animating.
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = value * ITEM;
  }, []);

  const go = (v: number) =>
    ref.current?.scrollTo({ top: Math.min(count - 1, Math.max(0, v)) * ITEM, behavior: "smooth" });

  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${label}-${value}`}
      onScroll={(e) => {
        const v = Math.min(count - 1, Math.max(0, Math.round(e.currentTarget.scrollTop / ITEM)));
        if (v !== value) onChange(v);
      }}
      onKeyDown={(e) => {
        const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
        if (step) go(value + step);
        else if (e.key === "Home") go(0);
        else if (e.key === "End") go(count - 1);
        else return;
        e.preventDefault();
      }}
      style={{ height: ITEM * 5, paddingBlock: ITEM * 2 }}
      className="relative z-10 w-20 snap-y snap-mandatory overflow-y-scroll rounded-lg outline-none [mask-image:linear-gradient(to_bottom,transparent,#000_35%,#000_65%,transparent)] [scrollbar-width:none] focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-scrollbar]:hidden"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          id={`${label}-${i}`}
          role="option"
          aria-selected={i === value}
          onClick={() => go(i)}
          style={{ height: ITEM }}
          className={cn(
            "flex cursor-pointer snap-center items-center justify-center text-2xl tabular-nums transition-colors",
            i === value ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {pad(i)}
        </div>
      ))}
    </div>
  );
}

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function TimePicker({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [h, m] = /^\d{1,2}:\d{2}$/.test(value) ? value.split(":").map(Number) : [9, 0];
  const [draft, setDraft] = useState({ h, m });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft({ h, m });
        setOpen(o);
      }}
    >
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <DialogTrigger asChild>
          <Button variant="outline" className="h-10 w-full justify-start gap-2 bg-background px-3 text-base font-medium tabular-nums">
            <Clock className="text-muted-foreground" />
            {pad(h)}:{pad(m)}
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="max-w-xs">
        <DialogTitle className="text-base font-semibold">{label}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          Scroll or use the arrow keys. 24-hour time, your computer's time zone.
        </DialogDescription>

        <div className="relative my-5 flex items-center justify-center gap-1">
          <div aria-hidden className="pointer-events-none absolute inset-x-6 top-1/2 h-11 -translate-y-1/2 rounded-xl bg-muted" />
          <Wheel count={24} value={draft.h} onChange={(v) => setDraft((d) => ({ ...d, h: v }))} label="Hour" />
          <span aria-hidden className="relative z-10 pb-1 text-2xl font-semibold">:</span>
          <Wheel count={60} value={draft.m} onChange={(v) => setDraft((d) => ({ ...d, m: v }))} label="Minute" />
        </div>

        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => {
              onChange(`${pad(draft.h)}:${pad(draft.m)}`);
              setOpen(false);
            }}
          >
            Set {pad(draft.h)}:{pad(draft.m)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

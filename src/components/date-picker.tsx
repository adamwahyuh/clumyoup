import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, fromDateString, monthGrid, startOfToday, toDateString } from "@/lib/calendar";
import { cn } from "@/lib/utils";

const monthFmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const triggerFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
// 5 Jan 2026 is a Monday
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(2026, 0, 5 + i)));

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** How many publish days the schedule covers, highlighted from the chosen day */
  days: number;
};

export function DatePicker({ id, value, onChange, days }: Props) {
  const selected = fromDateString(value);
  const today = startOfToday();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected ?? today);
  const grid = monthGrid(view.getFullYear(), view.getMonth());
  const last = selected && addDays(selected, Math.max(days, 1) - 1);
  const atCurrentMonth = view.getFullYear() === today.getFullYear() && view.getMonth() === today.getMonth();

  function pick(d: Date) {
    onChange(toDateString(d));
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setView(selected ?? today);
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" className="h-10 w-full justify-start gap-2 bg-background px-3 font-normal">
          <CalendarDays className="text-muted-foreground" />
          {selected ? triggerFmt.format(selected) : <span className="text-muted-foreground">Pick a day</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[296px]">
        <div className="mb-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            disabled={atCurrentMonth}
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
          >
            <ChevronLeft />
          </Button>
          <p className="font-medium" aria-live="polite">{monthFmt.format(view)}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
          >
            <ChevronRight />
          </Button>
        </div>

        <div role="grid" className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAYS.map((w, i) => (
            <span key={i} role="columnheader" className="pb-1 text-xs text-muted-foreground">{w}</span>
          ))}
          {grid.map((d) => {
            const t = d.getTime();
            const isSelected = selected?.getTime() === t;
            const inRange = !!selected && !!last && t > selected.getTime() && t <= last.getTime();
            const isToday = t === today.getTime();
            const outside = d.getMonth() !== view.getMonth();
            return (
              <button
                key={t}
                type="button"
                disabled={t < today.getTime()}
                aria-label={dayFmt.format(d)}
                aria-pressed={isSelected}
                onClick={() => pick(d)}
                className={cn(
                  "relative mx-auto flex size-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:text-muted-foreground/40",
                  outside && "text-muted-foreground",
                  inRange && "bg-primary/15 text-foreground hover:bg-primary/25",
                  isSelected && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                )}
              >
                {d.getDate()}
                {isToday && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute bottom-1 size-1 rounded-full",
                      isSelected ? "bg-primary-foreground" : "bg-primary",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {days > 1 && selected ? `Shaded: the ${days} publish days` : "Dot: today"}
          </p>
          <Button variant="ghost" size="sm" onClick={() => pick(addDays(today, 1))}>Tomorrow</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

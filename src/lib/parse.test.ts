import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetadata } from "./parse.ts";
import { scheduleSlots } from "./schedule.ts";
import { monthGrid } from "./calendar.ts";

const sample = `Ep 1

The Sun Rose Twice | The Last Timeline Ep 1
===
The sun rose twice.

#Shorts


ep 5
He Remembers 40 Lives
====
Line one
Line two

Ep 2
He Caught It
===
Desc 2

Ep 10
`;

test("parses blocks with mixed case, extra '=' and blank lines", () => {
  const eps = parseMetadata(sample);
  assert.deepEqual(eps.map((e) => e.ep), [1, 2, 5, 10]);
  assert.equal(eps[0].title, "The Sun Rose Twice | The Last Timeline Ep 1");
  assert.equal(eps[0].description, "The sun rose twice.\n\n#Shorts");
  assert.equal(eps[2].description, "Line one\nLine two");
  assert.deepEqual(eps[0].problems, []);
  assert.deepEqual(eps[3].problems, ["Title is empty"]);
});

test("'Ep 1' inside a title does not start a new block", () => {
  assert.equal(parseMetadata(sample).length, 4);
});

test("flags YouTube limits and duplicates", () => {
  const eps = parseMetadata(`Ep 1\n${"x".repeat(101)}\n===\na <b>\nEp 1\nT\n===\nd`);
  assert.match(eps[0].problems.join(), /101\/100/);
  assert.match(eps[0].problems.join(), /< or >/);
  assert.match(eps[1].problems.join(), /twice/);
});

test("schedule: 2 per day over 5 days, crossing month end", () => {
  const s = scheduleSlots(5, "2026-11-30", ["03:00", "21:00"]);
  assert.deepEqual(
    s.map((d) => d && [d.getMonth() + 1, d.getDate(), d.getHours()]),
    [[11, 30, 3], [11, 30, 21], [12, 1, 3], [12, 1, 21], [12, 2, 3]],
  );
  assert.equal(scheduleSlots(1, "", ["03:00"])[0], null);
  assert.equal(scheduleSlots(1, "2026-12-01", [""])[0], null);
});

test("month grid starts on Monday and covers the month", () => {
  // December 2026 starts on a Tuesday
  const g = monthGrid(2026, 11);
  assert.equal(g.length, 42);
  assert.deepEqual([g[0].getMonth(), g[0].getDate(), g[0].getDay()], [10, 30, 1]);
  assert.deepEqual([g[1].getMonth(), g[1].getDate()], [11, 1]);
  assert.ok(g.some((d) => d.getMonth() === 11 && d.getDate() === 31));
});

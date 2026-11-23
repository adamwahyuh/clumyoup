import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetadata, toStandard } from "./parse.ts";
import { scheduleSlots } from "./schedule.ts";
import { monthGrid } from "./calendar.ts";

const loose = `Ep 1

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

const summary = (text: string) => {
  const p = parseMetadata(text);
  return { format: p.format, error: p.error, eps: p.episodes.map((e) => [e.ep, e.title, e.description]) };
};

test("loose: mixed case, extra '=' and blank lines", () => {
  const p = parseMetadata(loose);
  assert.equal(p.format, "loose");
  assert.deepEqual(p.episodes.map((e) => e.ep), [1, 2, 5, 10]);
  assert.equal(p.episodes[0].title, "The Sun Rose Twice | The Last Timeline Ep 1");
  assert.equal(p.episodes[0].description, "The sun rose twice.\n\n#Shorts");
  assert.equal(p.episodes[2].description, "Line one\nLine two");
  assert.deepEqual(p.episodes[0].problems, []);
  assert.deepEqual(p.episodes[3].problems, ["Title is empty"]);
});

test("standard: header blocks, '---' inside a description stays text", () => {
  const s = summary(`---
ep: 2
title: Second: with a colon
---
Line one
---
not a header

---
episode: 1
title: First
---
Desc 1
`);
  assert.equal(s.format, "standard");
  assert.deepEqual(s.eps, [
    [1, "First", "Desc 1"],
    [2, "Second: with a colon", "Line one\n---\nnot a header"],
  ]);
});

test("loose converts to standard and back without loss", () => {
  const before = parseMetadata(loose).episodes.filter((e) => e.title);
  const after = parseMetadata(toStandard(before));
  assert.equal(after.format, "standard");
  assert.deepEqual(after.episodes.map((e) => [e.ep, e.title, e.description]), before.map((e) => [e.ep, e.title, e.description]));
});

test("json: list or { episodes }, missing ep numbered by position", () => {
  assert.deepEqual(summary(`[{"title":"A"},{"ep":2,"title":"B","description":"d"}]`).eps, [[1, "A", ""], [2, "B", "d"]]);
  assert.deepEqual(summary(`{"episodes":[{"episode":"3","title":"C"}]}`).eps, [[3, "C", ""]]);
  assert.match(summary(`[{"title":}]`).error!, /Not valid JSON/);
  assert.match(summary(`{"x":1}`).error!, /list of episodes/);
});

test("csv: quoted multi-line cells, escaped quotes, semicolons", () => {
  const s = summary(`ep,title,description\n1,"Hi, there","Line ""one""\nLine two"\n\n2,Bye,x\n`);
  assert.equal(s.format, "csv");
  assert.deepEqual(s.eps, [[1, "Hi, there", 'Line "one"\nLine two'], [2, "Bye", "x"]]);
  assert.deepEqual(summary(`Episode;Title;Description\n1;A;d`).eps, [[1, "A", "d"]]);
  assert.match(summary(`title,description\n"open`).error!, /never closed/);
});

test("a loose title containing 'title' and a comma is not CSV", () => {
  assert.equal(parseMetadata("The title, revealed\n===\nx").format, "loose");
});

test("flags YouTube limits and duplicates", () => {
  const eps = parseMetadata(`Ep 1\n${"x".repeat(101)}\n===\na <b>\nEp 1\nT\n===\nd`).episodes;
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

/**
 * Publish time for each video: `times.length` videos per day starting at `start` (YYYY-MM-DD),
 * video i goes to day floor(i / perDay) at times[i % perDay]. Uses the computer's local time zone.
 */
export function scheduleSlots(count: number, start: string, times: string[]): (Date | null)[] {
  const [y, m, d] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const time = /^(\d{1,2}):(\d{2})$/.exec(times[i % times.length] ?? "");
    if (!y || !m || !d || !time) return null;
    return new Date(y, m - 1, d + Math.floor(i / times.length), +time[1], +time[2]);
  });
}

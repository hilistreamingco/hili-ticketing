// Kenya has no daylight saving, so Nairobi is always UTC+3. The admin screen
// enters and shows all sales dates in Nairobi time, whatever the browser's own
// time zone is, so a closing time of "18:00" always means 18:00 in Nairobi.

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

/** ISO timestamp -> value for an <input type="datetime-local"> in Nairobi time. */
export function isoToNairobiInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 16);
}

/** Value from an <input type="datetime-local"> (Nairobi time) -> ISO timestamp, or null when empty. */
export function nairobiInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const d = new Date(`${withSeconds}+03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "6 Oct, 18:00" in Nairobi time. */
export function formatNairobi(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

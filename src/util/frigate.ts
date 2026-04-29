/**
 * Frigate-specific source helpers.
 *
 * Source-aware enrichment for items produced by the Frigate integration.
 * This is NOT generic auto-detection — every helper here is gated on a
 * documented Frigate contract (event-id format, media-source URI shape).
 */

/**
 * Sanity range used when interpreting a numeric run as a Unix epoch:
 * 2000-01-01 (946684800) .. 2100-01-01 (4102444800). Anything outside
 * this is rejected as a regex false-positive.
 */
const MIN_REASONABLE_EPOCH_SEC = 946684800;
const MAX_REASONABLE_EPOCH_SEC = 4102444800;

/**
 * Extract the start-time epoch (ms) from a Frigate-shaped URI/URL.
 *
 * Frigate event IDs are `<unix_epoch_with_microseconds>-<random>`, e.g.
 *   "1741975616.16659-zgolc3"
 * which appears in both REST URLs (`.../api/events/<id>/clip.mp4`) and
 * media-source URIs (`media-source://frigate/<inst>/event/clips/<cam>/<id>`).
 *
 * Returns null when no Frigate-shaped event id is present, or when the
 * epoch is outside the sanity range.
 */
export function frigateEventIdMs(src: string): number | null {
  const m = String(src ?? "").match(
    /(?:^|[/_.-])(\d{9,11}(?:\.\d+)?)-[a-z0-9]+(?:\.[a-z0-9]+)?(?:[/?#]|$)/i
  );
  if (!m?.[1]) return null;
  const sec = Number.parseFloat(m[1]);
  if (!Number.isFinite(sec)) return null;
  if (sec < MIN_REASONABLE_EPOCH_SEC || sec > MAX_REASONABLE_EPOCH_SEC) return null;
  return sec * 1000;
}

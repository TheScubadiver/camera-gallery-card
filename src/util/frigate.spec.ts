import { describe, expect, it } from "vitest";

import { frigateEventIdMs } from "./frigate";

// Real-world example pulled from Frigate's API docs / issue tracker.
const EVENT_ID_EPOCH_SEC = 1741975616.16659;
const EVENT_ID = `${EVENT_ID_EPOCH_SEC}-zgolc3`;

describe("frigateEventIdMs", () => {
  it("extracts epoch ms from a Frigate REST clip URL", () => {
    const url = `http://frigate.local:5000/api/events/${EVENT_ID}/clip.mp4`;
    expect(frigateEventIdMs(url)).toBe(EVENT_ID_EPOCH_SEC * 1000);
  });

  it("extracts epoch ms from a Frigate REST snapshot URL", () => {
    const url = `http://frigate.local:5000/api/events/${EVENT_ID}/thumbnail.jpg`;
    expect(frigateEventIdMs(url)).toBe(EVENT_ID_EPOCH_SEC * 1000);
  });

  it("extracts epoch ms from a Frigate media-source URI", () => {
    const uri = `media-source://frigate/frigate/event/clips/driveway/${EVENT_ID}`;
    expect(frigateEventIdMs(uri)).toBe(EVENT_ID_EPOCH_SEC * 1000);
  });

  it("handles event ids with shorter random suffixes (single char)", () => {
    const epoch = 1751565549.853251;
    expect(frigateEventIdMs(`/api/events/${epoch}-b/clip.mp4`)).toBe(epoch * 1000);
  });

  it("returns null on a URL with a 10-digit run that is NOT followed by a dash-suffix", () => {
    expect(frigateEventIdMs("http://example.com/api/sensors/1741975616/data.json")).toBeNull();
  });

  it("returns null on a non-Frigate URL", () => {
    expect(frigateEventIdMs("https://example.com/some/random/path.mp4")).toBeNull();
  });

  it("returns null on out-of-range epoch (below 2000-01-01)", () => {
    // 800000000 = 1995, below MIN_REASONABLE_EPOCH_SEC
    expect(frigateEventIdMs("/api/events/800000000-abc/clip.mp4")).toBeNull();
  });

  it("returns null on out-of-range epoch (after 2100-01-01)", () => {
    // 5000000000 ≈ year 2128
    expect(frigateEventIdMs("/api/events/5000000000-abc/clip.mp4")).toBeNull();
  });

  it("returns null on too-many-digit numeric runs (12+)", () => {
    expect(frigateEventIdMs("/api/events/123456789012-abc/clip.mp4")).toBeNull();
  });

  it("returns null on empty / nullish input", () => {
    expect(frigateEventIdMs("")).toBeNull();
    expect(frigateEventIdMs(undefined as unknown as string)).toBeNull();
    expect(frigateEventIdMs(null as unknown as string)).toBeNull();
  });
});

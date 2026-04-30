import { describe, expect, it } from "vitest";

import {
  buildFilenameDateRegex,
  dayKeyFromMs,
  dtKeyFromMs,
  dtMsFromSrc,
  extractDateTimeKey,
  extractDayKey,
  parseDateFromFilename,
  parseFolderFileDatetime,
  parseRawDateFields,
  uniqueDays,
} from "./datetime-parsing";
import type { DatetimeOptions } from "./datetime-parsing";

const identity = (s: string): string => s;

const opts = (overrides: Partial<DatetimeOptions> = {}): DatetimeOptions => ({
  resolveName: identity,
  ...overrides,
});

describe("Null contract — no formats configured means no date", () => {
  it("dtMsFromSrc returns null when neither format is configured", () => {
    expect(dtMsFromSrc("camera_2024-01-15_12-30-45.jpg", opts())).toBeNull();
  });

  it("extractDayKey returns null when neither format is configured", () => {
    expect(extractDayKey("20240115_123045.jpg", opts())).toBeNull();
  });

  it("extractDateTimeKey returns null when neither format is configured", () => {
    expect(extractDateTimeKey("some_1700000000_file.jpg", opts())).toBeNull();
  });
});

describe("Date overflow rejected (Feb 31 → null)", () => {
  it("parseFolderFileDatetime rejects Feb 31", () => {
    const result = parseFolderFileDatetime("camera/2024-02-31/file.jpg", {
      folderFormat: "YYYY-MM-DD",
    });
    expect(result).toBeNull();
  });

  it("parseDateFromFilename rejects Feb 31", () => {
    const result = parseDateFromFilename(
      "camera-20240231-event.jpg",
      opts({ filenameFormat: "YYYYMMDD" })
    );
    expect(result).toBeNull();
  });

  it("parseFolderFileDatetime accepts a real Feb 29 in a leap year", () => {
    const result = parseFolderFileDatetime("camera/2024-02-29/file.jpg", {
      folderFormat: "YYYY-MM-DD",
    });
    expect(result).not.toBeNull();
    expect(result?.dayKey).toBe("2024-02-29");
  });

  it("parseFolderFileDatetime rejects Feb 29 in a non-leap year", () => {
    const result = parseFolderFileDatetime("camera/2023-02-29/file.jpg", {
      folderFormat: "YYYY-MM-DD",
    });
    expect(result).toBeNull();
  });
});

describe("Bounds-checked regex match access", () => {
  it("parseRawDateFields returns null on no-match", () => {
    expect(parseRawDateFields("garbage", "YYYY-MM-DD")).toBeNull();
  });

  it("parseRawDateFields returns partial fields when format is partial", () => {
    const result = parseRawDateFields("2024-01-15", "YYYY-MM-DD");
    expect(result).toEqual({ year: 2024, month: 1, day: 15 });
  });

  it("parseRawDateFields returns null on empty inputs", () => {
    expect(parseRawDateFields("", "YYYY-MM-DD")).toBeNull();
    expect(parseRawDateFields("2024-01-15", "")).toBeNull();
  });

  it("buildFilenameDateRegex returns null on format with no tokens", () => {
    expect(buildFilenameDateRegex("just-a-string")).toBeNull();
    expect(buildFilenameDateRegex("")).toBeNull();
  });

  it("buildFilenameDateRegex compiles a known format", () => {
    const built = buildFilenameDateRegex("YYYY-MM-DD_HH:mm:ss");
    expect(built).not.toBeNull();
    expect(built?.fields).toEqual(["year", "month", "day", "hour", "minute", "second"]);
    expect(built?.regex.test("2024-01-15_12:30:45")).toBe(true);
  });
});

describe("Local-time round-trip invariant", () => {
  it("round-trip ms → dtKey → ms returns the same instant", () => {
    const ms = new Date(2024, 0, 15, 12, 30, 45).getTime();
    const dtKey = dtKeyFromMs(ms);
    expect(dtKey).not.toBeNull();
    const back = new Date(dtKey ?? "").getTime();
    expect(back).toBe(ms);
  });

  it("round-trip ms → dayKey → start-of-day ms aligns with local midnight", () => {
    const ms = new Date(2024, 0, 15, 12, 30, 45).getTime();
    const dk = dayKeyFromMs(ms);
    expect(dk).not.toBeNull();
    const startOfDay = new Date(`${dk}T00:00:00`).getTime();
    const expected = new Date(2024, 0, 15, 0, 0, 0).getTime();
    expect(startOfDay).toBe(expected);
  });

  it("dayKey is consistent across multiple ms within the same local day", () => {
    const morning = new Date(2024, 5, 1, 6, 0, 0).getTime();
    const evening = new Date(2024, 5, 1, 22, 0, 0).getTime();
    expect(dayKeyFromMs(morning)).toBe(dayKeyFromMs(evening));
  });

  it("dtKeyFromMs returns null on non-finite ms", () => {
    expect(dtKeyFromMs(NaN)).toBeNull();
    expect(dayKeyFromMs(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("Explicit folder format — parseFolderFileDatetime", () => {
  it("extracts date from folder path with YYYY-MM-DD format", () => {
    const r = parseFolderFileDatetime("camera/2024-01-15/clip.mp4", {
      folderFormat: "YYYY-MM-DD",
    });
    expect(r?.dayKey).toBe("2024-01-15");
  });

  it("combines folder date with filename time when filenameFormat is set", () => {
    const r = parseFolderFileDatetime("camera/2024-01-15/123045.mp4", {
      folderFormat: "YYYY-MM-DD",
      filenameFormat: "HHmmss",
    });
    expect(r?.dtKey).toBe("2024-01-15T12:30:45");
  });

  it("returns null when folder does not match folderFormat", () => {
    expect(
      parseFolderFileDatetime("camera/no-date-here/clip.mp4", { folderFormat: "YYYY-MM-DD" })
    ).toBeNull();
  });
});

describe("Explicit filename format — parseDateFromFilename", () => {
  it("extracts date+time from filename with YYYYMMDD_HHmmss format", () => {
    const r = parseDateFromFilename(
      "cam_20240115_123045.mp4",
      opts({ filenameFormat: "YYYYMMDD_HHmmss" })
    );
    expect(r?.dayKey).toBe("2024-01-15");
    expect(r?.dtKey).toBe("2024-01-15T12:30:45");
  });

  it("returns null when filename does not match filenameFormat", () => {
    expect(
      parseDateFromFilename("unrelated-name.jpg", opts({ filenameFormat: "YYYYMMDD" }))
    ).toBeNull();
  });

  it("returns null when filenameFormat is not configured", () => {
    expect(parseDateFromFilename("cam_20240115_123045.mp4", opts())).toBeNull();
  });
});

describe("End-to-end: extractDayKey / extractDateTimeKey", () => {
  it("extractDayKey uses folderFormat when configured", () => {
    expect(extractDayKey("cam/2024-01-15/clip.mp4", opts({ folderFormat: "YYYY-MM-DD" }))).toBe(
      "2024-01-15"
    );
  });

  it("extractDateTimeKey uses filenameFormat when configured", () => {
    expect(
      extractDateTimeKey("cam_20240115_123045.mp4", opts({ filenameFormat: "YYYYMMDD_HHmmss" }))
    ).toBe("2024-01-15T12:30:45");
  });

  it("extractDayKey returns null when no format is configured", () => {
    expect(extractDayKey("snapshot_20240115_evt.jpg", opts())).toBeNull();
  });

  it("folderFormat takes priority over filenameFormat for date", () => {
    const r = dtMsFromSrc(
      "media/2023-12-31/cam_20240115.jpg",
      opts({ folderFormat: "YYYY-MM-DD", filenameFormat: "YYYYMMDD" })
    );
    const expected = new Date(2023, 11, 31, 0, 0, 0).getTime();
    expect(r).toBe(expected);
  });
});

describe("uniqueDays", () => {
  it("returns distinct dayKeys sorted newest-first", () => {
    expect(
      uniqueDays([
        { dayKey: "2026-01-15" },
        { dayKey: "2026-01-17" },
        { dayKey: "2026-01-15" },
        { dayKey: "2025-12-31" },
      ])
    ).toEqual(["2026-01-17", "2026-01-15", "2025-12-31"]);
  });

  it("skips items without a dayKey", () => {
    expect(uniqueDays([{ dayKey: "2026-04-29" }, { dayKey: null }, { dayKey: "" }, {}])).toEqual([
      "2026-04-29",
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(uniqueDays([])).toEqual([]);
  });
});

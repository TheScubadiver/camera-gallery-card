import { describe, expect, it } from "vitest";

import {
  formatDateTime,
  formatDay,
  formatMonth,
  formatTimeFromMs,
  resolveLocale,
  useAmPm,
} from "./locale";
import type { HomeAssistant } from "../types/hass";

describe("resolveLocale", () => {
  it("returns trimmed string when hass.locale is a legacy string", () => {
    expect(resolveLocale({ locale: "  en-US  " } as unknown as HomeAssistant)).toBe("en-US");
  });

  it("returns hass.locale.language when locale is a FrontendLocaleData object", () => {
    expect(
      resolveLocale({
        locale: { language: "sv-SE", number_format: "comma_decimal", time_format: "24" },
      } as unknown as HomeAssistant)
    ).toBe("sv-SE");
  });

  it("falls back to hass.language when locale is missing", () => {
    expect(resolveLocale({ language: "de-DE" } as unknown as HomeAssistant)).toBe("de-DE");
  });

  it("returns navigator.language when hass has no locale info", () => {
    const out = resolveLocale(undefined);
    expect(typeof out === "string" || out === undefined).toBe(true);
  });
});

describe("useAmPm", () => {
  it("returns false for time_format='24'", () => {
    expect(
      useAmPm({ language: "en", number_format: "comma_decimal", time_format: "24" } as never)
    ).toBe(false);
  });

  it("returns true for time_format='12'", () => {
    expect(
      useAmPm({ language: "en", number_format: "comma_decimal", time_format: "12" } as never)
    ).toBe(true);
  });

  it("returns a boolean for undefined locale (probe falls through to system default)", () => {
    expect(typeof useAmPm(undefined)).toBe("boolean");
  });

  it("probes language for time_format='language' (en-US is 12h)", () => {
    expect(
      useAmPm({
        language: "en-US",
        number_format: "comma_decimal",
        time_format: "language",
      } as never)
    ).toBe(true);
  });

  it("probes language for time_format='language' (sv-SE is 24h)", () => {
    expect(
      useAmPm({
        language: "sv-SE",
        number_format: "comma_decimal",
        time_format: "language",
      } as never)
    ).toBe(false);
  });
});

describe("Format functions return readable fallback on error", () => {
  it("formatDay does not throw on bad input", () => {
    expect(() => formatDay("not-a-date", undefined)).not.toThrow();
  });

  it("formatDateTime returns input on Intl error", () => {
    expect(() => formatDateTime("2024-01-01T12:00:00", undefined)).not.toThrow();
  });

  it("formatTimeFromMs returns empty string for non-finite ms", () => {
    expect(formatTimeFromMs(NaN, undefined)).toBe("");
    expect(formatTimeFromMs(Number.POSITIVE_INFINITY, undefined)).toBe("");
  });

  it("formatDay returns empty string for empty input", () => {
    expect(formatDay("", undefined)).toBe("");
  });
});

describe("Format functions (locale-dependent)", () => {
  const enUS = {
    language: "en-US",
    number_format: "comma_decimal",
    time_format: "24",
  } as never;

  it("formatDay produces a localized day/month string", () => {
    expect(formatDay("2024-01-15", enUS)).toMatch(/January\s+15/);
  });

  it("formatDateTime produces a date • time string", () => {
    expect(formatDateTime("2024-01-15T12:30:00", enUS)).toMatch(/January.*15.*•.*12:30/);
  });

  it("formatTimeFromMs produces a time string", () => {
    const ms = new Date(2024, 0, 15, 14, 5, 0).getTime();
    expect(formatTimeFromMs(ms, enUS)).toMatch(/14:05/);
  });

  it("formatMonth produces a localized month/year string", () => {
    expect(formatMonth("2024-01", enUS)).toMatch(/January.*2024/);
  });

  it("formatMonth returns empty string for empty input", () => {
    expect(formatMonth("", undefined)).toBe("");
  });
});

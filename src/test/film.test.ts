import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, hash2, sanitizeSettings, formatStamp } from "@/lib/film";

describe("DISPO film defaults", () => {
  it("defaults to the Disposable 800 preset", () => {
    expect(DEFAULT_SETTINGS.preset).toBe("disposable800");
  });
  it("light leak is off by default", () => {
    expect(DEFAULT_SETTINGS.lightLeak).toBe(false);
  });
  it("grain is stable for the same seed", () => {
    expect(hash2(10, 20, 5)).toBe(hash2(10, 20, 5));
  });
  it("clamps stored settings to valid ranges", () => {
    const s = sanitizeSettings({ intensity: 500, exposure: -900, preset: "bogus" });
    expect(s.intensity).toBe(100);
    expect(s.exposure).toBe(-100);
    expect(s.preset).toBe("disposable800");
  });
  it("formats the date stamp 90s style", () => {
    expect(formatStamp(new Date(1998, 6, 14))).toBe("'98  7 14");
  });
});
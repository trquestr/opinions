import { describe, expect, it } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";
import { metadata } from "./layout";

describe("robots", () => {
  it("разрешает всё и указывает sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});

describe("sitemap", () => {
  it("содержит корень", () => {
    expect(sitemap().some((e) => e.url.endsWith("/"))).toBe(true);
  });
});

describe("metadata", () => {
  it("title, description и локаль OG", () => {
    expect((metadata.title as { default: string }).default).toBeTruthy();
    expect(metadata.description).toBeTruthy();
    expect((metadata.openGraph as { locale?: string }).locale).toBe("ru_RU");
  });
});

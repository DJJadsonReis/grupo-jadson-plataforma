import { describe, expect, it } from "vitest";
import { createLocalApiToken, isPostgresUrl } from "./first-run";

describe("first run setup helpers", () => {
  it("accepts PostgreSQL URLs and rejects other or incomplete URLs", () => {
    expect(isPostgresUrl("postgres://postgres@localhost:5432/grupo_jadson")).toBe(true);
    expect(isPostgresUrl("postgresql://localhost/database")).toBe(true);
    expect(isPostgresUrl("https://localhost/database")).toBe(false);
    expect(isPostgresUrl("postgres://localhost")).toBe(false);
    expect(isPostgresUrl("not a url")).toBe(false);
  });

  it("creates a 256-bit hex token using the system random source", () => {
    const token = createLocalApiToken((bytes) => { bytes.fill(0xab); return bytes; });
    expect(token).toBe("ab".repeat(32));
    expect(token).toHaveLength(64);
  });
});

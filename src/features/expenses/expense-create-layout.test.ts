import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./expense-create.module.css", import.meta.url), "utf8");

describe("expense create responsive layout", () => {
  it("uses the available content width for form breakpoints", () => {
    expect(styles).toMatch(/\.content\s*\{[\s\S]*container-type:\s*inline-size/);
    expect(styles).toMatch(/\.wizardMain\s*\{[\s\S]*container-type:\s*inline-size/);
    expect(styles).toMatch(
      /@container\s*\(max-width:\s*820px\)[\s\S]*\.formGrid[\s\S]*\.splitLayout[\s\S]*\.receiptLayout/,
    );
  });
});

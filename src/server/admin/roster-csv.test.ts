import { describe, expect, it } from "vitest";
import { parseRosterCsv } from "./roster-csv";

describe("parseRosterCsv", () => {
  it("parses a well-formed roster with a manager column", () => {
    const result = parseRosterCsv(
      "name,email,role,department,manager\n" +
        "Ada Lovelace,ada@hive.local,executive,Engineering,grace@hive.local\n" +
        "Grace Hopper,grace@hive.local,intern,Engineering,\n",
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      rowNumber: 2,
      fields: {
        name: "Ada Lovelace",
        email: "ada@hive.local",
        role: "executive",
        department: "Engineering",
        manager: "grace@hive.local",
      },
    });
    expect(result.rows[1]?.fields.manager).toBeNull();
  });

  it("parses a roster without a manager column", () => {
    const result = parseRosterCsv(
      "name,email,role,department\nAda Lovelace,ada@hive.local,executive,Engineering",
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.fields).toMatchObject({
      name: "Ada Lovelace",
      manager: null,
    });
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const result = parseRosterCsv(
      'name,email,role,department,manager\n"Doe, Ada",ada@hive.local,executive,"Engineering, North","He said ""hi"""',
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.fields).toMatchObject({
      name: "Doe, Ada",
      department: "Engineering, North",
      manager: 'He said "hi"',
    });
  });

  it("handles CRLF line endings and a trailing blank line", () => {
    const result = parseRosterCsv(
      "name,email,role,department,manager\r\nAda,ada@hive.local,executive,Engineering,\r\n\r\n",
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.fields.name).toBe("Ada");
  });

  it("allows a quoted field to span lines", () => {
    const result = parseRosterCsv(
      'name,email,role,department,manager\n"Ada\nLovelace",ada@hive.local,executive,Engineering,',
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.fields.name).toBe("Ada\nLovelace");
  });

  it("rejects an unterminated quoted field", () => {
    const result = parseRosterCsv('name,email,role,department,manager\n"Ada,ada@hive.local');

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { rowNumber: 1, error: "The CSV has an unterminated quoted field." },
    ]);
  });

  it("rejects a missing header row", () => {
    const result = parseRosterCsv("");

    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.error).toContain("header row");
  });

  it("rejects an unknown header row", () => {
    const result = parseRosterCsv("first,mail,role,department\nAda,ada@hive.local,x,Engineering");

    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.error).toContain("name,email,role,department,manager");
  });

  it("tolerates header casing and surrounding whitespace", () => {
    const result = parseRosterCsv(
      " Name , Email , Role , Department , Manager \nAda,ada@hive.local,executive,Engineering,",
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it("reports rows with too few columns", () => {
    const result = parseRosterCsv(
      "name,email,role,department,manager\nAda,ada@hive.local,executive",
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      {
        rowNumber: 2,
        error: "Row 2 has 3 columns; expected 5 (name, email, role, department, manager).",
      },
    ]);
  });

  it("reports rows with too many columns", () => {
    const result = parseRosterCsv(
      "name,email,role,department,manager\nAda,ada@hive.local,executive,Engineering,grace@hive.local,extra",
    );

    expect(result.errors).toEqual([
      {
        rowNumber: 2,
        error: "Row 2 has 6 columns; expected 5 (name, email, role, department, manager).",
      },
    ]);
  });

  it("skips fully empty lines between rows", () => {
    const result = parseRosterCsv(
      "name,email,role,department,manager\nAda,ada@hive.local,executive,Engineering,\n\nGrace,grace@hive.local,intern,Engineering,\n",
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]?.rowNumber).toBe(4);
  });

  it("trims field whitespace", () => {
    const result = parseRosterCsv(
      "name,email,role,department,manager\n  Ada  ,  ada@hive.local  , executive , Engineering ,",
    );

    expect(result.rows[0]?.fields).toMatchObject({
      name: "Ada",
      email: "ada@hive.local",
      role: "executive",
      department: "Engineering",
    });
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HeldClaimRow } from "@/server/expenses/ports";
import { HeldSection } from "./held-section";

const HELD_CLAIMS: HeldClaimRow[] = [
  {
    claimId: "claim-1",
    ref: "EXP-2026-0142",
    title: "Figma Professional plan — H2 renewal",
    heldBy: "Ada Lovelace",
    heldReason: "Awaiting the missing invoice",
    heldAt: "2026-08-05T12:00:00.000Z",
    stage: "Manager",
  },
  {
    claimId: "claim-2",
    ref: "EXP-2026-0138",
    title: "Client dinner — Acme Corp",
    heldBy: "Rishikesh",
    heldReason: "Payment block under review",
    heldAt: "2026-08-06T09:30:00.000Z",
    stage: "Finance Executive",
  },
];

describe("HeldSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an empty state when no claims are held", () => {
    render(<HeldSection heldClaims={[]} />);

    expect(screen.getByText("No claims are on hold right now.")).toBeInTheDocument();
  });

  it("lists every held claim with holder, reason, held-on date, and stage", () => {
    render(<HeldSection heldClaims={HELD_CLAIMS} />);

    expect(screen.getByText("Figma Professional plan — H2 renewal")).toBeInTheDocument();
    expect(screen.getByText("EXP-2026-0142")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Awaiting the missing invoice")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();

    expect(screen.getByText("Client dinner — Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Rishikesh")).toBeInTheDocument();
    expect(screen.getByText("Payment block under review")).toBeInTheDocument();
    expect(screen.getByText("Finance Executive")).toBeInTheDocument();
  });

  it("formats the held-on date for display", () => {
    render(<HeldSection heldClaims={[HELD_CLAIMS[0]]} />);

    expect(screen.getByText("5 Aug 2026")).toBeInTheDocument();
  });

  it("deep-links each row to the expense drawer via the claim id", () => {
    render(<HeldSection heldClaims={HELD_CLAIMS} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const firstLink = within(rows[0]).getByRole("link", { name: "View claim" });
    expect(firstLink).toHaveAttribute("href", "/expenses?claim=claim-1");
    const secondLink = within(rows[1]).getByRole("link", { name: "View claim" });
    expect(secondLink).toHaveAttribute("href", "/expenses?claim=claim-2");
  });

  it("falls back to a placeholder when no reason was recorded", () => {
    render(
      <HeldSection
        heldClaims={[{ ...HELD_CLAIMS[0], heldReason: "" }]}
      />,
    );

    expect(screen.getByText("No reason recorded")).toBeInTheDocument();
  });
});

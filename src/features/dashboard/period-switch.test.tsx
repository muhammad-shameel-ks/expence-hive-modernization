// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_PERIOD_COOKIE,
  dashboardPeriodCookieValue,
  PERIOD_OPTIONS,
  PeriodSwitch,
} from "./period-switch";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

afterEach(() => {
  cleanup();
  mockRefresh.mockClear();
  document.cookie = `${DASHBOARD_PERIOD_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
});

describe("dashboardPeriodCookieValue", () => {
  it("builds the name=value pair for each period", () => {
    expect(dashboardPeriodCookieValue("month")).toBe("eh_dashboard_period=month");
    expect(dashboardPeriodCookieValue("year")).toBe("eh_dashboard_period=year");
    expect(dashboardPeriodCookieValue("overall")).toBe("eh_dashboard_period=overall");
  });
});

describe("PERIOD_OPTIONS", () => {
  it("defaults to month first, with overall available but not default (ADR-0020)", () => {
    expect(PERIOD_OPTIONS.map((option) => option.value)).toEqual(["month", "year", "overall"]);
  });
});

describe("PeriodSwitch", () => {
  it("renders all three periods with the active one pressed", () => {
    render(<PeriodSwitch period="month" />);
    const month = screen.getByRole("button", { name: "This month" });
    const year = screen.getByRole("button", { name: "This year" });
    const overall = screen.getByRole("button", { name: "Overall" });
    expect(month).toHaveAttribute("aria-pressed", "true");
    expect(year).toHaveAttribute("aria-pressed", "false");
    expect(overall).toHaveAttribute("aria-pressed", "false");
  });

  it("persists the selection as a cookie and refreshes the route on switch", () => {
    const { rerender } = render(<PeriodSwitch period="month" />);
    fireEvent.click(screen.getByRole("button", { name: "This year" }));
    expect(document.cookie).toContain(`${DASHBOARD_PERIOD_COOKIE}=year`);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    // The server round-trip re-renders with the new period from the cookie.
    rerender(<PeriodSwitch period="year" />);
    expect(screen.getByRole("button", { name: "This year" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does nothing when the already-active period is clicked again", () => {
    render(<PeriodSwitch period="month" />);
    fireEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("renders the persisted selection as active on a later visit", () => {
    document.cookie = `${DASHBOARD_PERIOD_COOKIE}=overall; path=/`;
    render(<PeriodSwitch period="overall" />);
    expect(screen.getByRole("button", { name: "Overall" })).toHaveAttribute("aria-pressed", "true");
  });
});

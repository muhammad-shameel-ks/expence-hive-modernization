// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Timeline,
  TimelineContent,
  TimelineDot,
  TimelineItem,
  TimelineSeparator,
} from "./timeline";

interface JourneyStep {
  id: string;
  pending?: boolean;
  current?: boolean;
  next?: boolean;
}

function renderJourney(steps: JourneyStep[]) {
  return render(
    <Timeline position="right">
      {steps.map((step) => (
        <TimelineItem key={step.id} pending={step.pending} current={step.current}>
          <TimelineSeparator>
            <TimelineDot pending={step.pending} current={step.current} next={step.next} />
          </TimelineSeparator>
          <TimelineContent>{step.id}</TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>,
  );
}

// The separator draws two connector spans per item: a leading stub above the
// dot and an outbound stub below it. Collect them in document order.
function connectorClasses(container: HTMLElement): string[] {
  return [...container.querySelectorAll("li span[aria-hidden]")]
    .filter((span) => span.classList.contains("w-0.5"))
    .map((span) => span.className);
}

const GREEN = "bg-emerald-500";
const SOLID = "bg-border";
const DASHED = "bg-border/40 border-l border-dashed border-border/60";

describe("TimelineSeparator connector styling", () => {
  it("keeps all connectors neutral when the journey is terminal (no current stage)", () => {
    // Rejected/paid journeys have only history steps, none flagged current.
    const { container } = renderJourney([
      { id: "draft" },
      { id: "submitted" },
      { id: "approved" },
      { id: "rejected" },
    ]);

    const classes = connectorClasses(container);
    expect(classes.join(" ")).not.toContain(GREEN);
    // The first item's leading stub and the last item's outbound stub fade to
    // transparent by design; every other half stays neutral.
    classes.filter((cls) => !cls.includes("bg-transparent")).forEach((cls) => {
      expect(cls).toContain(SOLID);
    });
  });

  it("tints connectors green up to and including the one leading into the current stage", () => {
    // submitted is current; the next step pulses but is not reached yet.
    const { container } = renderJourney([
      { id: "draft" },
      { id: "submitted", current: true },
      { id: "manager", next: true },
      { id: "finance", pending: true },
      { id: "payment", pending: true },
    ]);

    const classes = connectorClasses(container);
    // draft -> submitted: green on both halves of the segment.
    expect(classes[1]).toContain(GREEN); // draft outbound
    expect(classes[2]).toContain(GREEN); // submitted leading
    // submitted -> manager: reached the current dot, not the next one.
    expect(classes[3]).not.toContain(GREEN); // submitted outbound
    expect(classes[3]).toContain(SOLID);
    expect(classes[4]).not.toContain(GREEN); // manager leading
  });

  it("draws the segment between the next stage and a following pending stage dashed on both halves", () => {
    // Regression: previously the next item's outbound stub was solid while the
    // following pending item's leading stub was dashed, splitting one segment
    // into two inconsistent halves.
    const { container } = renderJourney([
      { id: "submitted", current: true },
      { id: "manager", next: true },
      { id: "finance", pending: true },
      { id: "payment", pending: true },
    ]);

    const classes = connectorClasses(container);
    // manager outbound (classes[3]) and finance leading (classes[4]) form one
    // segment; both halves must agree on the dashed pending style.
    expect(classes[3]).toContain(DASHED);
    expect(classes[4]).toContain(DASHED);
  });

  it("keeps pending stages dashed after the current stage", () => {
    const { container } = renderJourney([
      { id: "submitted", current: true },
      { id: "finance", pending: true },
      { id: "payment", pending: true },
    ]);

    const classes = connectorClasses(container);
    // Skip the last item's transparent outbound stub (last-item fade).
    classes.slice(3, -1).forEach((cls) => {
      expect(cls).toContain(DASHED);
    });
  });
});

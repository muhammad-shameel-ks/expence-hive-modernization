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
  type TimelineTone,
} from "./timeline";

interface JourneyStep {
  id: string;
  tone?: TimelineTone;
  pending?: boolean;
  current?: boolean;
  next?: boolean;
}

function renderJourney(steps: JourneyStep[]) {
  return render(
    <Timeline position="right">
      {steps.map((step) => (
        <TimelineItem key={step.id} tone={step.tone} pending={step.pending}>
          <TimelineSeparator>
            <TimelineDot tone={step.tone} pending={step.pending} current={step.current} next={step.next} />
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
const RED = "bg-red-500";
const AMBER = "bg-amber-500";
const SKY = "bg-sky-500";
const DASHED = "bg-border/40 border-l border-dashed border-border/60";

describe("TimelineSeparator connector styling", () => {
  it("tints the connector into a rejected stage with the danger tone, not success green", () => {
    // Terminal rejected journey: the line leading into the red dot must be
    // red - a failed claim must never look success-toned.
    const { container } = renderJourney([
      { id: "draft", tone: "muted" },
      { id: "submitted", tone: "info" },
      { id: "approved", tone: "success" },
      { id: "rejected", tone: "danger" },
    ]);

    const classes = connectorClasses(container);
    // submitted outbound + rejected leading form the segment into the
    // rejected dot (classes[5] is approved outbound, classes[6] is rejected
    // leading).
    expect(classes[5]).toContain(RED);
    expect(classes[6]).toContain(RED);
    expect(classes[5]).not.toContain(GREEN);
    expect(classes[6]).not.toContain(GREEN);
    // The earlier segments follow their own stage tones.
    expect(classes[1]).toContain(SKY);
    expect(classes[3]).toContain(GREEN);
  });

  it("matches each connector to the tone of the stage it leads into on a live journey", () => {
    // submitted is current (info/sky); the next stage is a warning stage
    // (amber); the following stages are pending.
    const { container } = renderJourney([
      { id: "draft", tone: "muted" },
      { id: "submitted", tone: "info", current: true },
      { id: "manager", tone: "warning", next: true },
      { id: "finance", tone: "primary", pending: true },
      { id: "payment", tone: "warning", pending: true },
    ]);

    const classes = connectorClasses(container);
    // draft -> submitted: sky on both halves of the segment.
    expect(classes[1]).toContain(SKY);
    expect(classes[2]).toContain(SKY);
    // submitted -> manager: amber, matching the pulsing next-stage dot.
    expect(classes[3]).toContain(AMBER);
    expect(classes[4]).toContain(AMBER);
  });

  it("draws the segment between the next stage and a following pending stage dashed on both halves", () => {
    // Regression: previously the next item's outbound stub was solid while the
    // following pending item's leading stub was dashed, splitting one segment
    // into two inconsistent halves.
    const { container } = renderJourney([
      { id: "submitted", tone: "info", current: true },
      { id: "manager", tone: "warning", next: true },
      { id: "finance", tone: "primary", pending: true },
      { id: "payment", tone: "warning", pending: true },
    ]);

    const classes = connectorClasses(container);
    // manager outbound (classes[3]) and finance leading (classes[4]) form one
    // segment; both halves must agree on the dashed pending style.
    expect(classes[3]).toContain(DASHED);
    expect(classes[4]).toContain(DASHED);
  });

  it("keeps pending stages dashed after the current stage", () => {
    const { container } = renderJourney([
      { id: "submitted", tone: "info", current: true },
      { id: "finance", tone: "primary", pending: true },
      { id: "payment", tone: "warning", pending: true },
    ]);

    const classes = connectorClasses(container);
    // Skip the first transparent stub and the last item's transparent
    // outbound stub (first/last fade).
    classes.slice(1, -1).forEach((cls) => {
      expect(cls).toContain(DASHED);
    });
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaymentQueueDroppableTable } from "./payment-queue-droppable-table";

describe("PaymentQueueDroppableTable", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders children in its default state", () => {
    render(
      <PaymentQueueDroppableTable onFileDrop={vi.fn()}>
        <table>
          <tbody>
            <tr>
              <td>Test Row</td>
            </tr>
          </tbody>
        </table>
      </PaymentQueueDroppableTable>,
    );

    expect(screen.getByText("Test Row")).toBeInTheDocument();
    expect(
      screen.queryByText("Drop Excel register to auto-select claims"),
    ).not.toBeInTheDocument();
  });

  it("shows the drag overlay when a file is dragged over the table container", () => {
    render(
      <PaymentQueueDroppableTable onFileDrop={vi.fn()}>
        <table>
          <tbody>
            <tr>
              <td>Queue Content</td>
            </tr>
          </tbody>
        </table>
      </PaymentQueueDroppableTable>,
    );

    const container = screen.getByTestId("payment-queue-droppable-table");

    fireEvent.dragEnter(container, {
      dataTransfer: {
        items: [{ kind: "file", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
      },
    });

    expect(
      screen.getByText("Drop Excel register to auto-select claims"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Accepts .xlsx payment registers"),
    ).toBeInTheDocument();

    fireEvent.dragLeave(container);

    expect(
      screen.queryByText("Drop Excel register to auto-select claims"),
    ).not.toBeInTheDocument();
  });

  it("invokes onFileDrop when a file is dropped onto the table", () => {
    const handleDrop = vi.fn();
    render(
      <PaymentQueueDroppableTable onFileDrop={handleDrop}>
        <table>
          <tbody>
            <tr>
              <td>Queue Content</td>
            </tr>
          </tbody>
        </table>
      </PaymentQueueDroppableTable>,
    );

    const container = screen.getByTestId("payment-queue-droppable-table");
    const file = new File(["dummy excel content"], "payment-register.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    fireEvent.dragEnter(container, {
      dataTransfer: { items: [{ kind: "file", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }] },
    });

    expect(screen.getByText("Drop Excel register to auto-select claims")).toBeInTheDocument();

    fireEvent.drop(container, {
      dataTransfer: {
        files: [file],
      },
    });

    expect(handleDrop).toHaveBeenCalledTimes(1);
    expect(handleDrop).toHaveBeenCalledWith(file);
    expect(screen.queryByText("Drop Excel register to auto-select claims")).not.toBeInTheDocument();
  });

  it("displays the importing overlay when isImporting is true", () => {
    render(
      <PaymentQueueDroppableTable onFileDrop={vi.fn()} isImporting={true}>
        <table>
          <tbody>
            <tr>
              <td>Queue Content</td>
            </tr>
          </tbody>
        </table>
      </PaymentQueueDroppableTable>,
    );

    expect(screen.getByText("Parsing payment register…")).toBeInTheDocument();
    expect(
      screen.getByText("Matching claims and updating table selection"),
    ).toBeInTheDocument();
  });

  it("passes keyboard events and attributes properly", () => {
    const handleKeyDown = vi.fn();
    render(
      <PaymentQueueDroppableTable
        onFileDrop={vi.fn()}
        onKeyDown={handleKeyDown}
        ariaLabel="Accessible table label"
        tabIndex={0}
      >
        <div>Content</div>
      </PaymentQueueDroppableTable>,
    );

    const container = screen.getByTestId("payment-queue-droppable-table");
    expect(container).toHaveAttribute("aria-label", "Accessible table label");
    expect(container).toHaveAttribute("aria-dropeffect", "copy");

    fireEvent.keyDown(container, { key: "ArrowDown" });
    expect(handleKeyDown).toHaveBeenCalledTimes(1);
  });
});

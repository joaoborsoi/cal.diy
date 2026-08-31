import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { showToast } from "@calcom/ui/components/toast";

import { CopySummaryButton } from "./CopySummaryButton";

vi.mock("@calcom/ui/components/toast", () => ({
  showToast: vi.fn(),
}));

const SUMMARY = ["What: 30 Min Meeting", "When: Wednesday, September 3, 2025, 10:00 AM - 10:30 AM"].join("\n");

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("CopySummaryButton", () => {
  it("renders a labelled button", () => {
    render(<CopySummaryButton summary={SUMMARY} />);

    const button = screen.getByTestId("copy-summary-button");
    expect(button).toHaveTextContent("copy_summary");
  });

  it("copies the summary to the clipboard and shows a success toast", async () => {
    render(<CopySummaryButton summary={SUMMARY} />);

    fireEvent.click(screen.getByTestId("copy-summary-button"));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("summary_copied", "success"));
    expect(writeText).toHaveBeenCalledWith(SUMMARY);
  });

  it("shows an error toast when copying to the clipboard fails", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<CopySummaryButton summary={SUMMARY} />);

    fireEvent.click(screen.getByTestId("copy-summary-button"));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("something_went_wrong", "error"));
  });
});

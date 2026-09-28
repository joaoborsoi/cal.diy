import { render } from "@calcom/features/bookings/Booker/__tests__/test-utils";
import { fireEvent, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvailableTimeSlots } from "./AvailableTimeSlots";

vi.mock("@calcom/web/modules/bookings/components/AvailableTimes", () => ({
  AvailableTimes: () => <div data-testid="available-times" />,
  AvailableTimesSkeleton: () => <div data-testid="available-times-skeleton" />,
}));

vi.mock("@calcom/web/modules/bookings/components/AvailableTimesHeader", () => ({
  AvailableTimesHeader: () => <div data-testid="available-times-header" />,
}));

const DATE = "2026-10-01";
const FIRST_SLOT = `${DATE}T09:00:00.000Z`;
const SECOND_SLOT = `${DATE}T10:00:00.000Z`;

type Props = ComponentProps<typeof AvailableTimeSlots>;

const renderSlots = (props: Partial<Props> = {}) => {
  const onAvailableTimeSlotSelect = vi.fn();
  const onSubmit = vi.fn();
  const defaultProps: Props = {
    isLoading: false,
    event: { data: null },
    loadingStates: { creatingBooking: false, creatingRecurringBooking: false },
    isVerificationCodeSending: false,
    renderConfirmNotVerifyEmailButtonCond: true,
    onSubmit,
    skipConfirmStep: false,
    unavailableTimeSlots: [],
    onAvailableTimeSlotSelect,
    schedule: {
      data: { slots: { [DATE]: [{ time: FIRST_SLOT }, { time: SECOND_SLOT }] } },
      invalidate: vi.fn(),
    } as unknown as Props["schedule"],
  };
  render(<AvailableTimeSlots {...defaultProps} {...props} />, { mockStore: { selectedDate: DATE } });
  return { onAvailableTimeSlotSelect, onSubmit };
};

describe("AvailableTimeSlots - pick for me", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects a random available slot without creating the booking", () => {
    const { onAvailableTimeSlotSelect, onSubmit } = renderSlots();

    fireEvent.click(screen.getByTestId("pick-for-me-button"));

    expect(onAvailableTimeSlotSelect).toHaveBeenCalledWith(SECOND_SLOT);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("skips slots that are unavailable", () => {
    const { onAvailableTimeSlotSelect } = renderSlots({ unavailableTimeSlots: [SECOND_SLOT] });

    fireEvent.click(screen.getByTestId("pick-for-me-button"));

    expect(onAvailableTimeSlotSelect).toHaveBeenCalledWith(FIRST_SLOT);
  });

  it("only shows the confirm step when skipConfirmStep is enabled", () => {
    const { onAvailableTimeSlotSelect, onSubmit } = renderSlots({ skipConfirmStep: true });

    fireEvent.click(screen.getByTestId("pick-for-me-button"));

    expect(onAvailableTimeSlotSelect).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is hidden when no slot can be picked", () => {
    renderSlots({ unavailableTimeSlots: [FIRST_SLOT, SECOND_SLOT] });
    expect(screen.queryByTestId("pick-for-me-button")).toBeNull();
  });

  it("is hidden while loading", () => {
    renderSlots({ isLoading: true });
    expect(screen.queryByTestId("pick-for-me-button")).toBeNull();
  });
});

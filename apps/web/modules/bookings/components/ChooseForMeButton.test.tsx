import { SchedulingType } from "@calcom/prisma/enums";
import type { ComponentProps } from "react";
import { vi } from "vitest";

import { fireEvent, render, screen } from "@calcom/features/bookings/Booker/__tests__/test-utils";

import { ChooseForMeButton } from "./ChooseForMeButton";

type Schedule = ComponentProps<typeof ChooseForMeButton>["schedule"];

const baseSchedule: Schedule = {
  data: {
    slots: {
      "2024-01-01": [{ time: "2024-01-01T10:00:00Z" }],
    },
  },
} as Schedule;

const singleHostEvent = { data: { seatsPerTimeSlot: null, schedulingType: null } };

describe("ChooseForMeButton", () => {
  it("picks a slot from the loaded schedule and drives the normal selection path", () => {
    const setSelectedDate = vi.fn();
    const onAvailableTimeSlotSelect = vi.fn();

    render(
      <ChooseForMeButton
        schedule={baseSchedule}
        event={singleHostEvent}
        unavailableTimeSlots={[]}
        selectedTimeslot={null}
        onAvailableTimeSlotSelect={onAvailableTimeSlotSelect}
      />,
      { mockStore: { setSelectedDate } }
    );

    fireEvent.click(screen.getByRole("button", { name: "choose_for_me" }));

    expect(setSelectedDate).toHaveBeenCalledWith({ date: "2024-01-01" });
    expect(onAvailableTimeSlotSelect).toHaveBeenCalledWith("2024-01-01T10:00:00Z");
  });

  it("relabels to the reroll copy once a timeslot is selected", () => {
    render(
      <ChooseForMeButton
        schedule={baseSchedule}
        event={singleHostEvent}
        unavailableTimeSlots={[]}
        selectedTimeslot="2024-01-01T10:00:00Z"
        onAvailableTimeSlotSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "choose_for_me_pick_another" })).toBeInTheDocument();
  });

  it("shows the empty-pool hint and does not select a slot when nothing is bookable", () => {
    const setSelectedDate = vi.fn();
    const onAvailableTimeSlotSelect = vi.fn();
    const emptySchedule: Schedule = { data: { slots: {} } } as Schedule;

    render(
      <ChooseForMeButton
        schedule={emptySchedule}
        event={singleHostEvent}
        unavailableTimeSlots={[]}
        selectedTimeslot={null}
        onAvailableTimeSlotSelect={onAvailableTimeSlotSelect}
      />,
      { mockStore: { setSelectedDate } }
    );

    fireEvent.click(screen.getByRole("button", { name: "choose_for_me" }));

    expect(screen.getByText("choose_for_me_no_slots_loaded")).toBeInTheDocument();
    expect(setSelectedDate).not.toHaveBeenCalled();
    expect(onAvailableTimeSlotSelect).not.toHaveBeenCalled();
  });

  it("excludes unavailable and seats-full slots from the pool it draws from", () => {
    const onAvailableTimeSlotSelect = vi.fn();
    const schedule: Schedule = {
      data: {
        slots: {
          "2024-01-01": [
            { time: "2024-01-01T10:00:00Z", attendees: 2 },
            { time: "2024-01-01T11:00:00Z", attendees: 0 },
          ],
        },
      },
    } as Schedule;

    render(
      <ChooseForMeButton
        schedule={schedule}
        event={{ data: { seatsPerTimeSlot: 2, schedulingType: null } }}
        unavailableTimeSlots={["2024-01-01T11:00:00Z"]}
        selectedTimeslot={null}
        onAvailableTimeSlotSelect={onAvailableTimeSlotSelect}
      />
    );

    // Both candidate slots are filtered out (one seats-full, one explicitly unavailable),
    // so clicking should surface the empty-pool hint rather than pick either.
    fireEvent.click(screen.getByRole("button", { name: "choose_for_me" }));

    expect(screen.getByText("choose_for_me_no_slots_loaded")).toBeInTheDocument();
    expect(onAvailableTimeSlotSelect).not.toHaveBeenCalled();
  });

  it("does not render for round-robin/collective/managed event types", () => {
    const { container } = render(
      <ChooseForMeButton
        schedule={baseSchedule}
        event={{ data: { seatsPerTimeSlot: null, schedulingType: SchedulingType.ROUND_ROBIN } }}
        unavailableTimeSlots={[]}
        selectedTimeslot={null}
        onAvailableTimeSlotSelect={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

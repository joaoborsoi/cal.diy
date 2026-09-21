import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
const mockShowToast = vi.fn();

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      viewer: {
        slots: {
          getSchedule: {
            fetch: mockFetch,
          },
        },
      },
    }),
  },
}));

vi.mock("@calcom/features/bookings/Booker/hooks/useBookerTime", () => ({
  useBookerTime: () => ({ timezone: "UTC" }),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

vi.mock("@calcom/ui/components/toast", () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import { usePickRandomSlot } from "./usePickRandomSlot";

const emptySchedule = { slots: {} };
const scheduleWithSlots = (times: string[]) => ({
  slots: { "2026-02-01": times.map((time) => ({ time })) },
});

describe("usePickRandomSlot", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockShowToast.mockReset();
  });

  it("stops at the first month with slots and does not fetch further months", async () => {
    mockFetch
      .mockResolvedValueOnce(emptySchedule)
      .mockResolvedValueOnce(scheduleWithSlots(["2026-02-05T10:00:00.000Z"]));

    const { result } = renderHook(() =>
      usePickRandomSlot({ username: "alice", eventSlug: "intro", eventId: 1 })
    );

    let picked: string | null = null;
    await act(async () => {
      picked = await result.current.pickRandomSlot();
    });

    expect(picked).toBe("2026-02-05T10:00:00.000Z");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.hasNoSlots).toBe(false);
  });

  it("gives up after the search cap and reports no slots found", async () => {
    mockFetch.mockResolvedValue(emptySchedule);

    const { result } = renderHook(() =>
      usePickRandomSlot({ username: "alice", eventSlug: "intro", eventId: 1 })
    );

    let picked: string | null = "not-null";
    await act(async () => {
      picked = await result.current.pickRandomSlot();
    });

    expect(picked).toBeNull();
    expect(result.current.hasNoSlots).toBe(true);
    // Current month plus MAX_MONTHS_TO_SEARCH (12) months forward = 13 calls.
    expect(mockFetch).toHaveBeenCalledTimes(13);
  });

  it("shows an error toast and stops searching when a request fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() =>
      usePickRandomSlot({ username: "alice", eventSlug: "intro", eventId: 1 })
    );

    let picked: string | null = "not-null";
    await act(async () => {
      picked = await result.current.pickRandomSlot();
    });

    expect(picked).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith("unexpected_error_try_again", "error");
    expect(result.current.isLoading).toBe(false);
  });

  it("does nothing when there's no username or event to search for", async () => {
    const { result } = renderHook(() => usePickRandomSlot({ username: null, eventSlug: null, eventId: null }));

    let picked: string | null = "not-null";
    await act(async () => {
      picked = await result.current.pickRandomSlot();
    });

    expect(picked).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

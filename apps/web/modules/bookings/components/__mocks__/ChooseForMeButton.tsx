import { vi } from "vitest";

vi.mock("../ChooseForMeButton", () => ({
  ChooseForMeButton: () => <div data-testid="choose-for-me-button">Mock Choose For Me Button</div>,
}));

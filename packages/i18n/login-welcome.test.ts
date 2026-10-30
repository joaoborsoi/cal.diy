import { describe, expect, it } from "vitest";

import en from "./locales/en/common.json";
import ptBR from "./locales/pt-BR/common.json";

describe("login welcome_back_sign_in", () => {
  it("uses the new English text", () => {
    expect(en.welcome_back_sign_in).toBe("Sign in to your calendar.");
  });

  it("uses the new pt-BR text", () => {
    expect(ptBR.welcome_back_sign_in).toBe("Acesse sua agenda.");
  });
});

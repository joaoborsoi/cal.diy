import { describe, expect, it } from "vitest";
import {
  BUSINESS_HOURS_END_HOUR,
  BUSINESS_HOURS_START_HOUR,
  BUSINESS_HOURS_TIME_ZONE,
  isOutsideBusinessHours,
} from "./isOutsideBusinessHours";

// Datas de referência (todas em 2026):
// 2026-09-05 = sábado, 2026-09-06 = domingo, 2026-09-07 = segunda, 2026-09-08 = terça.

describe("isOutsideBusinessHours", () => {
  describe("constantes exportadas", () => {
    it("usa America/Sao_Paulo como fuso canônico", () => {
      expect(BUSINESS_HOURS_TIME_ZONE).toBe("America/Sao_Paulo");
    });

    it("mantém a janela comercial em 09:00–18:00", () => {
      expect(BUSINESS_HOURS_START_HOUR).toBe(9);
      expect(BUSINESS_HOURS_END_HOUR).toBe(18);
    });
  });

  describe("dentro do expediente (BRT)", () => {
    it("retorna false para segunda-feira ao meio-dia", () => {
      expect(isOutsideBusinessHours("2026-09-07T12:00:00-03:00")).toBe(false);
    });

    it("retorna false às 09:00 em ponto (limite inferior é inclusivo)", () => {
      expect(isOutsideBusinessHours("2026-09-07T09:00:00-03:00")).toBe(false);
    });

    it("retorna false às 17:59", () => {
      expect(isOutsideBusinessHours("2026-09-07T17:59:00-03:00")).toBe(false);
    });

    it("retorna false na sexta-feira dentro da janela", () => {
      expect(isOutsideBusinessHours("2026-09-11T10:30:00-03:00")).toBe(false);
    });
  });

  describe("fora do expediente por horário (BRT)", () => {
    it("retorna true antes das 09:00", () => {
      expect(isOutsideBusinessHours("2026-09-07T08:59:00-03:00")).toBe(true);
    });

    it("retorna true às 18:00 em ponto (limite superior é exclusivo)", () => {
      expect(isOutsideBusinessHours("2026-09-07T18:00:00-03:00")).toBe(true);
    });

    it("retorna true depois das 18:00", () => {
      expect(isOutsideBusinessHours("2026-09-07T21:15:00-03:00")).toBe(true);
    });

    it("retorna true de madrugada", () => {
      expect(isOutsideBusinessHours("2026-09-07T03:00:00-03:00")).toBe(true);
    });
  });

  describe("fora do expediente por fim de semana (BRT)", () => {
    it("retorna true no sábado, mesmo em horário comercial", () => {
      expect(isOutsideBusinessHours("2026-09-05T12:00:00-03:00")).toBe(true);
    });

    it("retorna true no domingo, mesmo em horário comercial", () => {
      expect(isOutsideBusinessHours("2026-09-06T12:00:00-03:00")).toBe(true);
    });
  });

  describe("feriados são ignorados", () => {
    it("retorna false em 07/09 (Independência) por ser dia útil dentro da janela", () => {
      // Feriados não contam como dias não úteis — apenas fins de semana.
      expect(isOutsideBusinessHours("2026-09-07T14:00:00-03:00")).toBe(false);
    });
  });

  describe("conversão de fuso do usuário", () => {
    it("converte horário de Tóquio para BRT antes de avaliar (dentro da janela)", () => {
      // Segunda 22:00 em Tóquio (+09:00) = segunda 10:00 em São Paulo.
      expect(isOutsideBusinessHours("2026-09-07T22:00:00+09:00")).toBe(false);
    });

    it("converte horário de Tóquio para BRT antes de avaliar (fora da janela)", () => {
      // Terça 20:00 em Tóquio (+09:00) = terça 08:00 em São Paulo → antes da abertura.
      expect(isOutsideBusinessHours("2026-09-08T20:00:00+09:00")).toBe(true);
    });

    it("detecta virada de dia para o fim de semana ao converter", () => {
      // Sábado 09:00 em Los Angeles (-07:00) = sábado 13:00 em São Paulo → fim de semana.
      expect(isOutsideBusinessHours("2026-09-05T09:00:00-07:00")).toBe(true);
    });

    it("aceita instante em UTC", () => {
      // Segunda 15:00Z = segunda 12:00 BRT.
      expect(isOutsideBusinessHours("2026-09-07T15:00:00Z")).toBe(false);
    });
  });

  describe("aceita diferentes tipos de entrada", () => {
    it("aceita um objeto Date", () => {
      expect(isOutsideBusinessHours(new Date("2026-09-07T12:00:00-03:00"))).toBe(false);
      expect(isOutsideBusinessHours(new Date("2026-09-05T12:00:00-03:00"))).toBe(true);
    });

    it("aceita um timestamp em milissegundos", () => {
      expect(isOutsideBusinessHours(new Date("2026-09-07T12:00:00-03:00").getTime())).toBe(false);
    });
  });

  describe("entradas ausentes ou inválidas", () => {
    it("retorna false para null", () => {
      expect(isOutsideBusinessHours(null)).toBe(false);
    });

    it("retorna false para undefined", () => {
      expect(isOutsideBusinessHours(undefined)).toBe(false);
    });

    it("retorna false para string vazia", () => {
      expect(isOutsideBusinessHours("")).toBe(false);
    });

    it("retorna false para string não parseável", () => {
      expect(isOutsideBusinessHours("not-a-date")).toBe(false);
    });
  });
});

import type { ConfigType } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";

/**
 * Fuso canônico do projeto/equipe. Toda a regra de horário comercial é avaliada
 * neste fuso, independentemente do fuso do usuário que está fazendo a reserva.
 * Ver CLAUDE.md > "Horário comercial e fusos horários".
 */
export const BUSINESS_HOURS_TIME_ZONE = "America/Sao_Paulo";

/** Início da janela comercial — hora local (BRT), inclusivo. */
export const BUSINESS_HOURS_START_HOUR = 9;

/**
 * Fim da janela comercial — hora local (BRT), exclusivo.
 * Às 18:00 em ponto já é considerado fora do expediente.
 */
export const BUSINESS_HOURS_END_HOUR = 18;

/**
 * Indica se o instante informado cai fora do horário comercial:
 * - fim de semana (sábado ou domingo), ou
 * - antes das 09:00, ou
 * - às 18:00 ou depois
 *
 * A avaliação é sempre feita em America/Sao_Paulo. Feriados são ignorados por
 * decisão de projeto — apenas fins de semana contam como dias não úteis.
 *
 * @param date instante da reserva — ISO string, `Date`, `Dayjs`, timestamp, etc.
 * @returns `false` quando `date` é ausente ou inválido (nenhum aviso nesse caso).
 */
export function isOutsideBusinessHours(date: ConfigType | null | undefined): boolean {
  if (date === null || date === undefined || date === "") return false;

  const parsed = dayjs(date);
  if (!parsed.isValid()) return false;

  const localDate = parsed.tz(BUSINESS_HOURS_TIME_ZONE);
  if (!localDate.isValid()) return false;

  const weekday = localDate.day(); // 0 = domingo … 6 = sábado
  const isWeekend = weekday === 0 || weekday === 6;

  const hour = localDate.hour();
  const isBeforeOpening = hour < BUSINESS_HOURS_START_HOUR;
  const isAfterClosing = hour >= BUSINESS_HOURS_END_HOUR;

  return isWeekend || isBeforeOpening || isAfterClosing;
}

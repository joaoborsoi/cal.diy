import { isOutsideBusinessHours } from "@calcom/features/bookings/lib/isOutsideBusinessHours";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Alert } from "@calcom/ui/components/alert";
import type { JSX } from "react";

/**
 * Aviso não bloqueante exibido no formulário de reserva quando o horário
 * selecionado cai fora da janela comercial (fim de semana, antes das 09:00 ou
 * às/depois das 18:00 em America/Sao_Paulo).
 *
 * Renderiza `null` quando o horário está dentro do expediente ou é ausente/inválido.
 */
export const OutsideBusinessHoursAlert = ({ timeslot }: { timeslot: string | null }): JSX.Element | null => {
  const { t } = useLocale();

  if (!isOutsideBusinessHours(timeslot)) return null;

  return (
    <div data-testid="booking-outside-business-hours">
      <Alert
        className="my-2"
        severity="warning"
        title={t("booking_outside_business_hours_title")}
        message={t("booking_outside_business_hours_description")}
      />
    </div>
  );
};

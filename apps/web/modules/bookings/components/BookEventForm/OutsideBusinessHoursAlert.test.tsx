import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OutsideBusinessHoursAlert } from "./OutsideBusinessHoursAlert";

// 2026-09-05 = sábado, 2026-09-07 = segunda-feira. Offsets explícitos (-03:00 = BRT).

describe("OutsideBusinessHoursAlert", () => {
  it("não renderiza nada quando o horário está dentro do expediente", () => {
    const { container } = render(<OutsideBusinessHoursAlert timeslot="2026-09-07T12:00:00-03:00" />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("booking-outside-business-hours")).not.toBeInTheDocument();
  });

  it("não renderiza nada quando não há horário selecionado", () => {
    const { container } = render(<OutsideBusinessHoursAlert timeslot={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("não renderiza nada para um horário inválido", () => {
    const { container } = render(<OutsideBusinessHoursAlert timeslot="not-a-date" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("exibe o aviso quando o horário cai antes das 09:00 (BRT)", () => {
    render(<OutsideBusinessHoursAlert timeslot="2026-09-07T07:30:00-03:00" />);

    expect(screen.getByTestId("booking-outside-business-hours")).toBeInTheDocument();
    expect(screen.getByText("booking_outside_business_hours_title")).toBeInTheDocument();
    expect(screen.getByText("booking_outside_business_hours_description")).toBeInTheDocument();
  });

  it("exibe o aviso quando o horário cai às/depois das 18:00 (BRT)", () => {
    render(<OutsideBusinessHoursAlert timeslot="2026-09-07T18:00:00-03:00" />);

    expect(screen.getByTestId("booking-outside-business-hours")).toBeInTheDocument();
  });

  it("exibe o aviso para reservas no fim de semana", () => {
    render(<OutsideBusinessHoursAlert timeslot="2026-09-05T12:00:00-03:00" />);

    expect(screen.getByTestId("booking-outside-business-hours")).toBeInTheDocument();
  });

  it("usa o severity 'warning' (aviso não bloqueante)", () => {
    render(<OutsideBusinessHoursAlert timeslot="2026-09-05T12:00:00-03:00" />);

    // O ícone de triângulo é específico do severity="warning" no componente Alert.
    expect(screen.getByTestId("alert-triangle")).toBeInTheDocument();
  });

  it("converte o fuso do usuário antes de avaliar", () => {
    // Segunda 20:00 em Tóquio (+09:00) = segunda 08:00 em São Paulo → antes da abertura.
    render(<OutsideBusinessHoursAlert timeslot="2026-09-07T20:00:00+09:00" />);

    expect(screen.getByTestId("booking-outside-business-hours")).toBeInTheDocument();
  });
});

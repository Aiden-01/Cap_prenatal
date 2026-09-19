import { CalendarDays, Check, CornerUpRight, UserRoundX, X } from "lucide-react";

const STATUS_ICONS = {
  programada: CalendarDays,
  atendida: Check,
  reprogramada: CornerUpRight,
  cancelada: X,
  inasistente: UserRoundX,
};

export function AppointmentStatusIcon({ status, size = 15 }) {
  const Icon = STATUS_ICONS[status] || CalendarDays;
  return <Icon size={size} strokeWidth={2.2} aria-hidden="true" />;
}

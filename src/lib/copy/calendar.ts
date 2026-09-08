// Shared static fragments reused by every per-item/general availability copy
// block (miNegocioCopy.availability, guidesCopy.availability, and the newer
// per-service/per-tour/per-route/transporter-general blocks) — the day/month
// labels and generic action strings never vary by provider type.
export const CALENDAR_WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

export const CALENDAR_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const

export const calendarActionLabels = {
  markUnavailable: 'Marcar no disponible',
  markAvailable: 'Marcar disponible',
  prevMonth: 'Mes anterior',
  nextMonth: 'Mes siguiente',
  legendAvailable: 'Disponible',
  legendUnavailable: 'No disponible',
}

export const calendarGenericErrors = {
  generic: 'Ocurrió un error. Intenta de nuevo.',
  pastDate: 'No puedes marcar una fecha pasada.',
}

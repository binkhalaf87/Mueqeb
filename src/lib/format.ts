const dateTime = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(value: string | Date) {
  return dateTime.format(new Date(value));
}

/** مدة بالدقائق بصيغة مقروءة: 45 → "45 دقيقة"، 130 → "ساعتان"، 1500 → "يوم" */
export function formatDuration(minutes: number) {
  if (minutes < 1) return "أقل من دقيقة";
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "ساعة" : hours === 2 ? "ساعتان" : `${hours} ساعة`;
  const days = Math.round(hours / 24);
  return days === 1 ? "يوم" : days === 2 ? "يومان" : `${days} أيام`;
}

/** الوقت المتبقي حتى موعد، أو null إن انتهى */
export function timeLeft(deadline: string | null, now = Date.now()) {
  if (!deadline) return null;
  const minutes = Math.floor((new Date(deadline).getTime() - now) / 60_000);
  return minutes > 0 ? formatDuration(minutes) : null;
}

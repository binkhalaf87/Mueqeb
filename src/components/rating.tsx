/** عرض تقييم من 5 بنجوم نصية مع الرقم */
export function Rating({
  value,
  count,
  testId,
}: {
  value: number | null | undefined;
  count?: number;
  testId?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <span className="text-muted" data-testid={testId}>
        لا تقييمات بعد
      </span>
    );
  }
  const rounded = Math.round(Number(value));
  return (
    <span className="inline-flex items-center gap-1" data-testid={testId}>
      <span aria-hidden className="text-amber-500">
        {"★".repeat(rounded)}
        <span className="text-border">{"★".repeat(5 - rounded)}</span>
      </span>
      <span className="font-semibold">{Number(value).toFixed(1)}</span>
      {count !== undefined && <span className="text-sm text-muted">({count})</span>}
    </span>
  );
}

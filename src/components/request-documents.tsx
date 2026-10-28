import type { RequestDocument } from "@/lib/execution/queries";

export function RequestDocumentsList({
  documents,
  emptyText,
  testId,
}: {
  documents: RequestDocument[];
  emptyText: string;
  testId?: string;
}) {
  if (documents.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="space-y-1 text-sm" data-testid={testId}>
      {documents.map((d) => (
        <li key={d.id} className="flex flex-wrap gap-2">
          <span className="font-medium">{d.label}:</span>
          {d.url ? (
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {d.file_name}
            </a>
          ) : (
            <span>{d.file_name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

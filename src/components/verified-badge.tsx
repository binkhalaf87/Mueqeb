export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
      <svg aria-hidden viewBox="0 0 20 20" className="size-3.5" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 1.5l2.3 1.7 2.9-.1.9 2.7 2.3 1.8-.9 2.7.9 2.7-2.3 1.8-.9 2.7-2.9-.1L10 18.5l-2.3-1.7-2.9.1-.9-2.7-2.3-1.8.9-2.7-.9-2.7 2.3-1.8.9-2.7 2.9.1L10 1.5zm3.7 6.2a.75.75 0 00-1.1-1l-3.6 3.9-1.6-1.7a.75.75 0 10-1.1 1l2.2 2.3c.3.3.8.3 1.1 0l4.1-4.5z"
          clipRule="evenodd"
        />
      </svg>
      مكتب مرخّص موثّق
    </span>
  );
}

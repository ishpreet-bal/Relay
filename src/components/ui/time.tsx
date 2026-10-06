import { format, formatDistanceToNowStrict } from 'date-fns';

/** "3 days ago", with the exact time on hover. */
export function Ago({ date, className }: { date: Date | string | null | undefined; className?: string }) {
  if (!date) return <span className={className}>—</span>;
  const d = typeof date === 'string' ? new Date(date) : date;
  return (
    <time dateTime={d.toISOString()} title={format(d, 'PPpp')} className={className}>
      {formatDistanceToNowStrict(d, { addSuffix: true })}
    </time>
  );
}

export function DateTime({ date, pattern = 'EEE d MMM, h:mm a', className }: {
  date: Date | string | null | undefined;
  pattern?: string;
  className?: string;
}) {
  if (!date) return <span className={className}>—</span>;
  const d = typeof date === 'string' ? new Date(date) : date;
  return <time dateTime={d.toISOString()} className={className}>{format(d, pattern)}</time>;
}

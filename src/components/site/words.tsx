import { Fragment } from 'react';

/**
 * A headline whose words rise into place one after another on load.
 * Pure CSS, so it works before any JavaScript arrives.
 */
export function Words({ text, start = 0, step = 80, className = '' }: { text: string; start?: number; step?: number; className?: string }) {
  const words = text.split(' ');
  return (
    <span className={`s-words ${className}`}>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="w"><span style={{ '--d': `${start + i * step}ms` } as React.CSSProperties}>{w}</span></span>
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </span>
  );
}

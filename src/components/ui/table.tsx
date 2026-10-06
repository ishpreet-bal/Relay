import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Table chrome shared by every list: sticky header, hairline rows. */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('card overflow-x-auto', className)}>
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  );
}

export function Th({ children, className, sort }: {
  children?: React.ReactNode;
  className?: string;
  sort?: { active: boolean; direction: 'asc' | 'desc'; onClick: () => void };
}) {
  return (
    <th scope="col" className={cn('eyebrow text-left font-normal px-3 h-9 whitespace-nowrap bg-raised border-b border-hairline', className)}
        aria-sort={sort?.active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
      {sort ? (
        <button type="button" onClick={sort.onClick} className="inline-flex items-center gap-1 hover:text-ink">
          {children}
          {sort.active && (sort.direction === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
        </button>
      ) : children}
    </th>
  );
}

export function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn('px-3 py-2 border-b border-hairline align-top', className)}>{children}</td>;
}

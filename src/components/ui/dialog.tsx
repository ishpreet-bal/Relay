'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Modal dialog on Radix: focus trap, escape to close, labelled for screen readers. */
export function Dialog({ open, onOpenChange, title, description, children, width = 'md' }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm" />
        <RadixDialog.Content
          className={cn('fixed z-50 left-1/2 top-[8vh] -translate-x-1/2 w-[calc(100vw-32px)] max-h-[84vh] overflow-y-auto card shadow-pop',
            { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[width])}
        >
          <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-hairline">
            <div className="flex-1">
              <RadixDialog.Title className="text-[15px] font-semibold">{title}</RadixDialog.Title>
              {description && <RadixDialog.Description className="text-micro text-muted mt-0.5">{description}</RadixDialog.Description>}
            </div>
            <RadixDialog.Close className="btn-ghost size-7 p-0" aria-label="Close"><X className="size-4" /></RadixDialog.Close>
          </div>
          <div className="p-5">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

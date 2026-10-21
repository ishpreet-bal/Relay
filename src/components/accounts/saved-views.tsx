'use client';

import { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Dialog } from '@/components/ui/dialog';
import { ErrorNote } from '@/components/ui/states';

/** Pick, save and delete named filter sets for a list. */
export function SavedViews<F extends Record<string, unknown>>({ scope, current, onApply }: {
  scope: 'accounts' | 'contacts';
  current: F;
  onApply: (filters: Partial<F>) => void;
}) {
  const views = trpc.accounts.savedViews.useQuery({ scope });
  const utils = trpc.useUtils();
  const [activeId, setActiveId] = useState('');
  const [saving, setSaving] = useState(false);
  const remove = trpc.accounts.deleteView.useMutation({ onSuccess: () => { setActiveId(''); utils.accounts.savedViews.invalidate(); } });

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        <select aria-label="Saved views" className="input h-8 text-micro flex-1" value={activeId}
                onChange={(e) => {
                  setActiveId(e.target.value);
                  const view = views.data?.find((v) => v.id === e.target.value);
                  if (view) onApply(view.filters as Partial<F>);
                }}>
          <option value="">{views.data?.length ? 'Saved views…' : 'No saved views'}</option>
          {views.data?.map((v) => <option key={v.id} value={v.id}>{v.name}{v.userId ? '' : ' (shared)'}</option>)}
        </select>
        {activeId && (
          <button type="button" className="btn-ghost size-8 p-0" aria-label="Delete this view" disabled={remove.isPending}
                  onClick={() => { if (confirm('Delete this saved view?')) remove.mutate({ id: activeId }); }}>
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      <button type="button" className="btn-ghost h-7 text-micro w-full" onClick={() => setSaving(true)}>
        <Bookmark className="size-3.5" /> Save current filters
      </button>
      <ErrorNote error={remove.error} />
      {saving && <SaveDialog scope={scope} filters={current} onClose={(id) => { setSaving(false); if (id) setActiveId(id); }} />}
    </div>
  );
}

function SaveDialog({ scope, filters, onClose }: { scope: 'accounts' | 'contacts'; filters: Record<string, unknown>; onClose: (id?: string) => void }) {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const utils = trpc.useUtils();
  const save = trpc.accounts.saveView.useMutation({ onSuccess: (v) => { utils.accounts.savedViews.invalidate(); onClose(v.id); } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Save view" width="sm">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ scope, name, filters, shared }); }}>
        <label className="block">
          <span className="block text-[12px] font-medium mb-1.5">Name</span>
          <input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hot manufacturers in Mississauga" />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share with the whole team
        </label>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => onClose()}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || save.isPending}>Save</button>
        </div>
      </form>
    </Dialog>
  );
}

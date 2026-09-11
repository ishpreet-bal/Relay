'use client';

import { useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { Topbar } from '@/components/shell/topbar';
import { LeadFilters } from './lead-filters';
import { LeadTable } from './lead-table';
import { ImportDialog } from './import-dialog';
import { NewLeadDialog } from './new-lead-dialog';
import { trpc } from '@/lib/trpc/client';
import type { LeadFilter } from '@/server/services/leads';

const DEFAULT_FILTER: LeadFilter = { sort: 'score', direction: 'desc', limit: 50 };

export function LeadsWorkspace() {
  const [filter, setFilter] = useState<LeadFilter>(DEFAULT_FILTER);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const utils = trpc.useUtils();

  const refresh = () => {
    utils.leads.list.invalidate();
    utils.leads.count.invalidate();
    utils.leads.facets.invalidate();
  };

  return (
    <>
      <Topbar
        title="Leads"
        actions={
          <>
            <button type="button" className="btn-ghost h-8 text-micro" onClick={() => setImporting(true)}>
              <Upload className="size-3.5" strokeWidth={1.75} />
              Import CSV
            </button>
            <button type="button" className="btn-primary h-8 text-micro" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" strokeWidth={2} />
              New lead
            </button>
          </>
        }
      />
      <div className="flex flex-1 min-h-0">
        <LeadFilters filter={filter} onChange={setFilter} />
        <div className="flex-1 min-w-0 flex flex-col">
          <LeadTable filter={filter} onFilterChange={setFilter} onAddLead={() => setAdding(true)} />
        </div>
      </div>

      {importing && (
        <ImportDialog onClose={() => setImporting(false)} onImported={refresh} />
      )}
      {adding && (
        <NewLeadDialog onClose={() => setAdding(false)} onCreated={refresh} />
      )}
    </>
  );
}

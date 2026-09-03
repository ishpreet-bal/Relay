'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Topbar } from '@/components/shell/topbar';
import { LeadFilters } from './lead-filters';
import { LeadTable } from './lead-table';
import { ImportDialog } from './import-dialog';
import { trpc } from '@/lib/trpc/client';
import type { LeadFilter } from '@/server/services/leads';

const DEFAULT_FILTER: LeadFilter = { sort: 'score', direction: 'desc', limit: 50 };

export function LeadsWorkspace() {
  const [filter, setFilter] = useState<LeadFilter>(DEFAULT_FILTER);
  const [importing, setImporting] = useState(false);
  const utils = trpc.useUtils();

  return (
    <>
      <Topbar
        title="Leads"
        actions={
          <button type="button" className="btn-outline h-8 text-micro" onClick={() => setImporting(true)}>
            <Upload className="size-3.5" strokeWidth={1.75} />
            Import CSV
          </button>
        }
      />
      <div className="flex flex-1 min-h-0">
        <LeadFilters filter={filter} onChange={setFilter} />
        <div className="flex-1 min-w-0 flex flex-col">
          <LeadTable filter={filter} onFilterChange={setFilter} />
        </div>
      </div>

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={() => {
            utils.leads.list.invalidate();
            utils.leads.count.invalidate();
            utils.leads.facets.invalidate();
          }}
        />
      )}
    </>
  );
}

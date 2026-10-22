'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { ErrorNote } from '@/components/ui/states';
import { cn } from '@/lib/utils';

interface Turn { role: 'user' | 'assistant'; text: string; tools?: Array<{ name: string; ok: boolean }> }

const EXAMPLES = ['Which qualified accounts in Hamilton have the highest scores?', 'How is the research funnel doing this month?', 'Which opportunities are waiting for a proposal?'];

/** Ask questions about the workspace. Read-only; answers use only what you can see. */
export function AssistantPage({ aiConfigured }: { aiConfigured: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const tools = trpc.assistant.tools.useQuery();
  const ask = trpc.assistant.ask.useMutation({
    onSuccess: (r) => setTurns((t) => [...t, { role: 'assistant', text: r.text, tools: r.toolsUsed }]),
  });
  const submit = (q: string) => {
    if (!q.trim() || ask.isPending) return;
    const history = turns.map(({ role, text }) => ({ role, text }));
    setTurns((t) => [...t, { role: 'user', text: q }]);
    setQuestion('');
    ask.mutate({ question: q, history });
  };
  return (
    <>
      <Topbar title="Ask Relay" showClientSwitcher={false} />
      <PageBody width="narrow" className="space-y-4">
        {!aiConfigured && <p className="card p-3 text-micro">No AI provider is connected (ANTHROPIC_API_KEY). The assistant needs one.</p>}
        <p className="text-micro text-muted">
          Answers come from your workspace through read-only lookups ({tools.data?.map((t) => t.name.replace(/_/g, ' ')).join(', ') ?? '…'}), limited to what you can see. It can&apos;t change or send anything. Each question is a logged, budgeted model call.
        </p>
        <ul className="space-y-3">
          {turns.map((t, i) => (
            <li key={i} className={cn('card p-3 text-[13px] whitespace-pre-wrap', t.role === 'user' ? 'bg-raised/60 ml-10' : 'mr-10')}>
              {t.text}
              {!!t.tools?.length && <p className="text-[11px] text-muted mt-2">Looked up: {t.tools.map((x) => `${x.name.replace(/_/g, ' ')}${x.ok ? '' : ' (failed)'}`).join(', ')}</p>}
            </li>
          ))}
          {ask.isPending && <li className="card p-3 text-micro text-muted mr-10 flex items-center gap-2"><Sparkles className="size-3.5 animate-pulse" /> Looking it up…</li>}
        </ul>
        <ErrorNote error={ask.error} />
        {!turns.length && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => <button key={e} type="button" className="btn-outline h-8 text-micro" disabled={!aiConfigured} onClick={() => submit(e)}>{e}</button>)}
          </div>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(question); }}>
          <input className="input flex-1" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about prospects, the funnel, opportunities…" maxLength={4000} disabled={!aiConfigured} aria-label="Question" />
          <button type="submit" className="btn-primary" disabled={!aiConfigured || ask.isPending || !question.trim()}>Ask</button>
        </form>
      </PageBody>
    </>
  );
}

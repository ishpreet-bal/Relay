import Link from 'next/link';

/** Layout for the few pages anyone can read without signing in (about, privacy). */
export function PublicPage({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-canvas px-4 py-12">
      <article className="max-w-2xl mx-auto">
        <p className="eyebrow mb-3">{eyebrow ?? 'Relay'}</p>
        <h1 className="text-2xl font-semibold mb-6">{title}</h1>
        <div className="space-y-4 text-[15px] leading-relaxed [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:mt-8 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:underline">
          {children}
        </div>
        <footer className="mt-12 pt-6 border-t border-hairline flex flex-wrap gap-4 text-micro text-muted">
          <Link href="/about">About Relay</Link>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/sign-in">Sign in</Link>
        </footer>
      </article>
    </main>
  );
}

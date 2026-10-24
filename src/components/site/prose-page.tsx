/** A long-form page on the public site: about, privacy. */
export function ProsePage({ eyebrow, title, lede, children }: { eyebrow: string; title: React.ReactNode; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <section className="relative overflow-hidden border-b border-site-rule">
        <div className="absolute inset-0 s-grid-bg-light [mask-image:linear-gradient(to_bottom,black,transparent)] pointer-events-none" aria-hidden="true" />
        <div className="s-container relative pt-14 sm:pt-20 pb-12 sm:pb-16">
          <p className="s-eyebrow">{eyebrow}</p>
          <h1 className="s-display mt-5 max-w-4xl text-balance !text-[clamp(2.4rem,5vw,4.2rem)]">{title}</h1>
          {lede && <p className="s-lede mt-6 max-w-2xl text-pretty">{lede}</p>}
        </div>
      </section>
      <div className="s-container py-14 sm:py-20">
        <article className="s-prose max-w-[720px]">{children}</article>
      </div>
    </>
  );
}

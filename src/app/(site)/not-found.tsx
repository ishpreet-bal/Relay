import Link from 'next/link';

export default function SiteNotFound() {
  return (
    <section className="s-container py-28 sm:py-36">
      <p className="s-eyebrow">404</p>
      <h1 className="s-display mt-5 !text-[clamp(2.4rem,5vw,4rem)]">This page <span className="s-em">doesn’t exist.</span></h1>
      <p className="s-lede mt-6 max-w-xl">It may have moved. These are good places to start:</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="s-btn-primary">Homepage</Link>
        <Link href="/services" className="s-btn-quiet">Services</Link>
        <Link href="/demos" className="s-btn-quiet">Demos</Link>
        <Link href="/contact" className="s-btn-quiet">Contact</Link>
      </div>
    </section>
  );
}

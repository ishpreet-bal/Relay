import Link from 'next/link';
import { ProsePage } from '@/components/site/prose-page';
import { ConsultCta } from '@/components/site/sections';
import { BRAND } from '@/site/config';
import { SERVICES } from '@/site/content/services';

export const metadata = {
  title: 'About',
  description: `${BRAND.name} is a fully managed business technology company: we design, build, connect, host and support custom software and automation for businesses.`,
  alternates: { canonical: '/about' },
};

/** About the company, for visitors, and the platform description Google's OAuth review reads. */
export default function AboutPage() {
  return (
    <>
      <ProsePage eyebrow={`About ${BRAND.name}`} title={<>We build the technology. <span className="s-em">You run the business.</span></>}
        lede={`${BRAND.name} is a fully managed business technology and automation company in ${BRAND.region}. We design, build, connect, host and support custom software for businesses, so they never have to buy, configure and maintain a stack of tools themselves.`}>
        <h2>What we do</h2>
        <ul>
          {SERVICES.map((s) => (
            <li key={s.key}><Link href={s.href}><strong>{s.name}</strong></Link>: {s.choiceDetail}</li>
          ))}
        </ul>

        <h2>How we work</h2>
        <ul>
          <li><strong>Around your process.</strong> We learn how your business actually runs before recommending anything, and we build to fit it.</li>
          <li><strong>One provider, one price.</strong> Hosting, the services behind your solution, support and maintenance are part of what we quote. Anything you would need to license yourself is named before you sign.</li>
          <li><strong>Your systems, your say.</strong> We connect only what you authorize, through your own accounts, and you can withdraw access at any time.</li>
          <li><strong>Proof you can try.</strong> Our <Link href="/demos">demos</Link> are working software, and we will tell you plainly when something is not a good fit.</li>
        </ul>

        <h2>The platform behind it</h2>
        <p>{BRAND.name} runs on software we built ourselves, in two parts:</p>
        <ul>
          <li><strong>{BRAND.name} Intelligence</strong>: business discovery, research, lead qualification and customer acquisition. It finds businesses that match an ideal customer profile from public sources and business data providers, researches each from its own website with every claim tied to its source, and prepares outreach that a person reviews. Campaigns send from the team&apos;s own mailboxes, within sending limits, with opt-out links and a suppression list that is always honoured.</li>
          <li><strong>{BRAND.name} Studio</strong>: the applications and automations we build for clients, configured from reusable, tested components, deployed with testing and approval steps, and supported on a recurring basis. Clients see their applications and results in a client portal.</li>
        </ul>

        <h2>Gmail</h2>
        <p>
          A team member can connect a Gmail or Google Workspace mailbox so campaigns send from that address. {BRAND.name} asks Google only for
          permission to send email and to confirm the address. It cannot read, search or delete anything in the inbox. The{' '}
          <Link href="/privacy">privacy policy</Link> explains exactly what is stored and how to disconnect.
        </p>
        <p>
          Already a client or a member of the team? <Link href="/workspace">Sign in</Link>.
        </p>
      </ProsePage>
      <ConsultCta />
    </>
  );
}

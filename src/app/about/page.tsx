import Link from 'next/link';
import { PublicPage } from '@/components/public/public-page';

export const metadata = { title: 'About' };

/** Public home page: what Relay is, for visitors and for Google's OAuth review. */
export default function AboutPage() {
  return (
    <PublicPage title="Customer acquisition and business automation">
      <p>Relay has two parts.</p>
      <h2>Relay Intelligence</h2>
      <p>AI-assisted business discovery, research, lead qualification and customer acquisition. A team uses it to:</p>
      <ul>
        <li>find businesses that match an ideal customer profile, from public sources and business data providers;</li>
        <li>research each account from its own website, with every claim tied to its source and checked before use;</li>
        <li>run email campaigns from the team&apos;s own mailboxes, with sending limits, opt-out links and a suppression list that is always honoured;</li>
        <li>work a call queue, book meetings, and send proposals.</li>
      </ul>
      <h2>Relay Studio</h2>
      <p>
        Custom business automation: reusable solutions configured into applications for each customer, deployed with testing and
        approval steps, and supported on a recurring basis. Customers see their applications and results in a client portal.
      </p>
      <h2>Gmail</h2>
      <p>
        A team member can connect a Gmail or Google Workspace mailbox so campaigns send from that address. Relay asks Google only for
        permission to send email and to confirm the address. It cannot read, search or delete anything in the inbox. The{' '}
        <Link href="/privacy">privacy policy</Link> explains exactly what is stored and how to disconnect.
      </p>
      <p>
        Already have an account? <Link href="/sign-in">Sign in to your workspace</Link>.
      </p>
    </PublicPage>
  );
}

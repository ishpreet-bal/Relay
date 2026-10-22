import Link from 'next/link';
import { PublicPage } from '@/components/public/public-page';

export const metadata = { title: 'About' };

/** Public home page: what Relay is, for visitors and for Google's OAuth review. */
export default function AboutPage() {
  return (
    <PublicPage title="Outbound sales for B2B companies">
      <p>
        Relay is a workspace for finding the right business accounts, researching them, and reaching out to them properly.
        A team uses it to:
      </p>
      <ul>
        <li>find businesses that match an ideal customer profile, from public sources and business data providers;</li>
        <li>research each account from its own website, with every claim tied to its source and checked before use;</li>
        <li>run email campaigns from the team&apos;s own mailboxes, with sending limits, opt-out links and a suppression list that is always honoured;</li>
        <li>work a call queue, book meetings, and send proposals;</li>
        <li>give clients a portal to see their results and the applications built for them.</li>
      </ul>
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

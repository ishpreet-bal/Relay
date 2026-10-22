import { PublicPage } from '@/components/public/public-page';

export const metadata = { title: 'Privacy policy' };

const UPDATED = 'October 22, 2026';

/**
 * The privacy policy, public so Google's OAuth consent screen can link to it.
 * It describes what the code actually does; change it when the code changes.
 */
export default function PrivacyPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL;
  return (
    <PublicPage title="Privacy policy" eyebrow={`Relay · updated ${UPDATED}`}>
      <p>
        This policy explains what information Relay handles, why, who it is shared with, and the choices you have. It covers people
        who use Relay (a workspace&apos;s team members and its clients&apos; portal users) and the business contacts a workspace reaches out to.
      </p>

      <h2>Information we handle</h2>
      <ul>
        <li><strong>Your account.</strong> Your name, email address and sign-in details, managed by our authentication provider, plus a record of the changes you make in a workspace (an audit log).</li>
        <li><strong>Business accounts and contacts.</strong> Company names, websites, addresses, phone numbers and industry details, and the names, job titles and work email addresses or phone numbers of people at those companies. These come from public sources (such as a company&apos;s own website), from business data providers, or from a workspace&apos;s own imports. Each value records where it came from and when.</li>
        <li><strong>Research.</strong> Summaries of public information about a company, written with the help of AI models and checked against their sources before they are used.</li>
        <li><strong>Outreach.</strong> The emails a workspace sends, their delivery status (including opens, clicks, bounces and replies when the email provider reports them), call notes, meetings and proposals.</li>
        <li><strong>Opt-outs.</strong> When someone unsubscribes, their address goes on a suppression list so they are never emailed again by that workspace.</li>
        <li><strong>Demo sites.</strong> When someone visits a demo site Relay hosts, we record the visit using a one-way hash of their IP address and browser. We do not store the raw IP address.</li>
        <li><strong>Billing.</strong> Payments are handled by our payment processor. Relay never sees or stores card numbers.</li>
      </ul>

      <h2>Gmail and Google user data</h2>
      <p>
        A workspace member can connect a Gmail or Google Workspace mailbox so that campaigns send from that address. When they do,
        Relay asks Google for these permissions only:
      </p>
      <ul>
        <li><strong>Send email on your behalf</strong> (<code>gmail.send</code>), used only to send the campaign emails your workspace has approved or scheduled from that mailbox;</li>
        <li><strong>Your email address</strong> (<code>openid</code>, <code>email</code>), used only to confirm that the Google account you connect matches the mailbox&apos;s sending address.</li>
      </ul>
      <p>
        Relay cannot read, search, label or delete the messages in your inbox, and it does not access your contacts, calendar or files.
        We store the connected Google address, the permissions granted, the time of connection, and a refresh token encrypted with
        AES-256-GCM. Access tokens are requested for each send and are never stored. Google user data is not sold, not used for
        advertising, not sent to AI providers, not used to train AI models, and not read by people except where you ask us to for
        support, where security requires it, or where the law requires it.
      </p>
      <p>
        You can disconnect at any time with <strong>Disconnect Gmail</strong> under Settings › Sending mailboxes. That revokes Relay&apos;s
        access at Google and deletes the stored token. You can also remove Relay&apos;s access from your Google account at{' '}
        <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
      </p>
      <p>
        Relay&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the
        Limited Use requirements.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>to provide the service a workspace has signed up for: finding and researching accounts, sending its outreach, and reporting results;</li>
        <li>to honour opt-outs and keep sending within legal and provider limits, including Canada&apos;s Anti-Spam Legislation (CASL);</li>
        <li>to keep the service secure, investigate problems, and bill for it.</li>
      </ul>
      <p>We do not sell personal information, and one workspace&apos;s data is never shown to another.</p>

      <h2>Who we share it with</h2>
      <p>We use service providers to run Relay. They process information only to provide their service to us:</p>
      <ul>
        <li>hosting and database: Vercel (application, United States) and Supabase (database, Canada);</li>
        <li>sign-in: Clerk;</li>
        <li>AI models for research and drafting: Anthropic, and OpenAI only if a workspace enables it as a fallback;</li>
        <li>email delivery: Google (for connected Gmail mailboxes) and Resend;</li>
        <li>business data and email-address checks: Google Places, Apollo, Hunter and ZeroBounce;</li>
        <li>payments: Stripe.</li>
      </ul>
      <p>Some of these providers process information outside Canada, including in the United States.</p>

      <h2>Keeping it safe and how long we keep it</h2>
      <p>
        Data is encrypted in transit, and secrets such as mail-provider tokens are also encrypted at rest. Access inside a workspace
        follows each person&apos;s role and the clients they are assigned to. We keep information while the workspace that holds it is
        active, and delete it when it is no longer needed or on request. Some data providers only let us keep certain values for a
        limited time; Relay removes those automatically. Opt-outs are kept so they keep being honoured.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Use the unsubscribe link in any email sent through Relay. It works immediately, with no sign-in.</li>
        <li>Ask to see, correct or delete information about you{contact ? <> by emailing <a href={`mailto:${contact}`}>{contact}</a></> : ' by replying to any email you received through Relay'}.</li>
        <li>Disconnect a Gmail mailbox as described above.</li>
      </ul>

      <h2>Changes</h2>
      <p>If this policy changes, we will update the date at the top of this page.</p>
    </PublicPage>
  );
}

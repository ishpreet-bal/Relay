import Link from 'next/link';
import { CreateOrganization, SignOutButton } from '@clerk/nextjs';
import { currentUser } from '@clerk/nextjs/server';
import { mayCreateWorkspace } from '@/server/services/workspace-access';

export const metadata = { title: 'Set up your workspace' };
export const dynamic = 'force-dynamic';

/**
 * Reached by a signed-in person with no workspace. Relay is invite-only, so
 * most people who land here signed up without an invitation: they are told
 * so, not handed a workspace. The webhook enforces the same rule.
 */
export default async function OnboardingPage() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const decision = await mayCreateWorkspace(email);

  if (!decision.allowed) {
    return (
      <main className="min-h-screen grid place-items-center bg-canvas px-4">
        <div className="w-full max-w-md">
          <p className="eyebrow mb-3">Invitation needed</p>
          <h1 className="text-2xl font-semibold mb-2">Your account isn’t linked to a workspace yet</h1>
          <p className="text-sm text-muted mb-6">
            Relay workspaces are by invitation. If you were invited, open the link in your invitation email
            {email ? <> (sent to the address you were invited on; you are signed in as <span className="font-medium text-ink">{email}</span>)</> : null}.
            If you’re looking for help with your business, book a free consultation and we’ll set you up.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/contact" className="btn-primary">Book a free consultation</Link>
            <SignOutButton redirectUrl="/"><button type="button" className="btn-outline">Sign out</button></SignOutButton>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center bg-canvas px-4">
      <div className="w-full max-w-md">
        <p className="eyebrow mb-3">Workspace setup</p>
        <h1 className="text-2xl font-semibold mb-2">Name your workspace</h1>
        <p className="text-sm text-muted mb-6">
          The workspace holds your clients, their accounts and campaigns, and your sending
          domains. Teammates and client users you invite later join it.
        </p>
        <CreateOrganization
          afterCreateOrganizationUrl="/workspace"
          skipInvitationScreen={false}
          appearance={{ elements: { card: 'shadow-card border border-hairline' } }}
        />
      </div>
    </main>
  );
}

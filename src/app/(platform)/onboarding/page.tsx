import { CreateOrganization } from '@clerk/nextjs';

export const metadata = { title: 'Set up your workspace' };

export default function OnboardingPage() {
  return (
    <main className="min-h-screen grid place-items-center bg-canvas px-4">
      <div className="w-full max-w-md">
        <p className="eyebrow mb-3">Step 1 of 2</p>
        <h1 className="text-2xl font-semibold mb-2">Name your workspace</h1>
        <p className="text-sm text-muted mb-6">
          The workspace holds your clients, their accounts and campaigns, and your sending
          domains. Teammates and client users you invite later join it.
        </p>
        <CreateOrganization
          afterCreateOrganizationUrl="/dashboard"
          skipInvitationScreen={false}
          appearance={{ elements: { card: 'shadow-card border border-hairline' } }}
        />
      </div>
    </main>
  );
}

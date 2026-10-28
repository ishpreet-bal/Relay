import type { SignIn } from '@clerk/nextjs';

/**
 * Clerk's sign-in and sign-up forms in the website's colours and type.
 * Clerk keeps its own step titles ("Check your email" and so on), so the
 * card header stays; it is only restyled. The `!` classes override the
 * styles Clerk injects at runtime.
 */
export const clerkAppearance: React.ComponentProps<typeof SignIn>['appearance'] = {
  layout: { logoPlacement: 'none', socialButtonsVariant: 'blockButton', socialButtonsPlacement: 'top', shimmer: false },
  variables: {
    colorPrimary: '#2450F0',
    colorPrimaryForeground: '#FFFFFF',
    colorForeground: '#0B1220',
    colorMutedForeground: '#5A6070',
    colorMuted: '#F5F1EA',
    colorBackground: '#FFFFFF',
    colorInput: '#FFFFFF',
    colorInputForeground: '#0B1220',
    colorBorder: '#DCD4C5',
    colorRing: '#2450F0',
    colorShadow: '#0B1220',
    colorDanger: '#B4382A',
    borderRadius: '0.75rem',
    fontFamily: 'var(--font-body), system-ui, sans-serif',
    fontFamilyButtons: 'var(--font-body), system-ui, sans-serif',
    fontSize: '0.9375rem',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: '!w-full !max-w-none !rounded-[1.25rem] !border !border-site-rule !shadow-[0_40px_80px_-48px_rgba(11,18,32,0.5)]',
    card: '!shadow-none !px-6 !py-8 sm:!px-9',
    headerTitle: '!text-[1.45rem] !font-semibold !tracking-[-0.035em] !text-site-night',
    headerSubtitle: '!text-site-fog',
    socialButtonsBlockButton: '!h-11 !shadow-[0_0_0_1px_#DCD4C5,0_1px_2px_rgba(11,18,32,0.06)] hover:!bg-site-paper',
    dividerLine: '!bg-site-rule',
    formFieldLabel: '!font-medium !text-site-night',
    formFieldInput: '!h-11 !shadow-[0_0_0_1px_#DCD4C5] hover:!shadow-[0_0_0_1px_#B9AE99] focus:!shadow-[0_0_0_1px_#2450F0,0_0_0_4px_rgba(36,80,240,0.15)]',
    formButtonPrimary: '!h-11 !text-[0.95rem] !font-medium !normal-case !shadow-[0_12px_24px_-14px_rgba(36,80,240,0.9)] hover:!bg-[#1D43D4]',
    footer: '!bg-none !bg-site-chalk',
    footerActionText: '!text-site-fog',
    footerActionLink: '!font-medium !text-site-signal hover:!text-site-night',
  },
};

import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Channels are space-separated RGB so opacity modifiers keep working:
        // bg-surface/60, text-ink/70, etc.
        ink: 'rgb(var(--ink) / <alpha-value>)',
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
        // Gate states — these mirror GateVerdict, not a generic status palette.
        cleared: 'rgb(var(--cleared) / <alpha-value>)',
        held: 'rgb(var(--held) / <alpha-value>)',
        blocked: 'rgb(var(--blocked) / <alpha-value>)',
        // The public website's palette (src/app/(site)); never used in the app.
        site: {
          night: '#0B1220',   // midnight, dark sections and text on light
          deep: '#121B2E',    // raised surfaces on dark
          seam: '#26324A',    // lines on dark
          paper: '#F5F1EA',   // warm off-white page
          sand: '#ECE6DA',    // alternate light band
          chalk: '#FBF9F5',   // cards on light
          rule: '#DCD4C5',    // lines on light
          fog: '#5A6070',     // secondary text on light (5.6:1 on paper)
          haze: '#9AA4B8',    // secondary text on dark (7.5:1 on night)
          signal: '#2450F0',  // electric blue on light (5.4:1; white on it 6:1)
          spark: '#7C98FF',   // electric blue on dark (7:1)
          tide: '#0FB5A0',    // "running" states, graphics only on light
          coral: '#FF7A59',   // restrained second accent
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      fontSize: {
        eyebrow: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.09em' }],
        micro: ['0.75rem', { lineHeight: '1.1rem' }],
      },
      letterSpacing: { display: '-0.028em' },
      borderRadius: { card: '10px' },
      boxShadow: {
        card: '0 1px 2px rgb(8 14 26 / 0.06), 0 8px 24px -12px rgb(8 14 26 / 0.18)',
        pop: '0 12px 40px -12px rgb(8 14 26 / 0.35)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'meter-fill': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
      },
      animation: {
        'fade-up': 'fade-up 200ms cubic-bezier(0.2, 0, 0, 1) both',
        'meter-fill': 'meter-fill 520ms cubic-bezier(0.2, 0, 0, 1) both',
      },
    },
  },
} satisfies Config;

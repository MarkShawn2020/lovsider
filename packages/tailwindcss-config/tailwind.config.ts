import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        text: {
          main: 'var(--color-text-main)',
          faded: 'var(--color-text-faded)',
        },
        background: {
          main: 'var(--color-background-main)',
          dark: 'var(--color-background-dark)',
          ivory: {
            medium: 'var(--color-background-ivory-medium)',
          },
          oat: 'var(--color-background-oat)',
          clay: 'var(--color-background-clay)',
          faded: 'var(--color-background-faded)',
        },
        border: {
          default: 'var(--color-border-default)',
        },
        swatch: {
          slate: {
            light: 'var(--color-swatch-slate-light)',
          },
          cloud: {
            light: 'var(--color-swatch-cloud-light)',
          },
          fig: 'var(--color-swatch-fig)',
          olive: 'var(--color-swatch-olive)',
          cactus: 'var(--color-swatch-cactus)',
          sky: 'var(--color-swatch-sky)',
          heather: 'var(--color-swatch-heather)',
        },
      },
      fontFamily: {
        sans: ['Fira Code', 'ui-old-sans-serif', 'system-ui-old', 'sans-serif'],
        serif: ['ui-old-serif', 'Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
      },
      spacing: {
        text: '1rem',
        gutter: '2rem',
        s: '1rem',
        m: '1.5rem',
        l: '3rem',
        xl: '4rem',
        xxl: '6rem',
      },
      borderRadius: {
        md: '0.75rem',
        lg: '1.5rem',
        full: '9999px',
      },
      boxShadow: {
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
} as Omit<Config, 'content'>;

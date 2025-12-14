import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // shadcn 风格语义化颜色（推荐使用）
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        // 旧版兼容（逐步废弃）
        text: {
          main: 'var(--color-text-main)',
          faded: 'var(--color-text-faded)',
        },
        'background-legacy': {
          main: 'var(--color-background-main)',
          dark: 'var(--color-background-dark)',
          ivory: {
            medium: 'var(--color-background-ivory-medium)',
          },
          oat: 'var(--color-background-oat)',
          clay: 'var(--color-background-clay)',
          faded: 'var(--color-background-faded)',
        },
        'border-legacy': {
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
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
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
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
} as Omit<Config, 'content'>;

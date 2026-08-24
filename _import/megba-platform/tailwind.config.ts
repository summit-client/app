import type { Config } from "tailwindcss";

/**
 * MEGBA design tokens.
 *
 * Colours are exposed as CSS variables (see globals.css) so that the
 * accessibility "high contrast" mode and future white-label theming can
 * override them at runtime without a rebuild. Tailwind classes reference the
 * variables via hsl(var(--token)).
 */
const config: Config = {
  darkMode: ["class", '[data-contrast="high"]'],
  content: [
    "./src/app/**/*.{ts,tsx,mdx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/content/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1.25rem",
        lg: "2rem",
      },
      screens: {
        "2xl": "1240px",
      },
    },
    extend: {
      colors: {
        // Brand palette. The `/ <alpha-value>` placeholder lets Tailwind's
        // opacity modifiers (e.g. bg-forest/5) work against CSS-variable HSL.
        forest: {
          DEFAULT: "hsl(var(--forest) / <alpha-value>)",
          50: "hsl(var(--forest-50) / <alpha-value>)",
          100: "hsl(var(--forest-100) / <alpha-value>)",
          600: "hsl(var(--forest-600) / <alpha-value>)",
          700: "hsl(var(--forest-700) / <alpha-value>)",
          900: "hsl(var(--forest-900) / <alpha-value>)",
        },
        sage: {
          DEFAULT: "hsl(var(--sage) / <alpha-value>)",
          100: "hsl(var(--sage-100) / <alpha-value>)",
          300: "hsl(var(--sage-300) / <alpha-value>)",
          500: "hsl(var(--sage-500) / <alpha-value>)",
        },
        ivory: "hsl(var(--ivory) / <alpha-value>)",
        stone: {
          DEFAULT: "hsl(var(--stone) / <alpha-value>)",
          200: "hsl(var(--stone-200) / <alpha-value>)",
          300: "hsl(var(--stone-300) / <alpha-value>)",
        },
        charcoal: "hsl(var(--charcoal) / <alpha-value>)",
        ember: {
          DEFAULT: "hsl(var(--ember) / <alpha-value>)",
          600: "hsl(var(--ember-600) / <alpha-value>)",
        },
        maple: {
          DEFAULT: "hsl(var(--maple) / <alpha-value>)",
          600: "hsl(var(--maple-600) / <alpha-value>)",
        },
        // Semantic tokens.
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        border: "hsl(var(--border) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      maxWidth: {
        reading: "var(--reading-width, 68ch)",
      },
      letterSpacing: {
        eyebrow: "0.18em",
      },
      boxShadow: {
        // Minimal, border-like elevation — operational software, not floating cards.
        card: "0 1px 2px rgba(20, 38, 27, 0.05)",
        lift: "0 2px 6px -2px rgba(20, 38, 27, 0.12)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.5s ease both",
      },
    },
  },
  plugins: [],
};

export default config;

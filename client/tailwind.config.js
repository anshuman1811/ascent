/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    screens: {
      landscape: { raw: '(orientation: landscape)' },
      portrait:  { raw: '(orientation: portrait)' },
      // Compound mobile-nav variants: each compiles to a single media query
      // combining orientation + max-width, so there's no cross-rule cascade
      // race with lg: utilities (Tailwind's auto max-lg derivation doesn't
      // kick in once raw-query screens like landscape/portrait are present).
      'mobile-landscape': { raw: '(orientation: landscape) and (max-width: 1023.98px)' },
      'mobile-portrait':  { raw: '(orientation: portrait) and (max-width: 1023.98px)' },
      sm:  '640px',
      md:  '768px',
      lg:  '1024px',
      xl:  '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        user1: { DEFAULT: '#6366f1', light: '#818cf8', dark: '#4f46e5' },
        user2: { DEFAULT: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
      },
    },
  },
  plugins: [],
};

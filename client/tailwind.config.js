/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        landscape: { raw: '(orientation: landscape)' },
        portrait:  { raw: '(orientation: portrait)' },
      },
      colors: {
        user1: { DEFAULT: '#6366f1', light: '#818cf8', dark: '#4f46e5' },
        user2: { DEFAULT: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
      },
    },
  },
  plugins: [],
};

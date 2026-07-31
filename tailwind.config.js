/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Values mirror src/styles/tokens.css. tokens.css is the source of truth
      // (it also carries the light-theme overrides); these names exist so
      // Tailwind utilities can reach the palette. Prefer var(--…) in components
      // for anything that must flip between themes.
      colors: {
        deep: '#0B1220',
        surface: '#151E2E',
        raised: '#1E2A3C',
        line: '#2A3850',
        hi: '#F1F5F9',
        lo: '#8A9AB0',
        optic: '#D7F205',
        court: '#1B9AAA',
        clay: '#FF5C39',
        gold: '#E7B94F',
      },
      fontFamily: {
        display: ["'Archivo'", 'system-ui', 'sans-serif'],
        sans: ["'Inter'", 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

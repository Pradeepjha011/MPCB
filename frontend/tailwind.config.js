/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef8ff',
          500: '#1483f5',
          700: '#0f5fb5'
        }
      }
    }
  },
  plugins: []
};
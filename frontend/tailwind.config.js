/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#E7F0FE',
          100: '#D3E4FD',
          200: '#A9C9FB',
          500: '#1877F2',
          600: '#166FE0',
          700: '#1259C4',
          800: '#0E46A0',
          900: '#0B3A85',
        },
        softblue: '#E7F0FE',
        canvas: '#F6F7F9',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg,#1877F2 0%,#166FE0 100%)',
      },
    },
  },
  plugins: [],
};

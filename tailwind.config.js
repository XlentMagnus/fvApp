/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.{html,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        club: {
          black: '#0a0a0a',
          yellow: '#EAB308',
          'yellow-dark': '#CA9A04',
        },
      },
    },
  },
  plugins: [],
};

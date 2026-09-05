/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Rovique', 'sans-serif'],
        mono: ['Rovique', 'monospace'],
      },
      colors: {
        neu: {
          yellow: '#f7fa99',
          green: '#eafed0',
          pink: '#fce5bf',
          blue: '#fce5bf',
          orange: '#fce5bf',
          red: '#621d1d',
          safe: '#e4fee1',
          white: '#FAFAFA',
          'off-white': '#fcefbd',
          black: '#000000',
        },
      },
      boxShadow: {
        'neu': '8px 8px 0px rgba(0, 0, 0, 1)',
        'neu-sm': '4px 4px 0px rgba(0, 0, 0, 1)',
        'neu-lg': '12px 12px 0px rgba(0, 0, 0, 1)',
        'neu-hover': '2px 2px 0px rgba(0, 0, 0, 1)',
        'neu-xs': '3px 3px 0px rgba(0, 0, 0, 1)',
      },
      borderWidth: {
        '3': '3px',
      },
    },
  },
  plugins: [],
}

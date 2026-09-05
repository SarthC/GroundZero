/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      colors: {
        neu: {
          yellow: '#FFE600',
          green: '#AEFF00',
          pink: '#FF6EC7',
          blue: '#00D4FF',
          orange: '#FF9E00',
          red: '#FF3333',
          safe: '#00CC66',
          white: '#FAFAFA',
          'off-white': '#F0F0F0',
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

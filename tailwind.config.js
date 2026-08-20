/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#1a1b1e',
        surface: '#25262b',
        border: '#373a40',
        text: '#c9d1d9',
        muted: '#6e7681',
        accent: '#7950f2',
        success: '#2f9e44',
        warning: '#f08c00',
        danger: '#e03131',
        info: '#1971c2',
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F172A', // Glossy obsidian black
          dark: '#020617',
          light: '#F8FAFC',
          accent: '#10B981', // Emerald active accent
        },
        background: '#FAFAFA', // Rich crisp white background
        surface: '#FFFFFF',
        glossyBlack: '#0F172A', // Premium obsidian black
        text: {
          main: '#0F172A',
          secondary: '#475569',
          muted: '#64748B',
          light: '#FFFFFF',
        },
        border: '#E2E8F0',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#F43F5E',
      },
      borderRadius: {
        'xl': '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
}

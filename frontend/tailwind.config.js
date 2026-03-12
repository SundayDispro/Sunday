/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        monday: {
          green:        '#00c875',
          orange:       '#fdab3d',
          red:          '#e2445c',
          blue:         '#0073ea',
          darkBlue:     '#5559df',
          purple:       '#6e3cbb',
          gray:         '#c4c4c4',
          bg:           '#f6f7fb',
          text:         '#323338',
          subtext:      '#676879',
          border:       '#d0d4e4',
          hover:        '#e6e9ef',
          sidebar:      '#1d2a4b',
          sidebarHover: '#2a3655',
          sidebarPanel: '#f5f6fa',
          pill:         '#e8ecf5',
        }
      },
      fontFamily: {
        sans: ['"Averta Std"', 'Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
        averta: ['"Averta Std"', 'Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'monday-sm':  '0 1px 4px rgba(0,0,0,0.08)',
        'monday-md':  '0 4px 16px rgba(0,0,0,0.10)',
        'monday-lg':  '0 8px 32px rgba(0,0,0,0.14)',
        'monday-panel': '-4px 0 24px rgba(0,0,0,0.08)',
      },
      borderRadius: {
        'monday': '6px',
      }
    },
  },
  plugins: [],
}

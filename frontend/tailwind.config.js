/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
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
          /* Semánticos: definidos por variables CSS según data-theme */
          bg:           'var(--monday-bg)',
          surface:      'var(--monday-surface)',
          text:         'var(--monday-text)',
          subtext:      'var(--monday-subtext)',
          border:       'var(--monday-border)',
          hover:        'var(--monday-hover)',
          sidebar:      'var(--monday-sidebar)',
          sidebarHover: 'var(--monday-sidebarHover)',
          sidebarPanel: 'var(--monday-sidebarPanel)',
          pill:         'var(--monday-pill)',
        }
      },
      fontFamily: {
        sans: ['"Averta Std"', 'Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
        averta: ['"Averta Std"', 'Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'monday-sm':  'var(--monday-shadow-sm)',
        'monday-md':  'var(--monday-shadow-md)',
        'monday-lg':  'var(--monday-shadow-lg)',
        'monday-panel': 'var(--monday-shadow-panel)',
      },
      borderRadius: {
        'monday': '6px',
      }
    },
  },
  plugins: [],
}

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
      },
      transitionDuration: {
        150: '150ms',
        200: '200ms',
        250: '250ms',
      },
      transitionTimingFunction: {
        'monday': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.92)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
}

import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#10253F',
          orange: '#EE964B',
          cream: '#F7F1E5',
          green: '#3C7A57'
        }
      }
    }
  },
  plugins: []
} satisfies Config;

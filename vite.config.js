import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone` serves over HTTPS on your local network so the
// camera and GPS work when you open the app on your phone.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), mode === 'phone' && basicSsl()].filter(Boolean),
}));

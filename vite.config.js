import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    return ({
        plugins: mode === 'test' ? [react()] : [cloudflare(), react()],
    });
});

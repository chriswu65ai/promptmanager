import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { handleSupabaseSetupRoute } from './server/routes/setupSupabase';

function setupApiPlugin(): Plugin {
  return {
    name: 'setup-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleSupabaseSetupRoute(req, res);
        if (!handled) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleSupabaseSetupRoute(req, res);
        if (!handled) next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), setupApiPlugin()],
});

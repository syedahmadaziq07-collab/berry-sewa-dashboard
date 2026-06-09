import { createServer as createViteServer } from 'vite';
import type { Express } from 'express';

export async function setupViteDevServer(app: Express): Promise<void> {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

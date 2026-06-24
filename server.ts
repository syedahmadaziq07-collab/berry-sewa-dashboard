import app from './src/app';
import path from 'path';
import fs from 'fs';

const PORT = Number(process.env.PORT) || 3000;

async function startDevServer() {
  if (process.env.NODE_ENV !== "production") {
    const { setupViteDevServer } = await import("./server/vite-dev");
    await setupViteDevServer(app);
  } else {
    const clientDist = path.resolve(process.cwd(), "dist", "client");

    console.log("[startup] NODE_ENV:", process.env.NODE_ENV);
    console.log("[startup] Serving clientDist:", clientDist);
    console.log("[startup] clientDist exists:", fs.existsSync(clientDist));
    console.log("[startup] index.html exists:", fs.existsSync(path.join(clientDist, "index.html")));
    console.log("[startup] assets dir exists:", fs.existsSync(path.join(clientDist, "assets")));

    app.use((await import('express')).default.static(clientDist, {
      index: false,
      maxAge: "1y",
      immutable: true,
    }));

    app.get('*', (req, res) => {
      const ext = path.extname(req.path).toLowerCase();
      if (ext && ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Berry Store Rental Server running on http://localhost:${PORT}`);
  });
}

startDevServer();

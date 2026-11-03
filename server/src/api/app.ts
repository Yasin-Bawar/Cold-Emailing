import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { api } from './routes.ts';
import { unsub } from './unsubscribe.ts';
import { login, logout, requireAuth, requireToken } from './auth.ts';
import { handleMcp } from '../mcp/server.ts';
import { db } from '../core/db.ts';
import { checkFileSig } from '../core/crypto.ts';
import { getFile, contentTypeFor } from '../core/storage.ts';

export const buildApp = () => {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.get('/health', async (_req, res) => {
    try { await db()`select 1`; res.json({ ok: true }); } catch (e) { res.status(503).json({ ok: false, error: (e as Error).message }); }
  });

  app.use(unsub);

  // Signed image links (see signedFileUrl).
  app.get('/files/*path', async (req, res) => {
    const p = ([] as string[]).concat((req.params as any).path).join('/');
    if (!checkFileSig(p, String(req.query.exp || ''), String(req.query.sig || ''))) return res.status(403).send('Link expired');
    try {
      const bytes = await getFile(p);
      res.setHeader('Content-Type', contentTypeFor(p));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(bytes);
    } catch {
      res.status(404).send('Not found');
    }
  });

  // MCP endpoint for Claude (Bearer API token).
  app.post('/mcp', requireToken, express.json({ limit: '25mb' }), handleMcp);
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST (stateless server).' }, id: null }));

  app.post('/api/login', express.json({ limit: '10kb' }), login);
  app.post('/api/logout', logout);
  app.use('/api', requireAuth, express.json({ limit: '25mb' }), api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // The dashboard (web/dist), with client-side routing.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../web/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.type('text').send('API is running. Build the dashboard with: pnpm --filter web build'));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') });
    const msg = (err as Error)?.message || 'Server error';
    const status = (err as any)?.status || (/not found/i.test(msg) ? 404 : /only |give |already |can't|refus/i.test(msg) ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: msg });
  });
  return app;
};

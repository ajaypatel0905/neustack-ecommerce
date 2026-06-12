import path from 'node:path';
import express, { Express, NextFunction, Request, Response } from 'express';
import { StoreService } from '../services/storeService';
import { buildRouter } from './routes';
import { errorHandler } from './errorHandler';

/** Static demo client lives in /public at the repo root. */
const PUBLIC_DIR = path.resolve(__dirname, '../../public');

/**
 * Builds the Express app around a given StoreService. Taking the service as an
 * argument (rather than constructing it here) is what lets tests inject a fresh
 * in-memory store per test and lets the bootstrap wire production config —
 * classic dependency injection at the composition root.
 */
export function createApp(service: StoreService): Express {
  const app = express();
  app.use(express.json());

  app.use('/api', buildRouter(service));

  // Serve the static demo storefront at the root.
  app.use(express.static(PUBLIC_DIR));

  // 404 for anything unmatched, expressed in the same error envelope.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Centralized error mapping (must be last, and keep the 4-arg signature).
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) =>
    errorHandler(err, req, res, next),
  );

  return app;
}

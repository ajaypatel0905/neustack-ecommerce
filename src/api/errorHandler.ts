import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { DomainError, DomainErrorCode } from '../domain/errors';

/**
 * The single seam that maps internal errors to HTTP. The domain throws typed
 * DomainErrors with no HTTP knowledge; this is the only place that decides a
 * status code, so the mapping is explicit, centralized, and easy to audit.
 */

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  CART_NOT_FOUND: 404,
  PRODUCT_NOT_FOUND: 404,
  DISCOUNT_CODE_NOT_FOUND: 404,
  EMPTY_CART: 422,
  INVALID_QUANTITY: 422,
  CART_ALREADY_CHECKED_OUT: 409,
  DISCOUNT_CODE_ALREADY_USED: 409,
  DISCOUNT_NOT_ELIGIBLE: 409,
};

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

function body(code: string, message: string, details?: unknown): ErrorBody {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

// Express needs the 4-arg signature to recognize this as an error handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json(
      body(
        'VALIDATION_ERROR',
        'Request body failed validation',
        err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      ),
    );
    return;
  }

  if (err instanceof DomainError) {
    res.status(STATUS_BY_CODE[err.code] ?? 400).json(body(err.code, err.message));
    return;
  }

  // Unknown/unexpected error: log server-side, return a safe generic message.
  console.error('Unhandled error:', err);
  res.status(500).json(body('INTERNAL_ERROR', 'An unexpected error occurred'));
}

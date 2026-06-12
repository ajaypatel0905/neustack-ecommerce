import { Request, Response, Router } from 'express';
import { StoreService } from '../services/storeService';
import { addItemSchema, checkoutSchema } from './validation';
import { serializeCart, serializeOrder, serializeProduct, serializeStats } from './serializers';

/**
 * HTTP routing. Handlers are intentionally thin: parse/validate input, call one
 * service method, serialize the result. All business rules live in the service
 * and domain. Synchronous throws (Zod or DomainError) propagate to the central
 * errorHandler, so handlers contain no try/catch noise.
 */
export function buildRouter(service: StoreService): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // --- Catalog ---
  router.get('/products', (_req: Request, res: Response) => {
    res.json({ products: service.listProducts().map(serializeProduct) });
  });

  // --- Cart ---
  router.post('/carts', (_req: Request, res: Response) => {
    res.status(201).json(serializeCart(service.createCart()));
  });

  router.get('/carts/:cartId', (req: Request, res: Response) => {
    res.json(serializeCart(service.getCart(req.params.cartId)));
  });

  router.post('/carts/:cartId/items', (req: Request, res: Response) => {
    const { productId, quantity } = addItemSchema.parse(req.body);
    const cart = service.addItemToCart(req.params.cartId, productId, quantity);
    res.status(200).json(serializeCart(cart));
  });

  // --- Checkout ---
  router.post('/carts/:cartId/checkout', (req: Request, res: Response) => {
    const { discountCode } = checkoutSchema.parse(req.body ?? {});
    const idempotencyKey = req.header('Idempotency-Key') ?? undefined;
    const order = service.checkout(req.params.cartId, {
      ...(discountCode ? { discountCode } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    res.status(201).json(serializeOrder(order));
  });

  // --- Admin ---
  router.post('/admin/discount-codes', (_req: Request, res: Response) => {
    const code = service.generateDiscountCode();
    res.status(201).json({
      code: code.code,
      percentage: code.percentage,
      orderSequenceIssuedFor: code.orderSequenceIssuedFor,
      used: code.used,
    });
  });

  router.get('/admin/stats', (_req: Request, res: Response) => {
    res.json(serializeStats(service.getStats()));
  });

  return router;
}

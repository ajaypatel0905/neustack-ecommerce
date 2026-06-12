import { z } from 'zod';

/**
 * Request schemas live at the API boundary. Validating here means the service
 * and domain can trust their inputs and focus purely on business rules. Each
 * schema is strict (`.strict()`) so unexpected fields are rejected rather than
 * silently ignored — a small but real defense against typo'd payloads.
 */

export const addItemSchema = z
  .object({
    productId: z.string().min(1, 'productId is required'),
    quantity: z.number().int().positive('quantity must be a positive integer'),
  })
  .strict();

export const checkoutSchema = z
  .object({
    discountCode: z.string().min(1).optional(),
  })
  .strict();

export type AddItemBody = z.infer<typeof addItemSchema>;
export type CheckoutBody = z.infer<typeof checkoutSchema>;

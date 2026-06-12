/**
 * Domain-level error taxonomy.
 *
 * The domain and service layers are framework-agnostic: they must not know
 * about HTTP. Instead they throw typed `DomainError`s carrying a stable,
 * machine-readable `code`. The API layer (and only the API layer) maps each
 * code to an HTTP status. This keeps business rules portable and makes the
 * error contract explicit and testable. See DECISIONS.md.
 */

export type DomainErrorCode =
  | 'CART_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'EMPTY_CART'
  | 'INVALID_QUANTITY'
  | 'CART_ALREADY_CHECKED_OUT'
  | 'DISCOUNT_CODE_NOT_FOUND'
  | 'DISCOUNT_CODE_ALREADY_USED'
  | 'DISCOUNT_NOT_ELIGIBLE';

export class DomainError extends Error {
  public readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'DomainError';
    // Restore prototype chain for instanceof checks after transpilation.
    Object.setPrototypeOf(this, DomainError.prototype);
  }
}

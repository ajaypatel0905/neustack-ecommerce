import { createApp } from './api/app';
import { loadConfig } from './config';
import { SEED_PRODUCTS } from './data/catalog';
import { InMemoryStore } from './repository/inMemoryStore';
import { StoreService } from './services/storeService';

/**
 * Composition root: this is the only place that wires concrete implementations
 * together. Swapping the in-memory store for a real database would happen here
 * and nowhere else.
 */
function main(): void {
  const config = loadConfig();
  const store = new InMemoryStore(SEED_PRODUCTS);
  const service = new StoreService(store, config);
  const app = createApp(service);

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`Ecommerce API listening on http://localhost:${port}`);
    console.log(`Reward rule: 1 coupon of ${config.discountPercentage}% per ${config.nthOrder} orders`);
  });
}

main();

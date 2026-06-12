import request from 'supertest';
import { createApp } from '../../src/api/app';
import { StoreConfig } from '../../src/config';
import { SEED_PRODUCTS } from '../../src/data/catalog';
import { InMemoryStore } from '../../src/repository/inMemoryStore';
import { StoreService } from '../../src/services/storeService';

const CONFIG: StoreConfig = { nthOrder: 2, discountPercentage: 10 };

function buildApp() {
  const service = new StoreService(new InMemoryStore(SEED_PRODUCTS), CONFIG);
  return createApp(service);
}

async function createCartWithItem(app: ReturnType<typeof buildApp>, productId = 'p_tshirt', quantity = 1) {
  const created = await request(app).post('/api/carts').expect(201);
  const cartId = created.body.id as string;
  await request(app).post(`/api/carts/${cartId}/items`).send({ productId, quantity }).expect(200);
  return cartId;
}

describe('API', () => {
  it('lists seed products', async () => {
    const res = await request(buildApp()).get('/api/products').expect(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body.products[0]).toHaveProperty('priceCents');
  });

  it('runs the full happy path: cart -> checkout -> earn code -> redeem', async () => {
    const app = buildApp();

    // Order 1
    const cart1 = await createCartWithItem(app);
    await request(app).post(`/api/carts/${cart1}/checkout`).send({}).expect(201);

    // Order 2 -> reaches the n=2 milestone
    const cart2 = await createCartWithItem(app, 'p_mug', 1);
    await request(app).post(`/api/carts/${cart2}/checkout`).send({}).expect(201);

    // Admin mints a coupon
    const gen = await request(app).post('/api/admin/discount-codes').expect(201);
    const code = gen.body.code as string;
    expect(gen.body.percentage).toBe(10);

    // Redeem it on order 3
    const cart3 = await createCartWithItem(app, 'p_bottle', 1);
    const checkout = await request(app)
      .post(`/api/carts/${cart3}/checkout`)
      .send({ discountCode: code })
      .expect(201);
    expect(checkout.body.discountCents).toBe(250); // 10% of 2499 -> 250
    expect(checkout.body.totalCents).toBe(2249);

    // Stats reflect everything
    const stats = await request(app).get('/api/admin/stats').expect(200);
    expect(stats.body.totalOrders).toBe(3);
    expect(stats.body.totalDiscountCents).toBe(250);
  });

  it('exposes the reward config', async () => {
    const res = await request(buildApp()).get('/api/config').expect(200);
    expect(res.body).toEqual({ nthOrder: 2, discountPercentage: 10 });
  });

  it('serves the static demo storefront at the root', async () => {
    const res = await request(buildApp()).get('/').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Neustack Store');
  });

  it('returns 404 for an unknown cart', async () => {
    await request(buildApp()).get('/api/carts/missing').expect(404);
  });

  it('returns 400 on invalid add-item payload', async () => {
    const app = buildApp();
    const created = await request(app).post('/api/carts').expect(201);
    const res = await request(app)
      .post(`/api/carts/${created.body.id}/items`)
      .send({ productId: 'p_tshirt', quantity: -1 })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 when generating a code that is not yet earned', async () => {
    const res = await request(buildApp()).post('/api/admin/discount-codes').expect(409);
    expect(res.body.error.code).toBe('DISCOUNT_NOT_ELIGIBLE');
  });

  it('honors Idempotency-Key on checkout', async () => {
    const app = buildApp();
    const cartId = await createCartWithItem(app);
    const first = await request(app)
      .post(`/api/carts/${cartId}/checkout`)
      .set('Idempotency-Key', 'abc')
      .send({})
      .expect(201);
    const replay = await request(app)
      .post(`/api/carts/${cartId}/checkout`)
      .set('Idempotency-Key', 'abc')
      .send({})
      .expect(201);
    expect(replay.body.id).toBe(first.body.id);

    const stats = await request(app).get('/api/admin/stats').expect(200);
    expect(stats.body.totalOrders).toBe(1);
  });
});

/**
 * Demo storefront client. Plain ES modules-free vanilla JS — no framework, no
 * build step. It is a thin client over the REST API at /api: every action maps
 * to one fetch call, and the server remains the single source of truth (we
 * re-fetch the cart after each mutation rather than tracking state locally).
 */
(() => {
  'use strict';

  const API = '/api';
  const $ = (sel) => document.querySelector(sel);

  // Minimal client state: just the id of the currently-open cart.
  let cartId = null;

  // --- tiny fetch helper with a consistent error surface ---------------------
  async function api(path, { method = 'GET', body, headers } = {}) {
    const res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message = data?.error?.message || `Request failed (${res.status})`;
      const err = new Error(message);
      err.code = data?.error?.code;
      throw err;
    }
    return data;
  }

  function money(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function toast(message, isError = false) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function showResult(selector, html, isError = false) {
    const el = $(selector);
    el.innerHTML = html;
    el.classList.toggle('error', isError);
    el.hidden = false;
  }

  // --- catalog ---------------------------------------------------------------
  async function loadProducts() {
    const { products } = await api('/products');
    $('#products').innerHTML = products
      .map(
        (p) => `
        <div class="product">
          <span class="name">${p.name}</span>
          <span class="price">${money(p.priceCents)}</span>
          <div class="add-row">
            <input type="number" min="1" value="1" id="qty-${p.id}" aria-label="quantity" />
            <button class="btn small" data-add="${p.id}">Add</button>
          </div>
        </div>`,
      )
      .join('');
  }

  // --- cart ------------------------------------------------------------------
  async function ensureCart() {
    if (cartId) return cartId;
    const cart = await api('/carts', { method: 'POST' });
    cartId = cart.id;
    return cartId;
  }

  async function addToCart(productId) {
    const qty = Number($(`#qty-${productId}`).value) || 1;
    await ensureCart();
    const cart = await api(`/carts/${cartId}/items`, {
      method: 'POST',
      body: { productId, quantity: qty },
    });
    renderCart(cart);
    toast('Added to cart');
  }

  function renderCart(cart) {
    const items = cart.items || [];
    $('#cart-meta').textContent = items.length
      ? `Cart ${cart.id.slice(0, 12)}… · ${cart.status}`
      : 'No cart yet — add a product to begin.';
    $('#cart-items').innerHTML = items
      .map(
        (i) => `
        <li>
          <span>${i.name} <span class="qty">×${i.quantity}</span></span>
          <span>${money(i.lineTotalCents)}</span>
        </li>`,
      )
      .join('');
    $('#cart-subtotal').textContent = money(cart.subtotalCents || 0);
    $('#checkout-btn').disabled = items.length === 0;
  }

  async function checkout() {
    if (!cartId) return;
    const code = $('#discount-input').value.trim();
    try {
      const order = await api(`/carts/${cartId}/checkout`, {
        method: 'POST',
        body: code ? { discountCode: code } : {},
      });
      const discountLine =
        order.discountCents > 0
          ? `<div>Discount (<code>${order.discountCode}</code>): −${money(order.discountCents)}</div>`
          : '';
      showResult(
        '#order-result',
        `<strong>Order #${order.sequence} placed ✓</strong>
         <div>Subtotal: ${money(order.subtotalCents)}</div>
         ${discountLine}
         <div><strong>Total charged: ${money(order.totalCents)}</strong></div>`,
      );
      toast(`Order #${order.sequence} placed`);
      // Cart is now checked out — start fresh on the next add.
      cartId = null;
      $('#discount-input').value = '';
      renderCart({ items: [], subtotalCents: 0 });
      refreshStats();
    } catch (err) {
      showResult('#order-result', `<strong>Checkout failed</strong><div>${err.message}</div>`, true);
      toast(err.message, true);
    }
  }

  // --- admin -----------------------------------------------------------------
  async function generateCode() {
    try {
      const code = await api('/admin/discount-codes', { method: 'POST' });
      showResult(
        '#generate-result',
        `<strong>Coupon minted:</strong> <code>${code.code}</code> (${code.percentage}% off)
         <button class="btn small" id="use-code">Use at checkout</button>`,
      );
      $('#use-code').addEventListener('click', () => {
        $('#discount-input').value = code.code;
        toast('Code copied into checkout');
      });
      toast('Coupon generated');
      refreshStats();
    } catch (err) {
      showResult('#generate-result', `<strong>Not generated</strong><div>${err.message}</div>`, true);
      toast(err.message, true);
    }
  }

  async function refreshStats() {
    const s = await api('/admin/stats');
    $('#stats').classList.remove('muted');
    $('#stats').innerHTML = `
      <div class="stat"><div class="label">Orders</div><div class="value">${s.totalOrders}</div></div>
      <div class="stat"><div class="label">Items sold</div><div class="value">${s.totalItemsPurchased}</div></div>
      <div class="stat"><div class="label">Revenue</div><div class="value">${money(s.totalRevenueCents)}</div></div>
      <div class="stat"><div class="label">Discounts given</div><div class="value">${money(s.totalDiscountCents)}</div></div>`;
    const table = $('#codes-table');
    const tbody = table.querySelector('tbody');
    if (s.discountCodes.length) {
      table.hidden = false;
      tbody.innerHTML = s.discountCodes
        .map(
          (c) => `<tr><td><code>${c.code}</code></td><td>${c.percentage}</td><td>${c.used ? '✓' : '—'}</td></tr>`,
        )
        .join('');
    } else {
      table.hidden = true;
    }
  }

  // --- reward banner ---------------------------------------------------------
  async function loadRewardRule() {
    try {
      const { nthOrder, discountPercentage } = await api('/config');
      $('#reward-banner').textContent =
        `Reward: 1 coupon of ${discountPercentage}% per ${nthOrder} orders`;
      $('#nth-label').textContent = String(nthOrder);
    } catch {
      $('#reward-banner').textContent = 'Reward: every Nth order earns a coupon';
    }
  }

  // --- wiring ----------------------------------------------------------------
  function init() {
    $('#products').addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-add');
      if (id) addToCart(id).catch((err) => toast(err.message, true));
    });
    $('#checkout-btn').addEventListener('click', checkout);
    $('#generate-btn').addEventListener('click', generateCode);
    $('#stats-btn').addEventListener('click', () => refreshStats().catch((err) => toast(err.message, true)));

    loadProducts().catch((err) => toast(err.message, true));
    loadRewardRule();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

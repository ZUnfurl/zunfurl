import { readFile } from 'node:fs/promises';
import { createSiteProfile } from 'gcss-config';
import { createWorker } from '../../apps/worker/index.mjs';

const textEncoder = new TextEncoder();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

class MockCoordinator {
  constructor({ contactKvStore, contactKvWrites }) {
    this.contactKvStore = contactKvStore;
    this.contactKvWrites = contactKvWrites;
    this.queue = Promise.resolve();
    this.webhookClaim = undefined;
    this.shopifyFingerprint = undefined;
    this.pendingFingerprint = undefined;
  }

  runExclusive(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  consumeContactRateLimit(buckets, now) {
    return this.runExclusive(() => {
      for (const [key, entry] of this.contactKvStore) {
        if (entry.expiresAt <= now) this.contactKvStore.delete(key);
      }

      const counters = buckets.map((bucket) => ({
        ...bucket,
        next: (this.contactKvStore.get(bucket.key)?.count ?? 0) + 1,
      }));
      const exceeded = counters.find((counter) => counter.next > counter.limit);

      if (exceeded) return { ok: false, code: exceeded.code };

      for (const counter of counters) {
        const entry = { count: counter.next, expiresAt: counter.expiresAt };
        this.contactKvStore.set(counter.key, entry);
        this.contactKvWrites.push({ key: counter.key, value: counter.next, expiresAt: counter.expiresAt });
      }

      return { ok: true, code: 'ok' };
    });
  }

  claimWebhookOnce({ now, processingExpiresAt }) {
    return this.runExclusive(() => {
      if (this.webhookClaim?.expiresAt <= now) this.webhookClaim = undefined;
      if (this.webhookClaim) {
        return {
          claimed: false,
          state: this.webhookClaim.state,
          expiresAt: this.webhookClaim.expiresAt,
        };
      }

      this.webhookClaim = { state: 'processing', expiresAt: processingExpiresAt };
      return { claimed: true, ...this.webhookClaim };
    });
  }

  completeWebhookClaim({ completedExpiresAt }) {
    return this.runExclusive(() => {
      if (this.webhookClaim?.state !== 'processing') return { completed: false };
      this.webhookClaim = { state: 'completed', expiresAt: completedExpiresAt };
      return { completed: true };
    });
  }

  releaseWebhookClaim() {
    return this.runExclusive(() => {
      const released = this.webhookClaim?.state === 'processing';
      if (released) this.webhookClaim = undefined;
      return { released };
    });
  }

  claimShopifyProductFingerprint({ fingerprint, owner }) {
    return this.runExclusive(() => {
      if (this.pendingFingerprint && this.pendingFingerprint.owner !== owner) {
        return { decision: 'busy' };
      }
      if (this.shopifyFingerprint === fingerprint) return { decision: 'unchanged' };
      this.pendingFingerprint = { fingerprint, owner };
      return { decision: 'dispatch' };
    });
  }

  completeShopifyProductFingerprint({ fingerprint, owner }) {
    return this.runExclusive(() => {
      if (this.pendingFingerprint?.fingerprint !== fingerprint || this.pendingFingerprint?.owner !== owner) {
        return { completed: false };
      }
      this.shopifyFingerprint = fingerprint;
      this.pendingFingerprint = undefined;
      return { completed: true };
    });
  }

  releaseShopifyProductFingerprint({ owner }) {
    return this.runExclusive(() => {
      const released = this.pendingFingerprint?.owner === owner;
      if (released) this.pendingFingerprint = undefined;
      return { released };
    });
  }
}

function createEnv({ contactForm = true, profile = 'cms-brand' } = {}) {
  const assetCalls = [];
  const dispatchCalls = [];
  const contactFetchCalls = [];
  const contactKvWrites = [];
  const contactKvStore = new Map();
  const coordinatorByName = new Map();
  const coordinatorNamespace = {
    getByName(name) {
      if (!coordinatorByName.has(name)) {
        coordinatorByName.set(name, new MockCoordinator({ contactKvStore, contactKvWrites }));
      }
      return coordinatorByName.get(name);
    },
  };

  return {
    env: {
      TEST_SITE_PROFILE: createSiteProfile({ mode: profile, features: { contactForm } }),
      ASSETS: {
        async fetch(request) {
          const url = new URL(request.url);
          assetCalls.push(url.pathname);

          return new Response(`asset:${url.pathname}`, { status: 200 });
        },
      },
      SANITY_WEBHOOK_SECRET: 'sanity-secret',
      SHOPIFY_WEBHOOK_SECRET: 'shopify-secret',
      GITHUB_DISPATCH_TOKEN: 'github-dispatch-token',
      GITHUB_REPOSITORY: 'owner/gcss-v3-site-framework',
      CONTACT_FORM_ENABLED: 'true',
      CONTACT_RECIPIENT_EMAIL: 'business@example.com',
      RESEND_FROM_EMAIL: 'Example Brand Website <contact@example.com>',
      RESEND_API_KEY: 'resend-secret',
      TURNSTILE_SECRET_KEY: 'turnstile-secret',
      CONTACT_HMAC_SECRET: 'contact-hmac-secret',
      CONTACT_ALLOWED_ORIGINS: 'https://worker.test,https://example.com',
      CONTACT_DAILY_LIMIT: '60',
      CONTACT_HOURLY_LIMIT: '10',
      CONTACT_IP_HOURLY_LIMIT: '6',
      CONTACT_IP_DAILY_LIMIT: '20',
      CONTACT_EMAIL_HOURLY_LIMIT: '2',
      CONTACT_EMAIL_DAILY_LIMIT: '5',
      CONTACT_MESSAGE_MAX_LENGTH: '2000',
      GCSS_COORDINATOR: coordinatorNamespace,
      async CONTACT_FETCH(url, init) {
        contactFetchCalls.push({
          url,
          init,
          body: JSON.parse(init.body),
        });

        if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
          return Response.json({ success: true, hostname: 'worker.test' });
        }

        if (url === 'https://api.resend.com/emails') {
          return Response.json({ id: 'email_test_1' }, { status: 200 });
        }

        return Response.json({ ok: false }, { status: 404 });
      },
      async GITHUB_DISPATCH_FETCH(url, init) {
        dispatchCalls.push({
          url,
          init,
          body: JSON.parse(init.body),
        });

        return new Response(null, { status: 204 });
      },
    },
    assetCalls,
    dispatchCalls,
    contactFetchCalls,
    contactKvWrites,
    contactKvStore,
    coordinatorByName,
  };
}

const worker = createWorker({ resolveSiteProfile: (env) => env.TEST_SITE_PROFILE });

async function json(response) {
  return response.json();
}

async function shopifyHmac(secret, body) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, textEncoder.encode(body)),
  );

  return bytesToBase64(signature);
}

function bytesToBase64(bytes) {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

{
  const { env, assetCalls } = createEnv();
  const response = await worker.fetch(new Request('https://worker.test/health'), env, {});
  const body = await json(response);

  assert(response.status === 200, '/health should return 200.');
  assert(body.ok === true, '/health should return ok=true.');
  assert(body.service === 'gcss-v3-site-framework', '/health should expose the service name.');
  assert(assetCalls.length === 0, '/health should not fall through to ASSETS.');
}

{
  const { env, assetCalls } = createEnv();
  const response = await worker.fetch(new Request('https://worker.test/en/'), env, {});
  const body = await response.text();

  assert(response.status === 200, 'Normal storefront paths should fall through to ASSETS.');
  assert(body === 'asset:/en/', 'ASSETS should receive the original storefront path.');
  assert(assetCalls.join(',') === '/en/', 'Only the storefront path should call ASSETS.');
}

{
  const { env, assetCalls } = createEnv();
  const response = await worker.fetch(new Request('https://worker.test/api/shopify'), env, {});
  const body = await json(response);

  assert(response.status === 404, '/api/* should return a fast local 404 until routes exist.');
  assert(body.code === 'api_route_not_found', '/api/* should not proxy Shopify by default.');
  assert(assetCalls.length === 0, '/api/* should not fall through to ASSETS.');
}

{
  const { env } = createEnv();
  const response = await worker.fetch(new Request('https://worker.test/api/contact'), env, {});
  const body = await json(response);

  assert(response.status === 405, 'Contact API should reject non-POST methods.');
  assert(response.headers.get('allow') === 'POST, OPTIONS', 'Contact API should advertise POST and OPTIONS.');
  assert(body.code === 'method_not_allowed', 'Contact API should return method_not_allowed.');
}

{
  const { env, contactFetchCalls, contactKvWrites } = createEnv({
    contactForm: false,
    profile: 'static-brand',
  });
  const response = await worker.fetch(
    new Request('https://worker.test/api/contact', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://worker.test',
      },
      body: JSON.stringify({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        topic: 'brand_partnership',
        topicLabel: 'Brand partnership',
        message: 'This should be rejected before dynamic processing.',
        privacyAccepted: true,
        turnstileToken: 'valid-token',
      }),
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 404, 'A1 static profile must not expose a Contact API route.');
  assert(body.code === 'route_not_found', 'Disabled Contact API should fail closed as route_not_found.');
  assert(contactFetchCalls.length === 0, 'Disabled Contact API must not call Turnstile or Resend.');
  assert(contactKvWrites.length === 0, 'Disabled Contact API must not write rate counters.');
}

{
  const { env } = createEnv({ contactForm: true, profile: 'static-brand' });
  const response = await worker.fetch(new Request('https://worker.test/api/contact'), env, {});
  const body = await json(response);

  assert(response.status === 405, 'A2 project contract should enable Contact API method handling.');
  assert(body.code === 'method_not_allowed', 'A2 should reach normal Contact API handling.');
}

for (const profile of ['static-brand', 'cms-brand', 'retail']) {
  const { env, contactFetchCalls, contactKvWrites } = createEnv({ contactForm: true, profile });
  env.CONTACT_FORM_ENABLED = 'false';
  const response = await worker.fetch(
    new Request('https://worker.test/api/contact', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://worker.test',
      },
      body: JSON.stringify({
        name: 'Emergency stop test',
        email: 'stop@example.com',
        topic: 'other',
        topicLabel: 'Other',
        message: 'This submission must stop before any external processing.',
        privacyAccepted: true,
        turnstileToken: 'valid-token',
      }),
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 503, `${profile} Contact emergency false must return 503.`);
  assert(body.code === 'contact_form_disabled', `${profile} emergency false must win over the enabled project contract.`);
  assert(contactFetchCalls.length === 0, `${profile} emergency false must not call Turnstile or Resend.`);
  assert(contactKvWrites.length === 0, `${profile} emergency false must not consume rate-limit counters.`);
}

{
  const { env, contactFetchCalls, contactKvWrites } = createEnv();
  const response = await worker.fetch(
    new Request('https://worker.test/api/contact', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://worker.test',
        'cf-connecting-ip': '203.0.113.10',
      },
      body: JSON.stringify({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        topic: 'brand_partnership',
        topicLabel: 'Brand partnership',
        orderNumber: '',
        message: 'I would like to discuss an editorial collaboration.',
        privacyAccepted: true,
        turnstileToken: 'valid-token',
        locale: 'en',
        pageUrl: 'https://worker.test/en/contact/',
      }),
    }),
    env,
    {},
  );
  const body = await json(response);
  const emailCall = contactFetchCalls.find((call) => call.url === 'https://api.resend.com/emails');

  assert(response.status === 202, 'Contact API should accept a valid submission.');
  assert(body.accepted === true, 'Contact API should return accepted=true.');
  assert(body.delivered === true, 'Contact API should report delivered=true only after Resend accepts the email.');
  assert(contactFetchCalls.length === 2, 'Contact API should call Turnstile and Resend exactly once.');
  assert(emailCall.body.reply_to === 'ada@example.com', 'Resend payload should use the sender as reply_to.');
  assert(emailCall.body.to[0] === 'business@example.com', 'Resend payload should send to the configured recipient.');
  assert(contactKvWrites.length === 6, 'Contact API should atomically write only short-lived coordinator counters.');
  assert(
    contactKvWrites.every((entry) => !entry.key.includes('ada@example.com') && !entry.key.includes('203.0.113.10')),
    'Contact API must hash email and IP before writing coordinator bucket keys.',
  );
}

{
  const { env, contactFetchCalls, contactKvWrites } = createEnv();
  const response = await worker.fetch(
    new Request('https://worker.test/api/contact', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://worker.test',
      },
      body: JSON.stringify({
        name: 'Bot',
        email: 'bot@example.com',
        topic: 'other',
        topicLabel: 'Other',
        message: 'Ignored',
        company: 'Spam Company',
        privacyAccepted: true,
        turnstileToken: 'valid-token',
      }),
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 202, 'Contact honeypot hits should return a generic accepted response.');
  assert(body.accepted === true, 'Contact honeypot hits should look accepted to the submitter.');
  assert(body.delivered !== true, 'Contact honeypot hits must not look delivered to the storefront.');
  assert(contactFetchCalls.length === 0, 'Contact honeypot hits must not call Turnstile or Resend.');
  assert(contactKvWrites.length === 0, 'Contact honeypot hits must not write rate counters.');
}

{
  const { env, contactFetchCalls, contactKvWrites, contactKvStore } = createEnv();
  const response = await worker.fetch(
    new Request('https://worker.test/api/contact', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://worker.test',
      },
      body: JSON.stringify({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        topic: 'brand_partnership',
        topicLabel: 'Brand partnership',
        message: 'Missing verification token.',
        privacyAccepted: true,
      }),
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 400, 'Contact API should reject missing Turnstile tokens.');
  assert(body.code === 'missing_turnstile_token', 'Contact API should report missing_turnstile_token.');
  assert(contactFetchCalls.length === 0, 'Contact API should not send email without Turnstile token.');
}

{
  const { env, contactFetchCalls, contactKvWrites, contactKvStore } = createEnv();
  env.CONTACT_IP_HOURLY_LIMIT = '1';

  const requestInit = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://worker.test',
      'cf-connecting-ip': '203.0.113.20',
    },
    body: JSON.stringify({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      topic: 'brand_partnership',
      topicLabel: 'Brand partnership',
      message: 'I would like to discuss a second collaboration.',
      privacyAccepted: true,
      turnstileToken: 'valid-token',
    }),
  };

  const firstResponse = await worker.fetch(new Request('https://worker.test/api/contact', requestInit), env, {});
  const writesAfterFirstResponse = contactKvWrites.length;
  const storeAfterFirstResponse = new Map(contactKvStore);
  const secondResponse = await worker.fetch(new Request('https://worker.test/api/contact', requestInit), env, {});
  const secondBody = await json(secondResponse);

  assert(firstResponse.status === 202, 'First contact submission should pass under the IP limit.');
  assert(secondResponse.status === 429, 'Second contact submission should be rate limited.');
  assert(secondBody.code === 'contact_ip_rate_limited', 'Rate limited contact submissions should return the matching limit code.');
  assert(
    contactFetchCalls.filter((call) => call.url === 'https://api.resend.com/emails').length === 1,
    'Rate limited contact submissions must not send another email.',
  );
  assert(
    contactKvWrites.length === writesAfterFirstResponse,
    'Rate limited contact submissions must not increment any coordinator counters.',
  );
  assert(
    JSON.stringify([...contactKvStore]) === JSON.stringify([...storeAfterFirstResponse]),
    'Rate limited contact submissions must leave coordinator counter values unchanged.',
  );
}

{
  const { env, assetCalls } = createEnv();
  const response = await worker.fetch(
    new Request('https://worker.test/preview/en/products/example-product?token=must-not-authenticate'),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 404, 'A URL token must not activate a Worker draft preview route.');
  assert(body.code === 'route_not_found', 'Unavailable draft preview paths should fail closed.');
  assert(assetCalls.length === 0, 'Draft preview paths must not fall through to static assets.');
}

{
  const { env } = createEnv();
  const response = await worker.fetch(new Request('https://worker.test/hooks/sanity'), env, {});
  const body = await json(response);

  assert(response.status === 405, 'Sanity webhook should reject non-POST methods.');
  assert(response.headers.get('allow') === 'POST', 'Sanity webhook should advertise POST only.');
  assert(body.code === 'method_not_allowed', 'Sanity webhook should return method_not_allowed.');
}

{
  const { env, dispatchCalls } = createEnv();
  const response = await worker.fetch(
    new Request('https://worker.test/hooks/sanity', {
      method: 'POST',
      headers: {
        'idempotency-key': 'sanity-event-001',
        'x-sanity-webhook-secret': 'sanity-secret',
      },
      body: '{}',
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 202, 'Sanity webhook should accept a valid secret.');
  assert(body.accepted === true, 'Sanity webhook should return an accepted marker.');
  assert(body.dispatched === true, 'Sanity webhook should dispatch a GitHub build event.');
  assert(body.eventType === 'sanity_publish', 'Sanity webhook should dispatch sanity_publish.');
  assert(dispatchCalls.length === 1, 'Sanity webhook should make exactly one GitHub dispatch call.');
  assert(
    dispatchCalls[0].url === 'https://api.github.com/repos/owner/gcss-v3-site-framework/dispatches',
    'Sanity webhook should dispatch to the configured repository.',
  );
  assert(
    dispatchCalls[0].body.event_type === 'sanity_publish',
    'Sanity webhook should send the sanity_publish event type.',
  );

  const duplicateResponse = await worker.fetch(
    new Request('https://worker.test/hooks/sanity', {
      method: 'POST',
      headers: {
        'idempotency-key': 'sanity-event-001',
        'x-sanity-webhook-secret': 'sanity-secret',
      },
      body: '{}',
    }),
    env,
    {},
  );
  const duplicateBody = await json(duplicateResponse);

  assert(duplicateResponse.status === 202, 'Repeated Sanity delivery should be acknowledged.');
  assert(duplicateBody.duplicate === true, 'Repeated Sanity delivery should be marked duplicate.');
  assert(dispatchCalls.length === 1, 'The same Sanity event ID must produce at most one dispatch attempt.');
}

{
  const { env, dispatchCalls } = createEnv({ contactForm: false, profile: 'static-brand' });
  const response = await worker.fetch(
    new Request('https://worker.test/hooks/sanity', {
      method: 'POST',
      body: '{}',
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 404, 'Static profile must not expose the Sanity webhook route.');
  assert(body.code === 'route_not_found', 'Disabled Sanity webhook should fail closed as route_not_found.');
  assert(dispatchCalls.length === 0, 'Disabled Sanity webhook must not dispatch a GitHub event.');
}

{
  const { env, dispatchCalls } = createEnv();
  const response = await worker.fetch(
    new Request('https://worker.test/hooks/sanity', {
      method: 'POST',
      headers: { 'x-sanity-webhook-secret': 'sanity-secret' },
      body: '{}',
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 400, 'Sanity webhook must reject deliveries without an event ID.');
  assert(body.code === 'missing_webhook_event_id', 'Sanity webhook must require the official idempotency-key header.');
  assert(dispatchCalls.length === 0, 'Sanity delivery without event ID must not dispatch.');
}

{
  const { env, dispatchCalls } = createEnv();
  delete env.GCSS_COORDINATOR;
  const response = await worker.fetch(
    new Request('https://worker.test/hooks/sanity', {
      method: 'POST',
      headers: {
        'idempotency-key': 'sanity-no-coordinator',
        'x-sanity-webhook-secret': 'sanity-secret',
      },
      body: '{}',
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 503, 'Enabled webhook must fail closed without the coordinator binding.');
  assert(body.code === 'missing_webhook_coordinator', 'Missing coordinator should use an explicit failure code.');
  assert(dispatchCalls.length === 0, 'Missing coordinator must never degrade to an unprotected dispatch.');
}

{
  const { env } = createEnv();
  let dispatchAttempts = 0;
  env.GITHUB_DISPATCH_FETCH = async () => {
    dispatchAttempts += 1;
    return new Response(null, { status: dispatchAttempts === 1 ? 500 : 204 });
  };
  const requestInit = {
    method: 'POST',
    headers: {
      'idempotency-key': 'sanity-retry-after-http-failure',
      'x-sanity-webhook-secret': 'sanity-secret',
    },
    body: '{}',
  };
  const firstResponse = await worker.fetch(
    new Request('https://worker.test/hooks/sanity', requestInit),
    env,
    {},
  );
  const secondResponse = await worker.fetch(
    new Request('https://worker.test/hooks/sanity', requestInit),
    env,
    {},
  );

  assert(firstResponse.status === 502, 'Explicit GitHub non-2xx should fail the webhook request.');
  assert(secondResponse.status === 202, 'A definitive HTTP failure should release the claim for provider retry.');
  assert(dispatchAttempts === 2, 'Released webhook claim should permit exactly one later retry attempt.');
}

{
  const { env } = createEnv();
  const response = await worker.fetch(
    new Request('https://worker.test/hooks/sanity', {
      method: 'POST',
      headers: { 'x-sanity-webhook-secret': 'wrong-secret' },
      body: '{}',
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 401, 'Sanity webhook should reject an invalid secret.');
  assert(body.code === 'invalid_secret', 'Sanity webhook should report invalid_secret.');
}

{
  const { env, dispatchCalls } = createEnv({ profile: 'retail' });
  const body = JSON.stringify({
    id: 1001,
    title: 'Example Product',
    handle: 'example-product',
    status: 'active',
    variants: [{ id: 2001, title: 'Default Title', option1: 'Default Title' }],
  });
  const hmac = await shopifyHmac(env.SHOPIFY_WEBHOOK_SECRET, body);
  const response = await worker.fetch(
    new Request('https://worker.test/hooks/shopify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-hmac-sha256': hmac,
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'example-store.myshopify.com',
        'x-shopify-webhook-id': 'shopify-event-001',
      },
      body,
    }),
    env,
    {},
  );
  const responseBody = await json(response);

  assert(response.status === 202, 'Shopify webhook should accept a valid HMAC.');
  assert(responseBody.accepted === true, 'Shopify webhook should return an accepted marker.');
  assert(responseBody.dispatched === true, 'Shopify webhook should dispatch structural product events.');
  assert(responseBody.eventType === 'shopify_product_structure', 'Shopify webhook should dispatch the structural event type.');
  assert(dispatchCalls.length === 1, 'Shopify webhook should make exactly one GitHub dispatch call.');
  assert(
    dispatchCalls[0].body.event_type === 'shopify_product_structure',
    'Shopify webhook should send the shopify_product_structure event type.',
  );
  assert(
    dispatchCalls[0].body.client_payload.topic === 'products/update',
    'Shopify dispatch payload should include the Shopify topic.',
  );

  const duplicateResponse = await worker.fetch(
    new Request('https://worker.test/hooks/shopify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-hmac-sha256': hmac,
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'example-store.myshopify.com',
        'x-shopify-webhook-id': 'shopify-event-001',
      },
      body,
    }),
    env,
    {},
  );
  const duplicateBody = await json(duplicateResponse);

  assert(duplicateBody.duplicate === true, 'Repeated Shopify delivery should be marked duplicate.');
  assert(dispatchCalls.length === 1, 'The same Shopify event ID must produce at most one dispatch attempt.');

  const runtimeOnlyBody = JSON.stringify({
    id: 1001,
    title: 'Example Product',
    handle: 'example-product',
    status: 'active',
    availableForSale: false,
    variants: [{
      id: 2001,
      title: 'Default Title',
      option1: 'Default Title',
      price: '88.00',
      inventory_quantity: 0,
      sku: 'RUNTIME-ONLY',
    }],
  });
  const runtimeOnlyHmac = await shopifyHmac(env.SHOPIFY_WEBHOOK_SECRET, runtimeOnlyBody);
  const runtimeOnlyResponse = await worker.fetch(
    new Request('https://worker.test/hooks/shopify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-hmac-sha256': runtimeOnlyHmac,
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'example-store.myshopify.com',
        'x-shopify-webhook-id': 'shopify-event-002',
      },
      body: runtimeOnlyBody,
    }),
    env,
    {},
  );
  const runtimeOnlyResponseBody = await json(runtimeOnlyResponse);

  assert(runtimeOnlyResponse.status === 202, 'Runtime-only Shopify update should be acknowledged.');
  assert(
    runtimeOnlyResponseBody.code === 'ignored_shopify_non_structural_update',
    'Price, inventory, SKU, and availableForSale changes must not trigger a rebuild.',
  );
  assert(dispatchCalls.length === 1, 'Runtime-only Shopify update must not dispatch another build.');

  const structuralBody = JSON.stringify({
    id: 1001,
    title: 'Example Product',
    handle: 'example-product-renamed',
    status: 'active',
    variants: [{ id: 2001, title: 'Default Title', option1: 'Default Title' }],
  });
  const structuralHmac = await shopifyHmac(env.SHOPIFY_WEBHOOK_SECRET, structuralBody);
  const structuralResponse = await worker.fetch(
    new Request('https://worker.test/hooks/shopify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-hmac-sha256': structuralHmac,
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'example-store.myshopify.com',
        'x-shopify-webhook-id': 'shopify-event-003',
      },
      body: structuralBody,
    }),
    env,
    {},
  );

  assert(structuralResponse.status === 202, 'Structural Shopify update should be accepted.');
  assert(dispatchCalls.length === 2, 'A changed Shopify handle must trigger a new structural dispatch.');
}

{
  const { env, dispatchCalls } = createEnv({ profile: 'cms-brand' });
  const response = await worker.fetch(
    new Request('https://worker.test/hooks/shopify', {
      method: 'POST',
      body: '{}',
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 404, 'B profile must not expose the Shopify webhook route.');
  assert(body.code === 'route_not_found', 'Disabled Shopify webhook should fail closed as route_not_found.');
  assert(dispatchCalls.length === 0, 'Disabled Shopify webhook must not dispatch a GitHub event.');
}

{
  const { env, dispatchCalls } = createEnv({ profile: 'retail' });
  const body = JSON.stringify({ id: 1 });
  const hmac = await shopifyHmac(env.SHOPIFY_WEBHOOK_SECRET, body);
  const response = await worker.fetch(
    new Request('https://worker.test/hooks/shopify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-hmac-sha256': hmac,
        'x-shopify-topic': 'inventory_levels/update',
        'x-shopify-webhook-id': 'shopify-inventory-event-001',
      },
      body,
    }),
    env,
    {},
  );
  const responseBody = await json(response);

  assert(response.status === 202, 'Shopify runtime topics should be accepted but ignored.');
  assert(responseBody.ignored === true, 'Shopify inventory topics should be ignored.');
  assert(
    responseBody.code === 'ignored_shopify_runtime_topic',
    'Shopify inventory topics should report ignored_shopify_runtime_topic.',
  );
  assert(dispatchCalls.length === 0, 'Shopify inventory topics must not dispatch a rebuild.');
}

{
  const { env, dispatchCalls } = createEnv({ profile: 'retail' });
  const requestBody = JSON.stringify({ id: 1002, title: 'Missing ID Product' });
  const hmac = await shopifyHmac(env.SHOPIFY_WEBHOOK_SECRET, requestBody);
  const response = await worker.fetch(
    new Request('https://worker.test/hooks/shopify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-hmac-sha256': hmac,
        'x-shopify-topic': 'products/create',
      },
      body: requestBody,
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 400, 'Shopify structural webhook must require a stable event ID.');
  assert(body.code === 'missing_webhook_event_id', 'Shopify webhook must require X-Shopify-Webhook-Id.');
  assert(dispatchCalls.length === 0, 'Shopify delivery without event ID must not dispatch.');
}

{
  const { env } = createEnv({ profile: 'retail' });
  const response = await worker.fetch(
    new Request('https://worker.test/hooks/shopify', {
      method: 'POST',
      headers: { 'x-shopify-hmac-sha256': 'invalid' },
      body: '{}',
    }),
    env,
    {},
  );
  const body = await json(response);

  assert(response.status === 401, 'Shopify webhook should reject an invalid HMAC.');
  assert(body.code === 'invalid_shopify_hmac', 'Shopify webhook should report invalid_shopify_hmac.');
}

{
  const source = await readFile(new URL('../../apps/worker/index.mjs', import.meta.url), 'utf8');

  assert(
    !source.includes('SHOPIFY_STOREFRONT_ACCESS_TOKEN'),
    'Worker must not proxy Storefront API with the Storefront access token.',
  );
  assert(
    !source.includes('SANITY_API_WRITE_TOKEN'),
    'Worker must not write Sanity content.',
  );
  assert(
    !source.includes('SHOPIFY_ADMIN_ACCESS_TOKEN'),
    'Worker must not use Shopify Admin credentials.',
  );
  assert(!source.includes('handlePreviewRequest'), 'Worker must not expose a draft preview handler.');
  assert(!source.includes('PREVIEW_SECRET'), 'Worker must not configure a legacy preview shared secret.');
  assert(!source.includes('x-gcss-preview-secret'), 'Worker must not accept a legacy preview secret header.');
  assert(!source.includes("searchParams.get('token')"), 'Worker must not authenticate through a URL query token.');
}

console.log('Worker routes OK: health, no draft preview handler, profile-aware webhook dispatch, HMAC, Contact API, and static fallback validated.');

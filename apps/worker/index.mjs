import {
  brandName,
  isFeatureEnabled,
  parseFeatureFlag,
  siteProfile,
} from 'gcss-config';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const WEBHOOK_MAX_BYTES = 1024 * 1024;
const CONTACT_MAX_BYTES = 16 * 1024;
const CONTACT_EMAIL_ENDPOINT = 'https://api.resend.com/emails';
const GITHUB_API_VERSION = '2022-11-28';
const WEBHOOK_PROCESSING_TTL_MS = 10 * 60 * 1000;
const WEBHOOK_COMPLETED_TTL_MS = 24 * 60 * 60 * 1000;
const CONTACT_DEFAULT_LIMITS = {
  daily: 60,
  hourly: 10,
  ipHourly: 3,
  ipDaily: 8,
  emailHourly: 2,
  emailDaily: 5,
  messageMaxLength: 2000,
};
const SHOPIFY_STRUCTURAL_TOPICS = new Set([
  'products/create',
  'products/update',
  'products/delete',
  'collections/create',
  'collections/update',
  'collections/delete',
]);
const SHOPIFY_IGNORED_TOPIC_PATTERNS = [
  /^orders\//,
  /^inventory_/,
  /^inventory\//,
  /^carts\//,
  /^checkouts\//,
  /^refunds\//,
  /^fulfillments\//,
];
const textEncoder = new TextEncoder();

class PayloadTooLargeError extends Error {
  constructor() {
    super('payload_too_large');
    this.name = 'PayloadTooLargeError';
  }
}

export function createWorker({ resolveSiteProfile = (env) => {
  void env;
  return siteProfile;
} } = {}) {
  return {
    async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const runtimeProfile = resolveSiteProfile(env);

      if (url.pathname === '/health') {
        return jsonResponse({
          ok: true,
          service: 'gcss-v3-site-framework',
          timestamp: new Date().toISOString(),
        });
      }

      // 真实 Draft Preview 尚未实现；显式 404，避免 query secret 或静态回退被误认成预览能力。
      if (url.pathname === '/preview' || url.pathname.startsWith('/preview/')) {
        return jsonResponse({ ok: false, code: 'route_not_found' }, 404, {}, request.method);
      }

      if (url.pathname === '/hooks/sanity') {
        return handleSanityWebhook(request, env, runtimeProfile);
      }

      if (url.pathname === '/hooks/shopify') {
        return handleShopifyWebhook(request, env, runtimeProfile);
      }

      if (url.pathname === '/api/contact') {
        return handleContactRequest(request, env, runtimeProfile);
      }

      if (url.pathname.startsWith('/hooks/')) {
        if (request.method !== 'POST') {
          return methodNotAllowed(['POST']);
        }

        return jsonResponse({ ok: false, code: 'webhook_route_not_found' }, 404);
      }

      if (url.pathname.startsWith('/api/')) {
        return jsonResponse({ ok: false, code: 'api_route_not_found' }, 404);
      }

      return fetchStaticAsset(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        service: 'gcss-v3-site-framework',
        message: error instanceof Error ? error.message : 'unknown_worker_error',
      }));

      return jsonResponse({ ok: false, code: 'worker_error' }, 500);
    }
    },
  };
}

export default createWorker();

async function handleSanityWebhook(request, env, runtimeProfile) {
  if (!isWorkerFeatureEnabled(runtimeProfile, 'contentCms')) {
    return jsonResponse({ ok: false, code: 'route_not_found' }, 404);
  }

  if (request.method !== 'POST') {
    return methodNotAllowed(['POST']);
  }

  const verification = await verifyProvidedSecret({
    expectedSecret: env.SANITY_WEBHOOK_SECRET,
    providedSecret: getSanityWebhookSecret(request),
  });

  if (!verification.ok) {
    return jsonResponse({ ok: false, code: verification.code }, verification.status);
  }

  const eventId = normalizeWebhookEventId(request.headers.get('idempotency-key'));
  const claim = await claimWebhookEvent(env, { eventId, source: 'sanity' });

  if (!claim.ok) {
    return jsonResponse({ ok: false, code: claim.code }, claim.status);
  }

  if (claim.duplicate) {
    return jsonResponse({
      ok: true,
      route: 'hooks/sanity',
      accepted: true,
      ignored: true,
      duplicate: true,
      code: 'duplicate_webhook_event',
    }, 202);
  }

  const dispatch = await dispatchRepositoryEvent(env, {
    eventType: 'sanity_publish',
    clientPayload: {
      source: 'sanity',
      route: '/hooks/sanity',
      receivedAt: new Date().toISOString(),
    },
  });

  if (!dispatch.ok) {
    await claim.stub.releaseWebhookClaim();
    return jsonResponse({ ok: false, code: dispatch.code }, dispatch.status);
  }

  await completeWebhookEvent(claim.stub);

  return jsonResponse({
    ok: true,
    route: 'hooks/sanity',
    accepted: true,
    dispatched: true,
    eventType: 'sanity_publish',
  }, 202);
}

async function handleShopifyWebhook(request, env, runtimeProfile) {
  if (!isWorkerFeatureEnabled(runtimeProfile, 'commerce') || !isWorkerFeatureEnabled(runtimeProfile, 'productCms')) {
    return jsonResponse({ ok: false, code: 'route_not_found' }, 404);
  }

  if (request.method !== 'POST') {
    return methodNotAllowed(['POST']);
  }

  if (!env.SHOPIFY_WEBHOOK_SECRET) {
    return jsonResponse({ ok: false, code: 'missing_worker_secret' }, 503);
  }

  const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

  if (!hmacHeader) {
    return jsonResponse({ ok: false, code: 'missing_shopify_hmac' }, 401);
  }

  let body;

  try {
    body = await readRequestBodyBytes(request, WEBHOOK_MAX_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return jsonResponse({ ok: false, code: 'payload_too_large' }, 413);
    }

    throw error;
  }

  const hmacIsValid = await verifyShopifyHmac({
    body,
    hmacHeader,
    secret: env.SHOPIFY_WEBHOOK_SECRET,
  });

  if (!hmacIsValid) {
    return jsonResponse({ ok: false, code: 'invalid_shopify_hmac' }, 401);
  }

  const topic = request.headers.get('x-shopify-topic')?.toLowerCase() || 'unknown';
  const topicDecision = getShopifyTopicDecision(topic);

  if (!topicDecision.dispatch) {
    return jsonResponse({
      ok: true,
      route: 'hooks/shopify',
      accepted: true,
      ignored: true,
      code: topicDecision.code,
      topic,
    }, 202);
  }

  const eventId = normalizeWebhookEventId(request.headers.get('x-shopify-webhook-id'));
  const claim = await claimWebhookEvent(env, { eventId, source: 'shopify' });

  if (!claim.ok) {
    return jsonResponse({ ok: false, code: claim.code }, claim.status);
  }

  if (claim.duplicate) {
    return jsonResponse({
      ok: true,
      route: 'hooks/shopify',
      accepted: true,
      ignored: true,
      duplicate: true,
      code: 'duplicate_webhook_event',
      topic,
    }, 202);
  }

  const productUpdateDecision = await getShopifyProductUpdateDecision({
    body,
    env,
    eventId,
    shopDomain: request.headers.get('x-shopify-shop-domain'),
    topic,
  });

  if (!productUpdateDecision.ok) {
    await claim.stub.releaseWebhookClaim();
    return jsonResponse({ ok: false, code: productUpdateDecision.code }, productUpdateDecision.status);
  }

  if (!productUpdateDecision.dispatch) {
    await completeWebhookEvent(claim.stub);
    return jsonResponse({
      ok: true,
      route: 'hooks/shopify',
      accepted: true,
      ignored: true,
      code: productUpdateDecision.code,
      topic,
    }, 202);
  }

  const dispatch = await dispatchRepositoryEvent(env, {
    eventType: 'shopify_product_structure',
    clientPayload: {
      source: 'shopify',
      route: '/hooks/shopify',
      topic,
      shopDomain: request.headers.get('x-shopify-shop-domain') || undefined,
      webhookId: request.headers.get('x-shopify-webhook-id') || undefined,
      apiVersion: request.headers.get('x-shopify-api-version') || undefined,
      receivedAt: new Date().toISOString(),
    },
  });

  if (!dispatch.ok) {
    await claim.stub.releaseWebhookClaim();
    await productUpdateDecision.release?.();
    return jsonResponse({ ok: false, code: dispatch.code }, dispatch.status);
  }

  await productUpdateDecision.complete?.();
  await completeWebhookEvent(claim.stub);

  return jsonResponse({
    ok: true,
    route: 'hooks/shopify',
    accepted: true,
    dispatched: true,
    eventType: 'shopify_product_structure',
    topic,
  }, 202);
}

async function handleContactRequest(request, env, runtimeProfile) {
  if (!isWorkerFeatureEnabled(runtimeProfile, 'contactForm')) {
    return jsonResponse({ ok: false, code: 'route_not_found' }, 404);
  }

  if (isContactEmergencyDisabled(env)) {
    return contactJsonResponse(request, env, { ok: false, code: 'contact_form_disabled' }, 503);
  }

  if (request.method === 'OPTIONS') {
    return contactOptionsResponse(request, env);
  }

  if (request.method !== 'POST') {
    return methodNotAllowed(['POST', 'OPTIONS'], getContactCorsHeaders(request, env));
  }

  const originDecision = getContactOriginDecision(request, env);

  if (!originDecision.ok) {
    return contactJsonResponse(request, env, { ok: false, code: originDecision.code }, originDecision.status);
  }

  const configDecision = getContactConfigDecision(env);

  if (!configDecision.ok) {
    return contactJsonResponse(request, env, { ok: false, code: configDecision.code }, configDecision.status);
  }

  const contentType = request.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    return contactJsonResponse(request, env, { ok: false, code: 'invalid_content_type' }, 415);
  }

  let payload;

  try {
    payload = await readJsonRequestBody(request, CONTACT_MAX_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return contactJsonResponse(request, env, { ok: false, code: 'payload_too_large' }, 413);
    }

    return contactJsonResponse(request, env, { ok: false, code: 'invalid_json' }, 400);
  }

  const submission = normalizeContactSubmission(payload, env);

  if (submission.honeypot) {
    return contactJsonResponse(request, env, { ok: true, accepted: true }, 202);
  }

  if (!submission.ok || !submission.value) {
    return contactJsonResponse(request, env, { ok: false, code: submission.code }, 400);
  }

  const submissionValue = submission.value;

  const turnstileDecision = await verifyContactTurnstile(request, env, submissionValue.turnstileToken);

  if (!turnstileDecision.ok) {
    return contactJsonResponse(request, env, { ok: false, code: turnstileDecision.code }, turnstileDecision.status);
  }

  const rateLimitDecision = await checkContactRateLimit(request, env, submissionValue);

  if (!rateLimitDecision.ok) {
    return contactJsonResponse(request, env, { ok: false, code: rateLimitDecision.code }, rateLimitDecision.status);
  }

  const emailDecision = await sendContactEmail(request, env, submissionValue);

  if (!emailDecision.ok) {
    return contactJsonResponse(request, env, { ok: false, code: emailDecision.code }, emailDecision.status);
  }

  return contactJsonResponse(request, env, { ok: true, accepted: true, delivered: true }, 202);
}

function isContactEmergencyDisabled(env) {
  return parseFeatureFlag(env.CONTACT_FORM_ENABLED) === false;
}

function isWorkerFeatureEnabled(runtimeProfile, featureName) {
  return isFeatureEnabled(runtimeProfile, featureName);
}

function getContactConfigDecision(env) {
  const missing = [
    ['GCSS_COORDINATOR', env.GCSS_COORDINATOR],
    ['CONTACT_HMAC_SECRET', env.CONTACT_HMAC_SECRET],
    ['CONTACT_RECIPIENT_EMAIL', env.CONTACT_RECIPIENT_EMAIL],
    ['RESEND_API_KEY', env.RESEND_API_KEY],
    ['RESEND_FROM_EMAIL', env.RESEND_FROM_EMAIL],
    ['TURNSTILE_SECRET_KEY', env.TURNSTILE_SECRET_KEY],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    return { ok: false, status: 503, code: 'missing_contact_config' };
  }

  return { ok: true, status: 200, code: 'ok' };
}

async function readJsonRequestBody(request, maxBytes) {
  const bytes = await readRequestBodyBytes(request, maxBytes);
  const text = new TextDecoder().decode(bytes);

  return JSON.parse(text);
}

function normalizeContactSubmission(payload, env) {
  const honeypot = normalizeSingleLine(payload.company, 120);

  if (honeypot) {
    return { ok: true, honeypot: true };
  }

  const messageMaxLength = getContactLimit(env, 'CONTACT_MESSAGE_MAX_LENGTH', CONTACT_DEFAULT_LIMITS.messageMaxLength);
  const value = {
    name: normalizeSingleLine(payload.name, 80),
    email: normalizeEmail(payload.email),
    topic: normalizeContactToken(payload.topic),
    topicLabel: normalizeSingleLine(payload.topicLabel || payload.topic, 80),
    orderNumber: normalizeSingleLine(payload.orderNumber, 80),
    message: normalizeMultiline(payload.message, messageMaxLength),
    locale: normalizeContactToken(payload.locale) || 'unknown',
    pageUrl: normalizeUrlish(payload.pageUrl, 300),
    turnstileToken: normalizeSingleLine(payload.turnstileToken || payload['cf-turnstile-response'], 2048),
    privacyAccepted: payload.privacyAccepted === true || payload.privacyAccepted === 'true',
  };

  if (!value.name || !value.email || !value.topic || !value.topicLabel || !value.message) {
    return { ok: false, code: 'missing_required_fields' };
  }

  if (!isValidContactEmail(value.email)) {
    return { ok: false, code: 'invalid_email' };
  }

  if (!value.privacyAccepted) {
    return { ok: false, code: 'privacy_required' };
  }

  if (!value.turnstileToken) {
    return { ok: false, code: 'missing_turnstile_token' };
  }

  if (countLinks(value.message) > 2) {
    return { ok: false, code: 'too_many_links' };
  }

  return { ok: true, value };
}

function normalizeSingleLine(value, maxLength) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeMultiline(value, maxLength) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
    .slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeSingleLine(value, 254).toLowerCase();
}

function normalizeContactToken(value) {
  const token = normalizeSingleLine(value, 64).toLowerCase();

  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(token) ? token : '';
}

function normalizeUrlish(value, maxLength) {
  const urlish = normalizeSingleLine(value, maxLength);

  if (!urlish) {
    return '';
  }

  try {
    const url = new URL(urlish);

    return url.toString().slice(0, maxLength);
  } catch {
    return '';
  }
}

function isValidContactEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function countLinks(value) {
  return (value.match(/https?:\/\/|www\./gi) || []).length;
}

async function verifyContactTurnstile(request, env, token) {
  const response = await getContactFetch(env)(CONTACT_TURNSTILE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: getClientIp(request),
      idempotency_key: crypto.randomUUID(),
    }),
  });

  if (!response.ok) {
    return { ok: false, status: 502, code: 'turnstile_unavailable' };
  }

  const result = await response.json().catch(() => null);

  if (!result?.success) {
    return { ok: false, status: 400, code: 'turnstile_failed' };
  }

  if (result.hostname && !getAllowedContactHostnames(request, env).has(result.hostname)) {
    return { ok: false, status: 400, code: 'turnstile_hostname_mismatch' };
  }

  return { ok: true, status: 200, code: 'ok' };
}

const CONTACT_TURNSTILE_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function checkContactRateLimit(request, env, submission) {
  const limits = {
    daily: getContactLimit(env, 'CONTACT_DAILY_LIMIT', CONTACT_DEFAULT_LIMITS.daily),
    hourly: getContactLimit(env, 'CONTACT_HOURLY_LIMIT', CONTACT_DEFAULT_LIMITS.hourly),
    ipHourly: getContactLimit(env, 'CONTACT_IP_HOURLY_LIMIT', CONTACT_DEFAULT_LIMITS.ipHourly),
    ipDaily: getContactLimit(env, 'CONTACT_IP_DAILY_LIMIT', CONTACT_DEFAULT_LIMITS.ipDaily),
    emailHourly: getContactLimit(env, 'CONTACT_EMAIL_HOURLY_LIMIT', CONTACT_DEFAULT_LIMITS.emailHourly),
    emailDaily: getContactLimit(env, 'CONTACT_EMAIL_DAILY_LIMIT', CONTACT_DEFAULT_LIMITS.emailDaily),
  };
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const hour = now.toISOString().slice(0, 13);
  const [ipHash, emailHash] = await Promise.all([
    hmacContactValue(env.CONTACT_HMAC_SECRET, getClientIp(request)),
    hmacContactValue(env.CONTACT_HMAC_SECRET, submission.email),
  ]);
  const buckets = [
    {
      key: `contact:global:day:${day}`,
      limit: limits.daily,
      expiresAt: now.getTime() + 36 * 60 * 60 * 1000,
      code: 'contact_global_rate_limited',
    },
    {
      key: `contact:global:hour:${hour}`,
      limit: limits.hourly,
      expiresAt: now.getTime() + 2 * 60 * 60 * 1000,
      code: 'contact_global_rate_limited',
    },
    {
      key: `contact:ip:${ipHash}:hour:${hour}`,
      limit: limits.ipHourly,
      expiresAt: now.getTime() + 2 * 60 * 60 * 1000,
      code: 'contact_ip_rate_limited',
    },
    {
      key: `contact:ip:${ipHash}:day:${day}`,
      limit: limits.ipDaily,
      expiresAt: now.getTime() + 36 * 60 * 60 * 1000,
      code: 'contact_ip_rate_limited',
    },
    {
      key: `contact:email:${emailHash}:hour:${hour}`,
      limit: limits.emailHourly,
      expiresAt: now.getTime() + 2 * 60 * 60 * 1000,
      code: 'contact_email_rate_limited',
    },
    {
      key: `contact:email:${emailHash}:day:${day}`,
      limit: limits.emailDaily,
      expiresAt: now.getTime() + 36 * 60 * 60 * 1000,
      code: 'contact_email_rate_limited',
    },
  ];
  const coordinator = env.GCSS_COORDINATOR.getByName('contact-rate-limit:v1');
  const decision = await coordinator.consumeContactRateLimit(buckets, now.getTime());

  return decision.ok
    ? { ok: true, status: 200, code: 'ok' }
    : { ok: false, status: 429, code: decision.code };
}

function getContactLimit(env, key, fallback) {
  const value = Number(env[key]);

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function hmacContactValue(secret, value) {
  const signature = await signHmac({
    secret,
    body: textEncoder.encode(String(value || 'unknown').toLowerCase()),
  });

  return bytesToHex(signature).slice(0, 32);
}

async function sendContactEmail(request, env, submission) {
  const sentAt = new Date().toISOString();
  const text = [
    `Locale: ${submission.locale}`,
    `Topic: ${submission.topicLabel}`,
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Order number: ${submission.orderNumber || 'Not provided'}`,
    '',
    'Message:',
    submission.message,
    '',
    '---',
    `Source page: ${submission.pageUrl || request.url}`,
    `Submitted at: ${sentAt}`,
  ].join('\n');
  const html = `
    <p><strong>Locale:</strong> ${escapeHtml(submission.locale)}</p>
    <p><strong>Topic:</strong> ${escapeHtml(submission.topicLabel)}</p>
    <p><strong>Name:</strong> ${escapeHtml(submission.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>
    <p><strong>Order number:</strong> ${escapeHtml(submission.orderNumber || 'Not provided')}</p>
    <hr />
    <p>${escapeHtml(submission.message).replace(/\n/g, '<br />')}</p>
    <hr />
    <p><strong>Source page:</strong> ${escapeHtml(submission.pageUrl || request.url)}</p>
    <p><strong>Submitted at:</strong> ${escapeHtml(sentAt)}</p>
  `;
  const response = await getContactFetch(env)(CONTACT_EMAIL_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [env.CONTACT_RECIPIENT_EMAIL],
      reply_to: submission.email,
      subject: `[${brandName} Contact] ${submission.topicLabel} - ${submission.name}`,
      text,
      html,
    }),
  });

  if (!response.ok) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'gcss-v3-site-framework',
      message: 'contact_email_failed',
      status: response.status,
    }));

    return { ok: false, status: 502, code: 'contact_email_failed' };
  }

  return { ok: true, status: response.status, code: 'contact_email_sent' };
}

function getContactFetch(env) {
  return env.CONTACT_FETCH || fetch;
}

function getClientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('true-client-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function getAllowedContactOrigins(request, env) {
  const configuredOrigins = String(env.CONTACT_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length > 0) {
    return new Set(configuredOrigins);
  }

  return new Set([new URL(request.url).origin]);
}

function getAllowedContactHostnames(request, env) {
  return new Set(
    [...getAllowedContactOrigins(request, env)]
      .map((origin) => {
        try {
          return new URL(origin).hostname;
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  );
}

function getContactOriginDecision(request, env) {
  const origin = request.headers.get('origin') || new URL(request.url).origin;
  const allowedOrigins = getAllowedContactOrigins(request, env);

  if (!allowedOrigins.has(origin)) {
    return { ok: false, status: 403, code: 'origin_not_allowed' };
  }

  return { ok: true, status: 200, code: 'ok' };
}

/** @returns {Record<string, string>} */
function getContactCorsHeaders(request, env) {
  const origin = request.headers.get('origin');

  if (!origin || !getAllowedContactOrigins(request, env).has(origin)) {
    return {};
  }

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function contactOptionsResponse(request, env) {
  const originDecision = getContactOriginDecision(request, env);

  if (!originDecision.ok) {
    return contactJsonResponse(request, env, { ok: false, code: originDecision.code }, originDecision.status);
  }

  return new Response(null, {
    status: 204,
    headers: {
      allow: 'POST, OPTIONS',
      ...getContactCorsHeaders(request, env),
    },
  });
}

function contactJsonResponse(request, env, body, status = 200) {
  return jsonResponse(body, status, getContactCorsHeaders(request, env), request.method);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeWebhookEventId(value) {
  const eventId = String(value ?? '').trim();

  return eventId && eventId.length <= 256 ? eventId : '';
}

async function digestHex(value) {
  return bytesToHex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(String(value)))),
  );
}

function getCoordinatorNamespace(env) {
  return env.GCSS_COORDINATOR?.getByName ? env.GCSS_COORDINATOR : undefined;
}

async function claimWebhookEvent(env, { eventId, source }) {
  if (!eventId) {
    return { ok: false, status: 400, code: 'missing_webhook_event_id' };
  }

  const namespace = getCoordinatorNamespace(env);

  if (!namespace) {
    return { ok: false, status: 503, code: 'missing_webhook_coordinator' };
  }

  const eventHash = await digestHex(`${source}\0${eventId}`);
  const stub = namespace.getByName(`webhook:${source}:${eventHash}`);
  const now = Date.now();
  const claim = await stub.claimWebhookOnce({
    now,
    processingExpiresAt: now + WEBHOOK_PROCESSING_TTL_MS,
  });

  return {
    ok: true,
    status: 200,
    code: claim.claimed ? 'webhook_event_claimed' : 'duplicate_webhook_event',
    duplicate: !claim.claimed,
    eventHash,
    stub,
  };
}

async function completeWebhookEvent(stub) {
  const now = Date.now();
  const result = await stub.completeWebhookClaim({
    now,
    completedExpiresAt: now + WEBHOOK_COMPLETED_TTL_MS,
  });

  if (!result.completed) {
    throw new Error('webhook_claim_completion_failed');
  }
}

function normalizeShopifyArray(value) {
  return Array.isArray(value) ? value : [];
}

function projectShopifyImage(image) {
  return {
    id: image?.id ?? null,
    position: image?.position ?? null,
    src: image?.src ?? image?.url ?? null,
    alt: image?.alt ?? image?.altText ?? null,
    width: image?.width ?? null,
    height: image?.height ?? null,
    variantIds: normalizeShopifyArray(image?.variant_ids).map(String).sort(),
  };
}

function projectShopifyVariant(variant) {
  return {
    id: variant?.id ?? variant?.admin_graphql_api_id ?? null,
    title: variant?.title ?? null,
    position: variant?.position ?? null,
    option1: variant?.option1 ?? null,
    option2: variant?.option2 ?? null,
    option3: variant?.option3 ?? null,
    imageId: variant?.image_id ?? null,
  };
}

/**
 * 只投影会改变 C 目录结构或只读映射的字段；价格、库存、SKU、订单和可售状态均被排除。
 */
export function projectShopifyProductStructure(payload) {
  return {
    id: payload?.admin_graphql_api_id ?? payload?.id ?? null,
    title: payload?.title ?? null,
    handle: payload?.handle ?? null,
    status: payload?.status ?? null,
    publishedAt: payload?.published_at ?? null,
    vendor: payload?.vendor ?? null,
    productType: payload?.product_type ?? null,
    tags: normalizeShopifyArray(
      Array.isArray(payload?.tags)
        ? payload.tags
        : String(payload?.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
    ).map(String).sort(),
    options: normalizeShopifyArray(payload?.options).map((option) => ({
      id: option?.id ?? null,
      name: option?.name ?? null,
      position: option?.position ?? null,
      values: normalizeShopifyArray(option?.values).map(String),
    })),
    images: normalizeShopifyArray(payload?.images).map(projectShopifyImage),
    featuredImage: payload?.image ? projectShopifyImage(payload.image) : null,
    variants: normalizeShopifyArray(payload?.variants).map(projectShopifyVariant),
  };
}

async function getShopifyProductUpdateDecision({ body, env, eventId, shopDomain, topic }) {
  if (topic !== 'products/update') {
    return { ok: true, dispatch: true, code: 'dispatch_shopify_structure' };
  }

  let payload;

  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return { ok: false, status: 400, code: 'invalid_shopify_payload' };
  }

  const structure = projectShopifyProductStructure(payload);

  if (!structure.id) {
    return { ok: false, status: 400, code: 'missing_shopify_product_id' };
  }

  const namespace = getCoordinatorNamespace(env);

  if (!namespace) {
    return { ok: false, status: 503, code: 'missing_webhook_coordinator' };
  }

  const [fingerprint, productHash, owner] = await Promise.all([
    digestHex(JSON.stringify(structure)),
    digestHex(`${shopDomain || 'unknown-shop'}\0${structure.id}`),
    digestHex(eventId),
  ]);
  const stub = namespace.getByName(`shopify-product:${productHash}`);
  const now = Date.now();
  const decision = await stub.claimShopifyProductFingerprint({
    fingerprint,
    now,
    owner,
    processingExpiresAt: now + WEBHOOK_PROCESSING_TTL_MS,
  });

  if (decision.decision === 'busy') {
    return { ok: false, status: 503, code: 'shopify_product_update_busy' };
  }

  if (decision.decision === 'unchanged') {
    return {
      ok: true,
      dispatch: false,
      code: 'ignored_shopify_non_structural_update',
    };
  }

  return {
    ok: true,
    dispatch: true,
    code: 'dispatch_shopify_structure',
    complete: async () => {
      const result = await stub.completeShopifyProductFingerprint({ fingerprint, owner });
      if (!result.completed) throw new Error('shopify_fingerprint_completion_failed');
    },
    release: async () => {
      await stub.releaseShopifyProductFingerprint({ owner });
    },
  };
}

function getShopifyTopicDecision(topic) {
  if (SHOPIFY_IGNORED_TOPIC_PATTERNS.some((pattern) => pattern.test(topic))) {
    return { dispatch: false, code: 'ignored_shopify_runtime_topic' };
  }

  if (!SHOPIFY_STRUCTURAL_TOPICS.has(topic)) {
    return { dispatch: false, code: 'ignored_shopify_topic' };
  }

  return { dispatch: true, code: 'dispatch_shopify_structure' };
}

async function dispatchRepositoryEvent(env, { eventType, clientPayload }) {
  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPOSITORY) {
    return { ok: false, status: 503, code: 'missing_github_dispatch_config' };
  }

  const response = await getDispatchFetch(env)(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/dispatches`,
    {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        'content-type': 'application/json',
        'user-agent': 'gcss-v3-site-framework-worker',
        'x-github-api-version': env.GITHUB_API_VERSION || GITHUB_API_VERSION,
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: clientPayload,
      }),
    },
  );

  if (!response.ok) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'gcss-v3-site-framework',
      message: 'github_dispatch_failed',
      eventType,
      status: response.status,
    }));

    return { ok: false, status: 502, code: 'github_dispatch_failed' };
  }

  return { ok: true, status: response.status, code: 'github_dispatch_sent' };
}

function getDispatchFetch(env) {
  return env.GITHUB_DISPATCH_FETCH || fetch;
}

function fetchStaticAsset(request, env) {
  if (env.ASSETS?.fetch) {
    return env.ASSETS.fetch(request);
  }

  return jsonResponse({ ok: false, code: 'asset_binding_missing' }, 404);
}

function jsonResponse(body, status = 200, headers = {}, method = 'GET') {
  return new Response(method === 'HEAD' ? null : JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...headers,
    },
  });
}

function methodNotAllowed(allowedMethods, headers = {}) {
  return jsonResponse(
    { ok: false, code: 'method_not_allowed' },
    405,
    {
      allow: allowedMethods.join(', '),
      ...headers,
    },
  );
}

function getSanityWebhookSecret(request) {
  return (
    request.headers.get('x-sanity-webhook-secret') ||
    request.headers.get('x-gcss-webhook-secret') ||
    getBearerToken(request)
  );
}

function getBearerToken(request) {
  const authorization = request.headers.get('authorization');

  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return authorization.slice('bearer '.length).trim();
}

async function verifyProvidedSecret({ expectedSecret, providedSecret }) {
  if (!expectedSecret) {
    return { ok: false, status: 503, code: 'missing_worker_secret' };
  }

  if (!providedSecret) {
    return { ok: false, status: 401, code: 'missing_secret' };
  }

  const [expectedDigest, providedDigest] = await Promise.all([
    digestSecret(expectedSecret),
    digestSecret(providedSecret),
  ]);

  if (!constantTimeEqual(expectedDigest, providedDigest)) {
    return { ok: false, status: 401, code: 'invalid_secret' };
  }

  return { ok: true, status: 200, code: 'ok' };
}

async function digestSecret(secret) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(secret)));
}

async function verifyShopifyHmac({ body, hmacHeader, secret }) {
  const providedSignature = base64ToBytes(hmacHeader);

  if (!providedSignature) {
    return false;
  }

  const expectedSignature = await signHmac({ secret, body });

  return constantTimeEqual(expectedSignature, providedSignature);
}

async function signHmac({ secret, body }) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return new Uint8Array(await crypto.subtle.sign('HMAC', key, body));
}

async function readRequestBodyBytes(request, maxBytes) {
  const contentLength = Number(request.headers.get('content-length') || '0');

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new PayloadTooLargeError();
  }

  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    totalLength += chunk.byteLength;

    if (totalLength > maxBytes) {
      throw new PayloadTooLargeError();
    }

    chunks.push(chunk);
  }

  const body = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

function constantTimeEqual(left, right) {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = index < left.length ? left[index] : 0;
    const rightValue = index < right.length ? right[index] : 0;
    diff |= leftValue ^ rightValue;
  }

  return diff === 0;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(value) {
  try {
    const binary = atob(value.trim());

    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

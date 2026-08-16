import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

function uniqueName(prefix) {
  return `${prefix}:${crypto.randomUUID()}`;
}

describe('GcssCoordinator SQLite concurrency', () => {
  it('并发争用最后一个 Contact 额度时只放行一次', async () => {
    const stub = env.GCSS_COORDINATOR.getByName(uniqueName('contact'));
    const now = Date.now();
    const buckets = [{
      code: 'contact_ip_rate_limited',
      expiresAt: now + 60_000,
      key: 'contact:ip:test:hour',
      limit: 1,
    }];
    const results = await Promise.all(
      Array.from({ length: 8 }, () => stub.consumeContactRateLimit(buckets, now)),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(7);
  });

  it('同一 webhook 事件的并发 claim 只有一个成功', async () => {
    const stub = env.GCSS_COORDINATOR.getByName(uniqueName('webhook'));
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => stub.claimWebhookOnce({
        now,
        processingExpiresAt: now + 60_000,
      })),
    );

    expect(results.filter((result) => result.claimed)).toHaveLength(1);
    expect(results.filter((result) => !result.claimed)).toHaveLength(7);
  });

  it('过期 claim 清理后允许重新处理', async () => {
    const stub = env.GCSS_COORDINATOR.getByName(uniqueName('expiry'));
    const now = Date.now();

    expect((await stub.claimWebhookOnce({ now, processingExpiresAt: now + 1_000 })).claimed).toBe(true);
    await stub.cleanupExpired(now + 2_000);
    expect((await stub.claimWebhookOnce({
      now: now + 2_000,
      processingExpiresAt: now + 3_000,
    })).claimed).toBe(true);
  });

  it('相同 Shopify 结构指纹第二次返回 unchanged', async () => {
    const stub = env.GCSS_COORDINATOR.getByName(uniqueName('shopify-product'));
    const now = Date.now();
    const first = await stub.claimShopifyProductFingerprint({
      fingerprint: 'fingerprint-a',
      now,
      owner: 'event-a',
      processingExpiresAt: now + 60_000,
    });

    expect(first.decision).toBe('dispatch');
    expect((await stub.completeShopifyProductFingerprint({
      fingerprint: 'fingerprint-a',
      owner: 'event-a',
    })).completed).toBe(true);
    expect((await stub.claimShopifyProductFingerprint({
      fingerprint: 'fingerprint-a',
      now: now + 1,
      owner: 'event-b',
      processingExpiresAt: now + 60_001,
    })).decision).toBe('unchanged');
  });
});

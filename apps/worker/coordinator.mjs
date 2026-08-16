import { DurableObject } from 'cloudflare:workers';

const SCHEMA_VERSION = 1;

/**
 * 为 Contact 计数、Webhook 事件和 Shopify 商品结构指纹提供强一致协调。
 *
 * 每个 Contact 站点、Webhook 事件或 Shopify 商品都会映射到独立对象。这里仅保存短期计数、
 * 事件状态和结构指纹，不保存 Contact 正文，也不在 Durable Object 内执行外部网络请求。
 */
export class GcssCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.#migrate();
    });
  }

  #migrate() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const currentVersion = Number(
      this.ctx.storage.sql
        .exec('SELECT COALESCE(MAX(id), 0) AS version FROM _sql_schema_migrations')
        .one().version,
    );

    if (currentVersion < SCHEMA_VERSION) {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS contact_counters (
          bucket TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS contact_counters_expires_at
          ON contact_counters(expires_at);

        CREATE TABLE IF NOT EXISTS webhook_claim (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          state TEXT NOT NULL CHECK (state IN ('processing', 'completed')),
          expires_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS shopify_product_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          fingerprint TEXT,
          pending_owner TEXT,
          pending_fingerprint TEXT,
          pending_expires_at INTEGER
        );

        INSERT INTO _sql_schema_migrations (id) VALUES (${SCHEMA_VERSION});
      `);
    }
  }

  #deleteExpired(now) {
    this.ctx.storage.sql.exec('DELETE FROM contact_counters WHERE expires_at <= ?', now);
    this.ctx.storage.sql.exec('DELETE FROM webhook_claim WHERE expires_at <= ?', now);
    this.ctx.storage.sql.exec(`
      UPDATE shopify_product_state
      SET pending_owner = NULL, pending_fingerprint = NULL, pending_expires_at = NULL
      WHERE singleton = 1 AND pending_expires_at <= ?
    `, now);
  }

  async #scheduleNextAlarm() {
    const row = this.ctx.storage.sql.exec(`
      SELECT MIN(expires_at) AS expires_at
      FROM (
        SELECT expires_at FROM contact_counters
        UNION ALL
        SELECT expires_at FROM webhook_claim
        UNION ALL
        SELECT pending_expires_at AS expires_at
        FROM shopify_product_state
        WHERE pending_expires_at IS NOT NULL
      )
    `).one();

    if (row.expires_at === null || row.expires_at === undefined) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    await this.ctx.storage.setAlarm(Math.max(Number(row.expires_at), Date.now() + 1_000));
  }

  /**
   * 在一次输入门内检查并递增全部 Contact 桶，避免部分计数写入和 get-put 竞争。
   */
  async consumeContactRateLimit(buckets, now = Date.now()) {
    if (!Array.isArray(buckets) || buckets.length === 0 || buckets.length > 12) {
      throw new Error('invalid_contact_rate_limit_buckets');
    }

    const normalized = buckets.map((bucket) => {
      const key = String(bucket?.key ?? '');
      const limit = Number(bucket?.limit);
      const expiresAt = Number(bucket?.expiresAt);
      const code = String(bucket?.code ?? 'contact_rate_limited');

      if (!key || key.length > 256 || !Number.isInteger(limit) || limit < 1 || !Number.isFinite(expiresAt) || expiresAt <= now) {
        throw new Error('invalid_contact_rate_limit_bucket');
      }

      return { code, expiresAt: Math.floor(expiresAt), key, limit };
    });

    this.#deleteExpired(now);
    const counters = normalized.map((bucket) => {
      const row = this.ctx.storage.sql
        .exec('SELECT count FROM contact_counters WHERE bucket = ?', bucket.key)
        .toArray()[0];
      const current = Number(row?.count ?? 0);

      return { ...bucket, next: current + 1 };
    });
    const exceeded = counters.find((counter) => counter.next > counter.limit);

    if (exceeded) {
      await this.#scheduleNextAlarm();
      return { ok: false, code: exceeded.code };
    }

    for (const counter of counters) {
      this.ctx.storage.sql.exec(`
        INSERT INTO contact_counters (bucket, count, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(bucket) DO UPDATE SET
          count = excluded.count,
          expires_at = excluded.expires_at
      `, counter.key, counter.next, counter.expiresAt);
    }

    await this.#scheduleNextAlarm();
    return { ok: true, code: 'ok' };
  }

  /**
   * 为当前事件对象建立处理租约。每个 source+eventId 使用独立对象，因此单行即可原子判重。
   */
  async claimWebhookOnce({ now = Date.now(), processingExpiresAt }) {
    const expiresAt = Number(processingExpiresAt);

    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      throw new Error('invalid_webhook_claim_expiry');
    }

    this.#deleteExpired(now);
    const existing = this.ctx.storage.sql
      .exec('SELECT state, expires_at FROM webhook_claim WHERE singleton = 1')
      .toArray()[0];

    if (existing) {
      await this.#scheduleNextAlarm();
      return {
        claimed: false,
        state: existing.state,
        expiresAt: Number(existing.expires_at),
      };
    }

    this.ctx.storage.sql.exec(
      'INSERT INTO webhook_claim (singleton, state, expires_at) VALUES (1, ?, ?)',
      'processing',
      Math.floor(expiresAt),
    );
    await this.#scheduleNextAlarm();

    return { claimed: true, state: 'processing', expiresAt: Math.floor(expiresAt) };
  }

  async completeWebhookClaim({ now = Date.now(), completedExpiresAt }) {
    const expiresAt = Number(completedExpiresAt);

    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      throw new Error('invalid_webhook_completion_expiry');
    }

    this.#deleteExpired(now);
    const result = this.ctx.storage.sql.exec(`
      UPDATE webhook_claim
      SET state = 'completed', expires_at = ?
      WHERE singleton = 1 AND state = 'processing'
    `, Math.floor(expiresAt));
    await this.#scheduleNextAlarm();

    return { completed: result.rowsWritten === 1 };
  }

  async releaseWebhookClaim() {
    const result = this.ctx.storage.sql.exec(
      "DELETE FROM webhook_claim WHERE singleton = 1 AND state = 'processing'",
    );
    await this.#scheduleNextAlarm();
    return { released: result.rowsWritten === 1 };
  }

  /**
   * 串行比较同一 Shopify 商品的结构指纹。首次事件用于建立基线并保守触发一次构建。
   */
  async claimShopifyProductFingerprint({ fingerprint, now = Date.now(), owner, processingExpiresAt }) {
    const normalizedFingerprint = String(fingerprint ?? '');
    const normalizedOwner = String(owner ?? '');
    const expiresAt = Number(processingExpiresAt);

    if (!normalizedFingerprint || !normalizedOwner || !Number.isFinite(expiresAt) || expiresAt <= now) {
      throw new Error('invalid_shopify_fingerprint_claim');
    }

    this.#deleteExpired(now);
    const current = this.ctx.storage.sql.exec(`
      SELECT fingerprint, pending_owner, pending_fingerprint, pending_expires_at
      FROM shopify_product_state
      WHERE singleton = 1
    `).toArray()[0];

    if (current?.pending_owner && current.pending_owner !== normalizedOwner) {
      await this.#scheduleNextAlarm();
      return { decision: 'busy' };
    }

    if (current?.fingerprint === normalizedFingerprint) {
      await this.#scheduleNextAlarm();
      return { decision: 'unchanged' };
    }

    this.ctx.storage.sql.exec(`
      INSERT INTO shopify_product_state (
        singleton, fingerprint, pending_owner, pending_fingerprint, pending_expires_at
      ) VALUES (1, NULL, ?, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET
        pending_owner = excluded.pending_owner,
        pending_fingerprint = excluded.pending_fingerprint,
        pending_expires_at = excluded.pending_expires_at
    `, normalizedOwner, normalizedFingerprint, Math.floor(expiresAt));
    await this.#scheduleNextAlarm();

    return { decision: 'dispatch' };
  }

  async completeShopifyProductFingerprint({ fingerprint, owner }) {
    const result = this.ctx.storage.sql.exec(`
      UPDATE shopify_product_state
      SET fingerprint = ?, pending_owner = NULL, pending_fingerprint = NULL, pending_expires_at = NULL
      WHERE singleton = 1 AND pending_owner = ? AND pending_fingerprint = ?
    `, String(fingerprint ?? ''), String(owner ?? ''), String(fingerprint ?? ''));
    await this.#scheduleNextAlarm();
    return { completed: result.rowsWritten === 1 };
  }

  async releaseShopifyProductFingerprint({ owner }) {
    const result = this.ctx.storage.sql.exec(`
      UPDATE shopify_product_state
      SET pending_owner = NULL, pending_fingerprint = NULL, pending_expires_at = NULL
      WHERE singleton = 1 AND pending_owner = ?
    `, String(owner ?? ''));
    await this.#scheduleNextAlarm();
    return { released: result.rowsWritten === 1 };
  }

  async cleanupExpired(now = Date.now()) {
    this.#deleteExpired(now);
    await this.#scheduleNextAlarm();
    return { ok: true };
  }

  async alarm() {
    await this.cleanupExpired(Date.now());
  }
}

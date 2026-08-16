# Deployment Contract

The committed project contract determines build and runtime profile. Remote dashboards must not silently select a different profile.

## GitHub Actions

- Client workflows run from the independent Private repository created in the client GitHub Organization through the public framework Template repository. Do not deploy a formal client from the framework repository or a maintainer-owned copy.
- Pull-request validation uses local content and validates all profile contracts without external credentials. The workflow is build and dry-run validation; it does not publish a preview URL.
- Deploy exports `SITE_PROFILE`, `SANITY_STUDIO_SITE_PROFILE`, feature flags, and content source from `gcss.project.json`.
- A1 skips Studio, Sanity, Shopify, and Contact integration steps.
- A2 adds Contact Worker validation only.
- B builds Storefront and Studio from Sanity and skips all Shopify steps.
- C builds Storefront and Studio from Sanity and runs commerce/product checks.
- Template repository `main` does not auto-deploy. In the 0.x Preview, client production deployment remains manual-only; push or webhook auto-deploy is not part of the supported contract.
- `repository_dispatch` reaches only `rebuild-request.yml`, which records a generic receipt without checkout, secrets, build, or deploy. A maintainer must separately run `deploy.yml` from `main`.
- `deploy.yml` fails before checkout unless the `production` Environment sets `PRODUCTION_DEPLOYMENT_ARMED=true`. Environment secrets, deployment branch policy, and—where the GitHub plan supports it—required reviewers must be configured and verified remotely.
- [GitHub's deployment review documentation](https://docs.github.com/en/actions/how-tos/managing-workflow-runs-and-deployments/managing-deployments/reviewing-deployments) states that Free, Pro, and Team do not provide required reviewers for Private repositories. Such client repositories use the manual dispatch boundary and must not claim independent Environment approval; an independent reviewer requires an eligible GitHub plan or a separately designed protected deployment system.
- Client Actions secrets must target client-owned platform resources; template creation never copies repository secrets, environments, deployment history, or external service connections.

## Worker

- Version Worker name and non-secret profile vars in Wrangler config.
- Render the SQLite-backed `GCSS_COORDINATOR` Durable Object binding and `v1` migration for A2, B, and C; A1 omits both.
- Keep secrets in Worker secret storage.
- Validate with Wrangler dry-run before a real deploy.
- The current Worker exposes no Editorial/Draft Preview handler. `/preview` and `/preview/*` fail closed with `404`; they are not authenticated public APIs, and `PREVIEW_SECRET` or query-string tokens must not be configured as a substitute.
- A future Draft Preview may be enabled only after it serves real draft-aware HTML with identity authentication, short-lived sessions, `noindex`, profile-aware data boundaries, and auditable access; credentials must never be accepted from the URL query string.

## Webhooks

- Sanity publish rebuild-request dispatch is available only to B/C.
- Shopify structural rebuild-request dispatch is available only to C.
- The dispatch produces a receipt only. It never calls the production Deploy workflow automatically.
- Price, inventory, carts, orders, and ordinary transaction events do not produce a rebuild request.
- Verify signatures before dispatching GitHub Actions.
- Require Sanity `idempotency-key` and Shopify `X-Shopify-Webhook-Id`; use the coordinator to suppress a repeated event ID during the short claim window.
- For Shopify `products/update`, compare the stored catalog-structure fingerprint and ignore price, inventory, SKU, order, and `availableForSale`-only changes. The first observed update establishes a baseline and may conservatively dispatch once.
- The coordinator provides an atomic local claim, not cross-system exactly-once delivery. A successful claim permits at most one GitHub rebuild-request dispatch attempt during the claim window; an explicit GitHub non-2xx releases the claim for provider retry, while network-uncertain outcomes retain it temporarily. Receipt delivery does not prove that a build or deployment occurred.

## Live Writes

Creating Cloudflare resources, setting secrets, deploying Studio/Worker, registering webhooks, changing DNS, or writing a production dataset requires explicit user authorization.

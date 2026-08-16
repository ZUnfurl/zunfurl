# GCSS v3 Profiles

Choose a profile as a business contract first and a technical switch second. Optional features must be explicit in `gcss.project.json`.

The committed contract is authoritative at build and runtime. `SITE_PROFILE`, `CONTENT_SOURCE`, and feature variables may mirror it for deployment, but must never override it. Tests that need another profile use isolated fixture contracts or `createTestSiteProfileFromEnv` with `GCSS_TEST_*` names.

All profiles use the same repository and delivery lifecycle: create a client Private repository from the framework Template repository inside the client GitHub Organization, clone it as a separate Codex local project, initialize through reviewed dry-run, and complete client-owned platform handoff. Read `new-project-workflow.md`; profile choice never relaxes this lifecycle.

| Profile | Plan | Content CMS | Product CMS | Shopify | Contact |
| --- | --- | --- | --- | --- | --- |
| `static-brand` | A1 | No | No | No | Off |
| `static-brand` | A2 | No | No | No | On |
| `cms-brand` | B | Yes | No | No | Explicit |
| `retail` | C Retail Catalog & Content Foundation | Yes | Yes | Read-only catalog mapping | Explicit |

## A1

- Astro static pages and local versioned content.
- No Studio, Sanity, Shopify, product routes, webhook, Contact API, Resend, Turnstile, or coordinator binding.
- Customer requests updates from the maintainer.

## A2

- Same static site as A1.
- Enables only `/api/contact` and its Turnstile, Resend, HMAC, origin, and rate-limit dependencies.
- Does not become a CMS or catalog-content project.

## B

- Sanity page workbench for Home, About, Contact, and legal content as required.
- Sanity Image CDN is the normal editor image path; local files are administrator fallback.
- No Shopify env, product schema, product workbench, product launch wizard, or Shopify webhook.
- The B page schema contains only Home, About, and Contact page kinds; product-only nested fields and object types are not registered.
- Product catalog and product-content operations require an explicit move to C; they are not silently enabled in B.

## C Retail Catalog & Content Foundation

- Public Chinese name: **C 零售目录与内容运营基础框架**.
- Keeps the machine profile value `retail` for project-contract compatibility.
- Includes the B page CMS plus product workbench, launch wizard, language-level launch state, and read-only Shopify catalog mapping.
- Sanity owns product stories, SEO, editorial copy, and language state. Shopify remains authoritative for product identity, handle, and media facts.
- Sanity and structural Shopify catalog changes may produce a deduplicated rebuild-request receipt. The 0.x Preview never turns that receipt into an automatic production build or deploy.
- Does not include Cart, Checkout, payment, orders, tax, shipping, fulfillment, real-time price, or real-time inventory.
- Archive and unarchive change catalog-content visibility only; neither operation is Backup or Restore.

## Legal Route Selection

- `features.legalPages` is required and lists the only legal slugs that may be generated.
- Contact-enabled projects must include `privacy-policy`.
- A/B reject `shipping-returns-policy`; C may select it only when the real external business scope requires that policy. Selecting it does not add transaction capability to this framework.
- Unselected legal source templates may remain in the framework checkout, but do not become routes, sitemap entries, Contact links, or client-readiness blockers.

## Upgrade And Downgrade

Change profile configuration before deleting data. Preserve disabled Sanity product documents during C to B unless a separate destructive migration is explicitly approved. Read `profile-migrations.md`.

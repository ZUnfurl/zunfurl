---
name: gcss-v3-site-framework
description: Initialize, adapt, audit, upgrade, or downgrade projects built from gcss-v3-site-framework. Use for A1/A2/B/C delivery profiles, static-brand/cms-brand/retail setup, Astro and Sanity page models, the C Retail Catalog & Content Foundation with read-only Shopify catalog mapping, Cloudflare Worker routes, project configuration, customer handoff, profile validation, or deployment readiness.
---

# GCSS v3 Site Framework

Turn the GCSS template into a client project through one explicit project contract. Keep the workflow profile-driven, static-first, and strict about content, catalog, and infrastructure ownership.

## Core Contract

- Treat the public framework Template repository as the code product and this Skill as its execution workflow.
- Treat proxy registration as an implementation service, not platform ownership. Create every required production platform in a client-specific ownership boundary and hand it over as a client asset.
- Create the production repository in the client's GitHub Organization from day one. Do not start a formal client project in the maintainer's personal namespace unless the user explicitly accepts a later transfer plan.
- Initialize a client only from a Codex local project rooted at that client's cloned repository. Do not initialize a client inside the framework template checkout or another client's workspace.
- Use `gcss.project.json` as the committed source of truth for identity, profile, locales, content source, Contact, and enabled legal routes.
- Keep internal `gcss-*` workspace package names stable so framework updates remain portable. Rename only the root client project, Studio, Worker, domain, copy, legal facts, and assets.
- Never infer Contact, Shopify, locale, or production deployment choices when the project contract can state them explicitly.

## Standard Workflow

1. Read and follow `references/new-project-workflow.md`. It is mandatory for A1, A2, B, and C.
2. Confirm the Codex task is running from a local project rooted at the cloned client repository. Stop if the working directory is the framework checkout or another client project.
3. Verify `git remote -v` points to the client GitHub Organization, then inspect `AGENTS.md`, `README.md`, `gcss.project.json`, `package.json`, `.env.example`, `packages/config`, apps, workflows, and Git status.
4. Select exactly one delivery profile. Read `references/profiles.md` and its matching new-project guide.
5. Establish the client platform boundary before production setup. Read `references/platform-ownership-and-handoff.md`.
6. Create or update a project contract containing project name, brand name, domain, profile, default locale, active locales, content source, `contactForm`, and an explicit `legalPages` selection.
7. Run `npm.cmd run init:project:dry-run -- --config <config-path>` before any template write.
8. Apply initialization only after reviewing the plan: `npm.cmd run init:project -- --config <config-path> --write`.
9. Run `npm.cmd run project:scan`; replace remaining brand copy, legal facts, and visual assets manually.
10. Configure only services enabled by the contract. Read `references/service-and-secret-matrix.md` and `references/deployment.md` before external setup.
11. Validate the selected profile with `references/validation.md` and `references/acceptance.md`.
12. Deliver a separate platform ownership register to authorized client administrators, and keep daily customer manuals limited to the purchased profile.
13. Commit, push, deploy, or write remote data only when the user has authorized the corresponding action.

## Profile Routing

- `static-brand` + `contactForm=false`: A1, fully static site.
- `static-brand` + `contactForm=true`: A2, static pages with the minimal Contact Worker route.
- `cms-brand`: B, Sanity page CMS without Shopify or product CMS.
- `retail`: C Retail Catalog & Content Foundation, with Sanity product content operations and read-only Shopify catalog mapping.

Read only the matching guide:

- A1/A2: `references/new-project-static-brand.md`
- B: `references/new-project-cms-brand.md`
- C: `references/new-project-retail.md`

## Non-Negotiable Boundaries

- Sanity owns editorial content, SEO, language launch state, and read-only Shopify catalog mapping summaries.
- Shopify remains the external source for product identity, handle, media, and any transaction facts; the framework never writes Shopify product or transaction data.
- C does not include Cart, Checkout, payment, orders, tax, shipping, fulfillment, real-time price, or real-time inventory.
- Price, inventory, SKU, order, payment, and fulfillment fields must not be written into Sanity or static content.
- Content images use Sanity Image CDN first; local paths are administrator fallback. Shopify product media remains Shopify-owned.
- Worker routes stay minimal. Do not proxy all Shopify or Sanity traffic and do not store Contact message bodies.
- Do not change production profile, content source, or profile-defined capabilities through environment overrides. Test matrices must use isolated project contracts or the explicit test-only profile constructor.
- Generate legal routes only from `features.legalPages`. A/B must not select `shipping-returns-policy`; Contact-enabled projects must select `privacy-policy`.
- Archive and unarchive are reversible content-visibility lifecycle operations. They are not Backup or Restore and do not create a recovery point.
- Destructive deletes and production migrations require explicit confirmation and must not imply recoverability without separately verified backup evidence.

## Reference Routing

- `references/profiles.md`: profile and feature matrix.
- `references/new-project-workflow.md`: mandatory Template repository, client repository, dry-run, implementation, and complete-handoff sequence shared by every profile.
- `references/content-model.md`: Sanity-to-Astro one-to-one page and product model.
- `references/image-policy.md`: Sanity, Shopify, and local image ownership.
- `references/contact-form.md`: Contact form security and data boundary.
- `references/platform-ownership-and-handoff.md`: client-owned accounts, proxy registration, repository ownership, credential rotation, and final handoff.
- `references/service-and-secret-matrix.md`: credential purpose and destination.
- `references/deployment.md`: GitHub Actions, Studio, Worker, and webhook deployment rules.
- `references/retail-operations.md`: C catalog-content lifecycle.
- `references/profile-migrations.md`: A/B/C upgrade and downgrade rules.
- `references/customer-docs.md`: customer manual scope.
- `references/validation.md`: automated checks.
- `references/acceptance.md`: manual handoff and live smoke tests.
- `references/compatibility.md`: framework version and API pinning policy.

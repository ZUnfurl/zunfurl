# Profile Migrations

Use a reviewed migration plan and backup before changing an existing client profile.

## A1 To A2

Enable Contact, add Worker secrets and the coordinator binding, build the public Turnstile key, and test one authorized submission. No CMS is added.

## A To B

Create Sanity project/dataset, seed page documents, deploy Studio, switch production content source to Sanity, and give the customer only the page manual.

## B To C

Change the committed profile, connect Shopify Storefront API, enable product schemas/tools/routes, configure structural webhook dispatch, seed the first product template, review `features.legalPages` against the real external business scope, and deliver the retail manual. Do not add a shipping/returns route merely because the machine profile is `retail`.

## C To B

Disable commerce and product CMS in the committed profile, routes, Studio, Worker, workflows, env, and customer docs. Remove `shipping-returns-policy` from `features.legalPages`. Preserve historical product documents unless destructive migration is separately approved.

## B To A

Export/freeze approved Sanity content into local versioned content, switch to local source, remove customer Studio dependency, and document maintainer-managed updates. Do not delete the dataset as part of the profile switch.

## Rules

- Profile change and data deletion are separate operations.
- Preview the target profile before changing production.
- Keep a rollback point and test disabled routes, tools, schemas, docs, and secrets.
- Do not perform a migration by overriding `SITE_PROFILE`, `CONTENT_SOURCE`, or profile-defined features in the environment; initialize and validate a new contract first.

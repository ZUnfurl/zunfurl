# C Retail Catalog & Content Foundation Operations

These operations manage catalog content and visibility. They do not provide Cart, Checkout, payment, orders, tax, shipping, fulfillment, real-time price, or real-time inventory.

## Add A Catalog Item

1. Create the product record in Shopify and expose it to the Headless channel for read-only catalog access.
2. Open Sanity 商品上线向导.
3. Refresh Shopify products and choose the matching product.
4. Choose target languages and an empty or existing content template.
5. Create locale pages and sync the read-only Shopify mapping.
6. Edit card copy, detail hero, stories, SEO, and language launch state.
7. Publish only reviewed languages.

## Shopify Catalog Changes

- Live CLI checks are separate authorized integration tests and always require an explicit product, for example `npm.cmd run shopify:summary:preview -- --handle <shopify-handle>`; normal C build/deploy never assumes `example-product`.
- Product title, handle, media, or supported variant-summary differences produce `映射需同步`.
- Sync updates only the master read-only mapping.
- `availableForSale` and variant availability are runtime hints only. A current unavailable snapshot may be shown to editors, but it never decides whether Sanity content is eligible to enter the storefront build; that gate uses the mapped Product GID/handle plus Sanity master and locale lifecycle state.
- Do not overwrite translated names, slug, SEO, story, or locale launch state.
- Do not rebind an old Sanity product to a different Shopify product; create a new product using the old content as a template.

## Lifecycle

- Unpublish one locale without deleting its content.
- Archive the master to remove the entire product from normal operations and storefront builds.
- Unarchive the master to return the content record to normal operations; review locale states before publishing.
- Archive and unarchive are content-visibility lifecycle actions, not Backup or Restore, and do not create a recovery point.
- Destructive delete is outside normal customer operations, requires separate administrator review, and carries no recoverability promise in the current public contract.
- Never delete the Shopify product from Sanity operations.

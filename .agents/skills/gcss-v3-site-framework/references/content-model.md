# Content Model Contract

Keep Studio modules and Astro rendering components one-to-one. Do not collapse all pages into an unbounded generic block builder.

## Shared Shell

- `SiteDocument.astro`: HTML document, metadata, global styles.
- `SiteFrame.astro`: header, main region, footer, locale and theme shell.

## Page Modules

| Sanity field | Astro component | Purpose |
| --- | --- | --- |
| Home `hero` | `HomeHero.astro` | Home-only motion hero |
| Home `brandFramework` | `BrandFrameworkSection.astro` | Brand framework carousel |
| Home `homeProductSpotlight` | `ProductSpotlightSection.astro` | C-only product spotlight framing |
| Home `contactMaskSection` | `HomeContactCtaSection.astro` | Home contact entry |
| Inner `pageHero` | `BrandPageHero.astro` | About, Products, Contact hero |
| About `aboutSignature` | `AboutSignatureSection.astro` | Structured image-text panels |
| Contact `contactSection` | `ContactSection.astro` | Contact explanation and form |
| Products `productSpotlight` | `ProductSpotlightSection.astro` | Product list framing |
| Inner `blocks` | `BrandContentBlocks.astro` | Optional reusable content blocks |

Use fieldsets and groups as filters over the same ordered model. `All fields` must remain understandable without switching tabs.

For B, the registered `page` schema removes the `products` kind, `homeProductSpotlight`, `productSpotlight`, their fieldsets, and the product-only nested object types. Hiding a tool or field in the UI is not sufficient isolation.

## Legal Routes

Legal Markdown files are framework source templates, not automatically published pages. The Storefront generates only the slugs listed in `gcss.project.json -> features.legalPages`; direct reads of an unselected slug fail closed and the sitemap and Contact notice use the same selection.

## Retail Product Model

- `productPage`: one language-neutral master with lifecycle state and Shopify read-only mapping.
- `productLocalePage`: one document per product and locale containing card copy, detail hero, story sections, SEO, and language launch state.
- Frontend eligibility requires an active master, mapped Shopify Product GID and handle, and a live locale page. `availableForSale` is a runtime hint only and never a Sanity content launch gate.
- Product card, detail hero, and story fields remain distinct Studio modules even when one locale document owns all three.

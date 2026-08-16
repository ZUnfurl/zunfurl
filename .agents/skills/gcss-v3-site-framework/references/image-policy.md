# Image Ownership

Classify every image before adding a field.

## Editorial Content Images

- Default editor path: Sanity Image CDN.
- Local path: administrator fallback only.
- Require exactly one usable source at publish/build time.
- Preserve alt text as accessibility content; captions and eyebrows are separate visible copy.

## Shopify Product Media

- Shopify is the source of truth for primary SKU and product media.
- Fetch product media at build time for C projects.
- Do not copy price, SKU, inventory, or media ownership into Sanity.
- Local product images are emergency administrator fallback, not the normal editor workflow.

## System Assets

Keep logos, icons, masks, favicons, and fixed UI assets versioned in `public/brand-assets/`.

## Prohibited Uses

- Do not use R2 as an editor-facing DAM.
- Do not proxy every image through Worker.
- Do not expose local fallback controls as the default customer choice.

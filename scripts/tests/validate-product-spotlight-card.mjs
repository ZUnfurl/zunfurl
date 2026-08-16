import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const componentPath = join(
  root,
  "apps",
  "storefront",
  "src",
  "components",
  "product",
  "ProductCard.astro",
);

const source = readFileSync(componentPath, "utf8");

const requiredTokens = [
  "primaryImage",
  "product.name",
  "product.tagline",
  "roadmapLinkLabel",
  "product-card__image",
  "product-card__title",
  "product-card__description",
  "product-card__link",
  "/products/${product.slug}/",
];

const missingTokens = requiredTokens.filter((token) => !source.includes(token));

if (missingTokens.length > 0) {
  throw new Error(
    `ProductCard.astro is missing minimal product card tokens: ${missingTokens.join(
      ", ",
    )}`,
  );
}

const forbiddenTokens = [
  "roadmapEyebrow",
  "roadmapPill",
  "roadmapDescription",
  "roadmapFooterPrimary",
  "roadmapFooterSecondary",
  "shortDescription",
  "spotlight__eyebrow",
  "spotlight__pill",
  "spotlight__description",
  "spotlight__footer",
];

const leakedTokens = forbiddenTokens.filter((token) => source.includes(token));

if (leakedTokens.length > 0) {
  throw new Error(
    `ProductCard.astro must stay minimal and not render legacy card tokens: ${leakedTokens.join(
      ", ",
    )}`,
  );
}

const sectionPath = join(
  root,
  "apps",
  "storefront",
  "src",
  "components",
  "product",
  "ProductSpotlightSection.astro",
);
const sectionSource = readFileSync(sectionPath, "utf8");

if (!sectionSource.includes('import ProductCard from "./ProductCard.astro"')) {
  throw new Error("ProductSpotlightSection.astro must delegate cards to ProductCard.astro.");
}

const contentSource = readFileSync(
  join(root, "apps", "storefront", "src", "lib", "content", "contentSource.ts"),
  "utf8",
);
const commerceMediaSource = readFileSync(
  join(root, "apps", "storefront", "src", "lib", "content", "commerceMedia.ts"),
  "utf8",
);

const requiredShopifyMediaTokens = [
  "createShopifyStorefrontClientFromEnv",
  "getProductSummaryByHandle",
  "primaryImage: images[0].url",
  "detailHero:",
  "gallery: images.map",
];
const missingShopifyMediaTokens = requiredShopifyMediaTokens.filter(
  (token) => !commerceMediaSource.includes(token),
);

for (const token of [
  "applyShopifyMediaToProduct",
  "applyShopifyMediaToProducts",
  "applyShopifyMediaToProductStory",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`contentSource.ts must use Shopify media helper: ${token}`);
  }
}

if (missingShopifyMediaTokens.length > 0) {
  throw new Error(
    `Product media must be resolved from Shopify at build time: ${missingShopifyMediaTokens.join(
      ", ",
    )}`,
  );
}

console.log("Product card renders the four-field minimal storefront card.");

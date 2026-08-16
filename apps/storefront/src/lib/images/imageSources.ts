export type ContentImageSource = "sanity" | "local";

export interface ContentImageInput {
  imageSource?: ContentImageSource;
  sanityImageUrl?: string;
  sanityImageAssetRef?: string;
  src?: string;
  image?: string;
  imagePath?: string;
  alt?: string;
  imageAlt?: string;
  title?: string;
  eyebrow?: string;
  caption?: string;
  description?: string;
}

export interface ResolvedContentImage {
  src: string;
  alt: string;
  sourceType: ContentImageSource;
}

interface ResolveContentImageOptions {
  altFallback?: string;
  decorative?: boolean;
  localKeys?: Array<"src" | "image" | "imagePath">;
}

function firstNonEmpty(values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

export function resolveContentImage(
  input: ContentImageInput,
  options: ResolveContentImageOptions = {},
): ResolvedContentImage {
  const localKeys = options.localKeys ?? ["src", "imagePath", "image"];
  const localSrc = firstNonEmpty(localKeys.map((key) => input[key]));
  const sanitySrc = firstNonEmpty([input.sanityImageUrl]);
  const preferredSource = input.imageSource === "local" ? "local" : "sanity";
  const src =
    preferredSource === "local"
      ? firstNonEmpty([localSrc, sanitySrc])
      : firstNonEmpty([sanitySrc, localSrc]);

  if (!src) {
    throw new Error("Missing image source: expected Sanity image or administrator fallback path.");
  }

  const sourceType: ContentImageSource = src === sanitySrc ? "sanity" : "local";
  const alt = options.decorative
    ? ""
    : (firstNonEmpty([input.alt, input.imageAlt, options.altFallback, input.title]) ?? "");

  return { src, alt, sourceType };
}

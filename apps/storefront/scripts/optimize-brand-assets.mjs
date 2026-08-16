import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const brandAssetsDir = path.join(projectRoot, "public", "brand-assets");
const srcDir = path.join(projectRoot, "src");

const rasterExtensions = new Set([".jpg", ".jpeg", ".png"]);
const textExtensions = new Set([
  ".astro",
  ".css",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
]);

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPreset(relativePath) {
  const normalized = toPosix(relativePath).toLowerCase();

  if (normalized.includes("/transparency/")) {
    return { maxWidth: 2400, maxHeight: 2400, quality: 82 };
  }

  if (normalized.startsWith("hero/") || normalized.startsWith("brand/")) {
    return { maxWidth: 2560, maxHeight: 2560, quality: 78 };
  }

  if (normalized.startsWith("products/")) {
    return { maxWidth: 1800, maxHeight: 1800, quality: 80 };
  }

  if (normalized.startsWith("logo/") || normalized.startsWith("logos/")) {
    return { maxWidth: 1800, maxHeight: 1800, quality: 90 };
  }

  return { maxWidth: 2200, maxHeight: 2200, quality: 80 };
}

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

async function optimizeRaster(filePath) {
  const relativePath = path.relative(brandAssetsDir, filePath);
  const outputRelativePath = relativePath.replace(/\.(png|jpe?g)$/i, ".webp");
  const outputPath = path.join(brandAssetsDir, outputRelativePath);
  const preset = getPreset(relativePath);
  const transformer = sharp(filePath, { animated: false, limitInputPixels: false });
  const metadata = await transformer.metadata();
  const sourceStats = await fs.stat(filePath);

  let pipeline = transformer.rotate();

  if (metadata.width && metadata.height) {
    pipeline = pipeline.resize({
      width: preset.maxWidth,
      height: preset.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await pipeline
    .webp({
      quality: preset.quality,
      alphaQuality: 92,
      effort: 6,
      smartSubsample: true,
    })
    .toFile(outputPath);

  const outputStats = await fs.stat(outputPath);

  return {
    from: `/brand-assets/${toPosix(relativePath)}`,
    to: `/brand-assets/${toPosix(outputRelativePath)}`,
    sourcePath: filePath,
    outputPath,
    beforeBytes: sourceStats.size,
    afterBytes: outputStats.size,
  };
}

async function updateSourceReferences(replacements) {
  const sourceFiles = await collectFiles(srcDir);
  const changedFiles = [];
  const sortedReplacements = [...replacements].sort((left, right) => right.from.length - left.from.length);

  for (const filePath of sourceFiles) {
    const extension = path.extname(filePath).toLowerCase();

    if (!textExtensions.has(extension)) {
      continue;
    }

    const original = await fs.readFile(filePath, "utf8");
    let updated = original;

    for (const replacement of sortedReplacements) {
      updated = updated.replace(
        new RegExp(escapeRegExp(replacement.from), "g"),
        replacement.to,
      );
    }

    if (updated !== original) {
      await fs.writeFile(filePath, updated, "utf8");
      changedFiles.push(path.relative(projectRoot, filePath));
    }
  }

  return changedFiles;
}

async function main() {
  const assetFiles = await collectFiles(brandAssetsDir);
  const rasterFiles = assetFiles.filter((filePath) =>
    rasterExtensions.has(path.extname(filePath).toLowerCase()),
  );

  const conversions = [];

  for (const filePath of rasterFiles) {
    conversions.push(await optimizeRaster(filePath));
  }

  const changedFiles = await updateSourceReferences(conversions);

  for (const conversion of conversions) {
    await fs.rm(conversion.sourcePath, { force: true });
  }

  const totalBefore = conversions.reduce((sum, item) => sum + item.beforeBytes, 0);
  const totalAfter = conversions.reduce((sum, item) => sum + item.afterBytes, 0);
  const savedBytes = totalBefore - totalAfter;

  console.log(`Optimized ${conversions.length} brand assets.`);
  console.log(`Updated ${changedFiles.length} source files.`);
  console.log(`Size: ${(totalBefore / 1024 / 1024).toFixed(2)} MB -> ${(totalAfter / 1024 / 1024).toFixed(2)} MB.`);
  console.log(`Saved ${(savedBytes / 1024 / 1024).toFixed(2)} MB.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
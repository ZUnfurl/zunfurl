import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const options = {
    outFile: undefined,
    runId: createDefaultRunId(),
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--out') {
      options.outFile = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--run-id') {
      options.runId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function createDefaultRunId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function buildRestoreCheckPlan({ runId = createDefaultRunId() } = {}) {
  const prefixes = {
    sanityAssets: `backup/sanity-assets/${runId}/`,
    shopifyOriginals: `backup/shopify-originals/${runId}/`,
    brandMasters: `backup/brand-masters/${runId}/`,
  };

  return {
    version: 1,
    status: 'roadmap-design',
    mode: 'dry-run',
    source: 'restore-check-plan',
    createdAt: new Date().toISOString(),
    capabilities: {
      export: false,
      import: false,
      restore: false,
    },
    r2: {
      bucketEnv: 'R2_BACKUP_BUCKET',
      publicBucket: false,
      writesToR2: false,
      deletesFromR2: false,
    },
    prefixes,
    checks: [
      {
        kind: 'sanity-dataset-export-present',
        r2Key: `${prefixes.sanityAssets}dataset.ndjson`,
        required: true,
        plannedOnly: true,
      },
      {
        kind: 'sanity-assets-manifest-present',
        r2Key: `${prefixes.sanityAssets}assets-manifest.json`,
        required: true,
        plannedOnly: true,
      },
      {
        kind: 'shopify-products-export-present',
        r2Key: `${prefixes.shopifyOriginals}products.jsonl`,
        required: true,
        plannedOnly: true,
      },
      {
        kind: 'shopify-media-manifest-present',
        r2Key: `${prefixes.shopifyOriginals}media-manifest.json`,
        required: true,
        plannedOnly: true,
      },
      {
        kind: 'brand-masters-manifest-present',
        r2Key: `${prefixes.brandMasters}manifest.json`,
        required: true,
        plannedOnly: true,
      },
    ],
    safety: {
      dryRunOnly: true,
      productionDatasetImport: false,
      remoteDelete: false,
      r2PublicAccessChange: false,
      operatorOneClickProductionImport: false,
    },
  };
}

async function maybeWriteJson(outFile, manifest) {
  if (!outFile) {
    return;
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const manifest = buildRestoreCheckPlan({
    runId: options.runId,
  });

  await maybeWriteJson(options.outFile, manifest);

  if (options.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return manifest;
  }

  console.log('Roadmap-only restore-check design manifest generated.');
  console.log('No export, import, restore, or remote write was performed.');
  console.log(`Sanity prefix: ${manifest.prefixes.sanityAssets}`);
  console.log(`Shopify prefix: ${manifest.prefixes.shopifyOriginals}`);
  console.log(`Brand masters prefix: ${manifest.prefixes.brandMasters}`);

  if (options.outFile) {
    console.log(`Manifest written: ${options.outFile}`);
  }

  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

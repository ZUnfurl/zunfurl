import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSanitySeed } from '../migrations/local-content-to-sanity.mjs';

const defaultDataset = 'development';

function parseArgs(argv) {
  const options = {
    dataset: defaultDataset,
    outFile: undefined,
    runId: createDefaultRunId(),
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dataset') {
      options.dataset = argv[index + 1];
      index += 1;
      continue;
    }

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

function assertDevelopmentDataset(dataset) {
  if (dataset !== defaultDataset) {
    throw new Error(`Refusing Sanity backup planning for non-development dataset: ${dataset}.`);
  }
}

function createSanityBackupManifest({ seed, dataset, runId }) {
  const prefix = `backup/sanity-assets/${runId}/`;

  return {
    version: 1,
    status: 'roadmap-design',
    mode: 'dry-run',
    source: 'sanity-development',
    createdAt: new Date().toISOString(),
    dataset,
    capabilities: {
      export: false,
      import: false,
      restore: false,
    },
    r2: {
      bucketEnv: 'R2_BACKUP_BUCKET',
      prefix,
      publicBucket: false,
      writesToR2: false,
      deletesFromR2: false,
    },
    artifacts: [
      {
        kind: 'sanity-dataset-export',
        source: 'local-content-to-sanity',
        r2Key: `${prefix}dataset.ndjson`,
        documentCount: seed.documents.length,
        counts: seed.counts,
        plannedOnly: true,
      },
      {
        kind: 'sanity-assets-manifest',
        source: 'sanity-asset-references',
        r2Key: `${prefix}assets-manifest.json`,
        plannedOnly: true,
      },
      {
        kind: 'restore-check-manifest',
        source: 'restore-check',
        r2Key: `${prefix}restore-check.json`,
        plannedOnly: true,
      },
    ],
    safety: {
      dryRunOnly: true,
      productionDatasetWrite: false,
      r2PublicAccessChange: false,
      r2Delete: false,
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

export async function buildSanityBackupPlan({
  dataset = defaultDataset,
  runId = createDefaultRunId(),
} = {}) {
  assertDevelopmentDataset(dataset);

  const seed = await buildSanitySeed();

  return createSanityBackupManifest({
    seed,
    dataset,
    runId,
  });
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const manifest = await buildSanityBackupPlan({
    dataset: options.dataset,
    runId: options.runId,
  });

  await maybeWriteJson(options.outFile, manifest);

  if (options.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return manifest;
  }

  console.log('Roadmap-only Sanity backup design manifest generated.');
  console.log('No export, import, restore, or remote write was performed.');
  console.log(`Dataset: ${manifest.dataset}`);
  console.log(`R2 prefix: ${manifest.r2.prefix}`);
  console.log(`Documents: ${manifest.artifacts[0].documentCount}`);

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

import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  getProjectFeatureFlags,
  getProjectVariant,
  loadProjectConfig,
} from './project-config.mjs';

function parseArgs(argv) {
  const options = { config: 'gcss.project.json', githubEnv: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config' || arg === '--github-env') {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}.`);
      options[arg === '--config' ? 'config' : 'githubEnv'] = value;
      index += 1;
    } else if (arg.startsWith('--config=')) options.config = arg.slice('--config='.length);
    else if (arg.startsWith('--github-env=')) options.githubEnv = arg.slice('--github-env='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function getProjectEnvironment(config) {
  const features = getProjectFeatureFlags(config);
  return {
    SITE_PROFILE: config.delivery.profile,
    SANITY_STUDIO_SITE_PROFILE: config.delivery.profile,
    CONTENT_SOURCE: config.delivery.contentSource,
    SITE_FEATURE_CONTACT_FORM: String(features.contactForm),
    SANITY_STUDIO_FEATURE_CONTACT_FORM: String(features.contactForm),
    GCSS_PROJECT_VARIANT: getProjectVariant(config),
    GCSS_TEMPLATE_MODE: String(config.templateMode),
    GCSS_PROJECT_NAME: config.identity.projectName,
    GCSS_BRAND_NAME: config.identity.brandName,
    GCSS_SITE_URL: `https://${config.identity.domain}`,
    GCSS_WORKER_NAME: config.deployment.workerName,
    GCSS_STUDIO_HOST: config.deployment.studioHost,
    GCSS_HAS_STUDIO: String(features.studio),
    GCSS_HAS_COMMERCE: String(features.commerce),
    GCSS_HAS_CONTACT: String(features.contactForm),
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const config = await loadProjectConfig(options.config);
  const environment = getProjectEnvironment(config);
  const content = `${Object.entries(environment).map(([name, value]) => `${name}=${value}`).join('\n')}\n`;

  if (options.githubEnv) await appendFile(options.githubEnv, content, 'utf8');
  else process.stdout.write(content);
  return environment;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}

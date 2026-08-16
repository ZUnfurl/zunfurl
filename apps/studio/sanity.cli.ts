import { defineCliConfig } from 'sanity/cli';
import { studioHost as configuredStudioHost } from 'gcss-config';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'exampleproject';
const dataset = process.env.SANITY_STUDIO_DATASET || 'development';
const studioHost = process.env.SANITY_STUDIO_HOST || configuredStudioHost;

export default defineCliConfig({
  api: {
    projectId,
    dataset,
  },
  studioHost,
});

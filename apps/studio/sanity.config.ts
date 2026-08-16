import { visionTool } from '@sanity/vision';
import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { brandName, projectName } from 'gcss-config';
import { createSchemaTypesForFeatures } from 'gcss-schemas';
import PageOperationsTool from './src/pageOperations/PageOperationsTool';
import ProductLaunchWizard from './src/productLaunch/ProductLaunchWizard';
import ProductOperationsTool from './src/productOperations/ProductOperationsTool';
import {
  isStudioContentCmsEnabled,
  isStudioProductCmsEnabled,
} from './src/studioProfile';
import { structure } from './src/structure';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'exampleproject';
const dataset = process.env.SANITY_STUDIO_DATASET || 'development';
const schemaTypes = createSchemaTypesForFeatures({
  contentCms: isStudioContentCmsEnabled(),
  productCms: isStudioProductCmsEnabled(),
});

export default defineConfig({
  name: `${projectName}-studio`,
  title: `${brandName} Studio`,
  projectId,
  dataset,
  plugins: [structureTool({ structure, title: '全部内容' }), visionTool()],
  schema: {
    types: schemaTypes,
  },
  tools: (previousTools) => [
    ...(isStudioContentCmsEnabled()
      ? [
          {
            name: 'page-operations',
            title: '页面工作台',
            component: PageOperationsTool,
          },
        ]
      : []),
    ...(isStudioProductCmsEnabled()
      ? [
          {
            name: 'product-operations',
            title: '商品工作台',
            component: ProductOperationsTool,
          },
          {
            name: 'product-launch',
            title: '商品上线向导',
            component: ProductLaunchWizard,
          },
        ]
      : []),
    ...previousTools,
  ],
});

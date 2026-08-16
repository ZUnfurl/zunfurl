import type { SchemaTypeDefinition } from 'sanity';

export const schemaTypes: SchemaTypeDefinition[];
export const contentDocumentSchemaTypeNames: string[];
export const commerceDocumentSchemaTypeNames: string[];
export const commerceNestedSchemaTypeNames: string[];

export function createSchemaTypesForFeatures(features?: {
  contentCms?: boolean;
  productCms?: boolean;
}): SchemaTypeDefinition[];

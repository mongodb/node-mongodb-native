import { Int32 } from 'bson';

import { identity } from '../../utils';
import type { ClientMetadata } from './client_metadata';

export type FAASProvider = 'aws' | 'gcp' | 'azure' | 'vercel' | 'none';

function isNonEmptyString(s: string | undefined): s is string {
  return typeof s === 'string' && s.length > 0;
}

export function determineFAASProvider(): FAASProvider {
  const awsPresent =
    isNonEmptyString(process.env.AWS_EXECUTION_ENV) ||
    isNonEmptyString(process.env.AWS_LAMBDA_RUNTIME_API);
  const azurePresent = isNonEmptyString(process.env.FUNCTIONS_WORKER_RUNTIME);
  const gcpPresent =
    isNonEmptyString(process.env.K_SERVICE) || isNonEmptyString(process.env.FUNCTION_NAME);
  const vercelPresent = isNonEmptyString(process.env.VERCEL);

  const numberOfProvidersPresent = [awsPresent, azurePresent, gcpPresent, vercelPresent].filter(
    identity
  ).length;

  if (numberOfProvidersPresent !== 1) {
    return 'none';
  }

  if (awsPresent) return 'aws';
  if (azurePresent) return 'azure';
  if (gcpPresent) return 'gcp';
  return 'vercel';
}

function applyAzureMetadata(m: ClientMetadata): ClientMetadata {
  m.env = { name: 'azure.func' };
  return m;
}

function applyGCPMetadata(m: ClientMetadata): ClientMetadata {
  m.env = { name: 'gcp.func' };

  const memory_mb = Number(process.env.FUNCTION_MEMORY_MB);
  if (Number.isInteger(memory_mb)) {
    m.env.memory_mb = new Int32(memory_mb);
  }
  const timeout_sec = Number(process.env.FUNCTION_TIMEOUT_SEC);
  if (Number.isInteger(timeout_sec)) {
    m.env.timeout_sec = new Int32(timeout_sec);
  }
  if (isNonEmptyString(process.env.FUNCTION_REGION)) {
    m.env.region = process.env.FUNCTION_REGION;
  }

  return m;
}

function applyAWSMetadata(m: ClientMetadata): ClientMetadata {
  m.env = { name: 'aws.lambda' };
  if (isNonEmptyString(process.env.AWS_REGION)) {
    m.env.region = process.env.AWS_REGION;
  }
  const memory_mb = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
  if (Number.isInteger(memory_mb)) {
    m.env.memory_mb = new Int32(memory_mb);
  }
  return m;
}

function applyVercelMetadata(m: ClientMetadata): ClientMetadata {
  m.env = { name: 'vercel' };
  if (isNonEmptyString(process.env.VERCEL_URL)) {
    m.env.url = process.env.VERCEL_URL;
  }
  if (isNonEmptyString(process.env.VERCEL_REGION)) {
    m.env.region = process.env.VERCEL_REGION;
  }
  return m;
}

export function applyFaasEnvMetadata(metadata: ClientMetadata): ClientMetadata {
  const handlerMap: Record<FAASProvider, (m: ClientMetadata) => ClientMetadata> = {
    aws: applyAWSMetadata,
    gcp: applyGCPMetadata,
    azure: applyAzureMetadata,
    vercel: applyVercelMetadata,
    none: identity
  };
  const faasProvider = determineFAASProvider();

  const faasMetadataProvider = handlerMap[faasProvider];
  return faasMetadataProvider(metadata);
}
import { identity } from '../../utils';
import type { ClientMetadata } from './client_metadata';

export type FAASProvider = 'aws' | 'gcp' | 'azure' | 'vercel' | 'none';

export function determineCloudProvider(): FAASProvider {
  const awsPresent = process.env.AWS_EXECUTION_ENV || process.env.AWS_LAMBDA_RUNTIME_API;
  const azurePresent = process.env.FUNCTIONS_WORKER_RUNTIME;
  const gcpPresent = process.env.K_SERVICE || process.env.FUNCTION_NAME;
  const vercelPresent = process.env.VERCEL;

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

  const memory_mb = Number.parseInt(process.env.FUNCTION_MEMORY_MB ?? '');
  if (!Number.isNaN(memory_mb)) {
    m.env.memory_mb = memory_mb;
  }
  const timeout_sec = Number.parseInt(process.env.FUNCTION_TIMEOUT_SEC ?? '');
  if (!Number.isNaN(timeout_sec)) {
    m.env.timeout_sec = timeout_sec;
  }
  if (process.env.FUNCTION_REGION) {
    m.env.region = process.env.FUNCTION_REGION;
  }

  return m;
}

function applyAWSMetadata(m: ClientMetadata): ClientMetadata {
  m.env = { name: 'aws.lambda' };
  if (process.env.AWS_REGION) {
    m.env.region = process.env.AWS_REGION;
  }
  const memory_mb = Number.parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE ?? '');
  if (!Number.isNaN(memory_mb)) {
    m.env.memory_mb = memory_mb;
  }
  return m;
}

function applyVercelMetadata(m: ClientMetadata): ClientMetadata {
  m.env = { name: 'vercel' };
  if (process.env.VERCEL_URL) {
    m.env.url = process.env.VERCEL_URL;
  }
  if (process.env.VERCEL_REGION) {
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
  const cloudProvider = determineCloudProvider();

  const faasMetadataProvider = handlerMap[cloudProvider];
  return faasMetadataProvider(metadata);
}

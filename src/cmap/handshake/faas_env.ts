import * as process from 'process';

import { Int32 } from '../../bson';

function isNonEmptyString(s: string | undefined): s is string {
  return typeof s === 'string' && s.length > 0;
}

export function getFAASEnv(): Map<string, string | Int32> | null {
  const awsPresent =
    isNonEmptyString(process.env.AWS_EXECUTION_ENV) ||
    isNonEmptyString(process.env.AWS_LAMBDA_RUNTIME_API);
  const azurePresent = isNonEmptyString(process.env.FUNCTIONS_WORKER_RUNTIME);
  const gcpPresent =
    isNonEmptyString(process.env.K_SERVICE) || isNonEmptyString(process.env.FUNCTION_NAME);
  const vercelPresent = isNonEmptyString(process.env.VERCEL);

  const faasEnv = new Map();

  if (awsPresent && !(azurePresent || gcpPresent || vercelPresent)) {
    faasEnv.set('name', 'aws.lambda');

    if (isNonEmptyString(process.env.AWS_REGION)) {
      faasEnv.set('region', process.env.AWS_REGION);
    }

    const memory_mb = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
    if (Number.isInteger(memory_mb)) {
      faasEnv.set('memory_mb', new Int32(memory_mb));
    }

    return faasEnv;
  } else if (azurePresent && !(awsPresent || gcpPresent || vercelPresent)) {
    faasEnv.set('name', 'azure.func');
    return faasEnv;
  } else if (gcpPresent && !(awsPresent || azurePresent || vercelPresent)) {
    faasEnv.set('name', 'gcp.func');

    if (isNonEmptyString(process.env.FUNCTION_REGION)) {
      faasEnv.set('region', process.env.FUNCTION_REGION);
    }

    const memory_mb = Number(process.env.FUNCTION_MEMORY_MB);
    if (Number.isInteger(memory_mb)) {
      faasEnv.set('memory_mb', new Int32(memory_mb));
    }

    const timeout_sec = Number(process.env.FUNCTION_TIMEOUT_SEC);
    if (Number.isInteger(timeout_sec)) {
      faasEnv.set('timeout_sec', new Int32(timeout_sec));
    }

    return faasEnv;
  } else if (vercelPresent && !(awsPresent || azurePresent || gcpPresent)) {
    faasEnv.set('name', 'vercel');

    if (isNonEmptyString(process.env.VERCEL_URL)) {
      faasEnv.set('url', process.env.VERCEL_URL);
    }

    if (isNonEmptyString(process.env.VERCEL_REGION)) {
      faasEnv.set('region', process.env.VERCEL_REGION);
    }

    return faasEnv;
  } else {
    return null;
  }
}

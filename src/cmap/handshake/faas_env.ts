import * as process from 'process';

import { Int32 } from '../../bson';

export function getFAASEnv(): Map<string, string | Int32> | null {
  const {
    AWS_EXECUTION_ENV = '',
    AWS_LAMBDA_RUNTIME_API = '',
    FUNCTIONS_WORKER_RUNTIME = '',
    K_SERVICE = '',
    FUNCTION_NAME = '',
    VERCEL = '',
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '',
    AWS_REGION = '',
    FUNCTION_MEMORY_MB = '',
    FUNCTION_REGION = '',
    FUNCTION_TIMEOUT_SEC = '',
    VERCEL_URL = '',
    VERCEL_REGION = ''
  } = process.env;

  const isAWSFaaS = AWS_EXECUTION_ENV.length > 0 || AWS_LAMBDA_RUNTIME_API.length > 0;
  const isAzureFaaS = FUNCTIONS_WORKER_RUNTIME.length > 0;
  const isGCPFaaS = K_SERVICE.length > 0 || FUNCTION_NAME.length > 0;
  const isVercelFaaS = VERCEL.length > 0;

  const faasEnv = new Map();

  if (isAWSFaaS && !(isAzureFaaS || isGCPFaaS || isVercelFaaS)) {
    faasEnv.set('name', 'aws.lambda');

    if (AWS_REGION.length > 0) {
      faasEnv.set('region', AWS_REGION);
    }

    const memory_mb = Number(AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
    if (Number.isInteger(memory_mb)) {
      faasEnv.set('memory_mb', new Int32(memory_mb));
    }

    return faasEnv;
  } else if (isAzureFaaS && !(isAWSFaaS || isGCPFaaS || isVercelFaaS)) {
    faasEnv.set('name', 'azure.func');
    return faasEnv;
  } else if (isGCPFaaS && !(isAWSFaaS || isAzureFaaS || isVercelFaaS)) {
    faasEnv.set('name', 'gcp.func');

    if (FUNCTION_REGION.length > 0) {
      faasEnv.set('region', FUNCTION_REGION);
    }

    const memory_mb = Number(FUNCTION_MEMORY_MB);
    if (Number.isInteger(memory_mb)) {
      faasEnv.set('memory_mb', new Int32(memory_mb));
    }

    const timeout_sec = Number(FUNCTION_TIMEOUT_SEC);
    if (Number.isInteger(timeout_sec)) {
      faasEnv.set('timeout_sec', new Int32(timeout_sec));
    }

    return faasEnv;
  } else if (isVercelFaaS && !(isAWSFaaS || isAzureFaaS || isGCPFaaS)) {
    faasEnv.set('name', 'vercel');

    if (VERCEL_URL.length > 0) {
      faasEnv.set('url', process.env.VERCEL_URL);
    }

    if (VERCEL_REGION.length > 0) {
      faasEnv.set('region', process.env.VERCEL_REGION);
    }

    return faasEnv;
  } else {
    return null;
  }
}

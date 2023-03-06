import { BSON } from 'bson';

import type { HandshakeDecorator } from './handshake_decorator';
import type { HandshakeDocument } from './handshake_generator';

/**
 * FaaS environment metadata.
 * @internal
 */
export interface FaasMetadata {
  /** All metadata has a name */
  name: string;
  /** Lambda/GCP/Vercel */
  region?: string;
  /** Lambda/GCP */
  memoryMb?: string;
  /** GCP */
  timeoutSec?: string;
  /** Vercel */
  url?: string;
}

/** @internal */
export const FaasProvider = Object.freeze({
  AWS: 'aws',
  AZURE: 'azure',
  GCP: 'gcp',
  VERCEL: 'vercel'
} as const);

/** @internal */
export type FaasProvider = typeof FaasProvider[keyof typeof FaasProvider];

/** @internal */
const MAX_HANDSHAKE_BYTES = 512;

/**
 * Decorates the handshake doc with FaaS environment information.
 */
export class FaasEnvDecorator implements HandshakeDecorator {
  /**
   * Decorate the handshake document.
   */
  decorate(handshake: HandshakeDocument): Promise<HandshakeDocument> {
    // Check in which environment we are.
    switch (determineFaasProvider()) {
      case FaasProvider.AWS:
        modifyHandshake(handshake, {
          name: process.env.AWS_EXECUTION_ENV || FaasProvider.AWS,
          region: process.env.AWS_REGION,
          memoryMb: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE
        });
        break;
      case FaasProvider.AZURE:
        modifyHandshake(handshake, {
          name: process.env.FUNCTIONS_WORKER_RUNTIME || FaasProvider.AZURE
        });
        break;
      case FaasProvider.GCP:
        modifyHandshake(handshake, {
          name: process.env.FUNCTION_NAME || FaasProvider.GCP,
          region: process.env.FUNCTION_REGION,
          memoryMb: process.env.FUNCTION_MEMORY_MB,
          timeoutSec: process.env.FUNCTION_TIMEOUT_SEC
        });
        break;
      case FaasProvider.VERCEL:
        modifyHandshake(handshake, {
          name: process.env.VERCEL || FaasProvider.VERCEL,
          region: process.env.VERCEL_REGION,
          url: process.env.VERCEL_URL
        });
        break;
    }
    return Promise.resolve(handshake);
  }
}

/**
 * Determine the FaaS provider.
 */
function determineFaasProvider(): FaasProvider | undefined {
  if (process.env.VERCEL) {
    return FaasProvider.VERCEL;
  }
  if (process.env.AWS_EXECUTION_ENV) {
    return FaasProvider.AWS;
  }
  if (process.env.FUNCTIONS_WORKER_RUNTIME) {
    return FaasProvider.GCP;
  }
  if (process.env.FUNCTION_NAME) {
    return FaasProvider.AZURE;
  }
  return undefined;
}

/**
 * Modify the handshake document.
 */
function modifyHandshake(handshake: HandshakeDocument, metadata: FaasMetadata): void {
  let raw;
  // Add the env document.
  handshake.env = metadata;
  // Serialize the document.
  raw = BSON.serialize(handshake);
  // Check if the handshake is less than 512 bytes.
  if (raw.length > MAX_HANDSHAKE_BYTES) {
    // If too large, set only the name.
    handshake.env = { name: metadata.name };
    // Serialize the document.
    raw = BSON.serialize(handshake);
    // Check if the handshake is less than 512 bytes.
    if (raw.length > MAX_HANDSHAKE_BYTES) {
      // If so remove the env metadata.
      delete handshake.env;
    }
  }
}

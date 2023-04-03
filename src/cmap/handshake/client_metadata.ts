import { calculateObjectSize } from 'bson';
import * as os from 'os';

import type { MongoOptions } from '../../mongo_client';
import { applyFaasEnvMetadata } from './faas_provider';

/**
 * @public
 * @see https://github.com/mongodb/specifications/blob/master/source/mongodb-handshake/handshake.rst#hello-command
 */
export interface ClientMetadata {
  driver: {
    name: string;
    version: string;
  };
  os: {
    type: string;
    name: NodeJS.Platform;
    architecture: string;
    version: string;
  };
  platform: string;
  application?: {
    name: string;
  };

  /** Data containing information about the environment, if the driver is running in a FAAS environment. */
  env?: {
    name: 'aws.lambda' | 'gcp.func' | 'azure.func' | 'vercel';
    timeout_sec?: number;
    memory_mb?: number;
    region?: string;
    url?: string;
  };
}

/**
 * @internal
 * truncates the client metadata according to the priority outlined here
 * https://github.com/mongodb/specifications/blob/master/source/mongodb-handshake/handshake.rst#limitations
 */
export function truncateClientMetadata(metadata: ClientMetadata): ClientMetadata {
  if (calculateObjectSize(metadata) <= 512) {
    return metadata;
  }
  // 1. Truncate ``platform``.
  // no-op - we don't truncate because the `platform` field is essentially a fixed length in Node
  // and there isn't anything we can truncate that without removing useful information.

  // 2. Omit fields from ``env`` except ``env.name``.
  if (metadata.env) {
    metadata.env = { name: metadata.env.name };
  }
  if (calculateObjectSize(metadata) <= 512) {
    return metadata;
  }

  // 3. Omit the ``env`` document entirely.
  delete metadata.env;

  return metadata;
}

/** @public */
export interface ClientMetadataOptions {
  driverInfo?: {
    name?: string;
    version?: string;
    platform?: string;
  };
  appName?: string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const NODE_DRIVER_VERSION = require('../../../package.json').version;

export function makeClientMetadata(
  options: Pick<MongoOptions, 'appName' | 'driverInfo'>
): ClientMetadata {
  const name = options.driverInfo.name ? `nodejs|${options.driverInfo.name}` : 'nodejs';
  const version = options.driverInfo.version
    ? `${NODE_DRIVER_VERSION}|${options.driverInfo.version}`
    : NODE_DRIVER_VERSION;
  const platform = options.driverInfo.platform
    ? `Node.js ${process.version}, ${os.endianness()}|${options.driverInfo.platform}`
    : `Node.js ${process.version}, ${os.endianness()}`;

  const metadata: ClientMetadata = {
    driver: {
      name,
      version
    },
    os: {
      type: os.type(),
      name: process.platform,
      architecture: process.arch,
      version: os.release()
    },
    platform
  };

  if (options.appName) {
    // MongoDB requires the appName not exceed a byte length of 128
    const name =
      Buffer.byteLength(options.appName, 'utf8') <= 128
        ? options.appName
        : Buffer.from(options.appName, 'utf8').subarray(0, 128).toString('utf8');
    metadata.application = { name };
  }

  return truncateClientMetadata(applyFaasEnvMetadata(metadata));
}

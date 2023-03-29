import * as os from 'os';

import type { MongoOptions } from '../../mongo_client';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const NODE_DRIVER_VERSION = require('../../../package.json').version;

/**
 * FaaS environment metadata.
 * @public
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

/** @public */
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
  version?: string;
  application?: {
    name: string;
  };
  env?: FaasMetadata;
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

export function makeClientMetadata(options: MongoOptions): ClientMetadata {
  const metadata: ClientMetadata = {
    driver: {
      name: 'nodejs',
      version: NODE_DRIVER_VERSION
    },
    os: {
      type: os.type(),
      name: process.platform,
      architecture: process.arch,
      version: os.release()
    },
    platform: `Node.js ${process.version}, ${os.endianness()} (unified)`
  };

  // support optionally provided wrapping driver info
  if (options.driverInfo) {
    if (options.driverInfo.name) {
      metadata.driver.name = `${metadata.driver.name}|${options.driverInfo.name}`;
    }

    if (options.driverInfo.version) {
      metadata.version = `${metadata.driver.version}|${options.driverInfo.version}`;
    }

    if (options.driverInfo.platform) {
      metadata.platform = `${metadata.platform}|${options.driverInfo.platform}`;
    }
  }

  if (options.appName) {
    // MongoDB requires the appName not exceed a byte length of 128
    const buffer = Buffer.from(options.appName);
    metadata.application = {
      name: buffer.byteLength > 128 ? buffer.slice(0, 128).toString('utf8') : options.appName
    };
  }

  return metadata;
}

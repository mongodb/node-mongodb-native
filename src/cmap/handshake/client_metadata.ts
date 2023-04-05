import * as os from 'os';
import * as process from 'process';

import { BSON, Int32 } from '../../bson';
import type { MongoOptions } from '../../mongo_client';
import { getFAASEnv } from './faas_env';

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
    name?: NodeJS.Platform;
    architecture?: string;
    version?: string;
  };
  platform: string;
  application?: {
    name: string;
  };
  /** Data containing information about the environment, if the driver is running in a FAAS environment. */
  env?: {
    name: 'aws.lambda' | 'gcp.func' | 'azure.func' | 'vercel';
    timeout_sec?: Int32;
    memory_mb?: Int32;
    region?: string;
    url?: string;
  };
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

/** @internal */
class LimitedSizeDocument extends Map {
  private static MAX_SIZE = 512;

  private get bsonByteLength() {
    return BSON.serialize(this).byteLength;
  }

  /** Only adds key/value if the bsonByteLength is less than or equal to MAX_SIZE */
  public setIfFits(key: string, value: Record<string, any> | string): boolean {
    if (this.bsonByteLength >= LimitedSizeDocument.MAX_SIZE) {
      return false;
    }

    this.set(key, value);

    if (this.bsonByteLength >= LimitedSizeDocument.MAX_SIZE) {
      this.delete(key);
      return false;
    }

    return true;
  }
}

type MakeClientMetadataOptions = Pick<MongoOptions, 'appName' | 'driverInfo'>;
export function makeClientMetadata(options: MakeClientMetadataOptions): ClientMetadata {
  const metadataDocument = new LimitedSizeDocument();

  // Add app name first, it must be sent
  if (typeof options.appName === 'string' && options.appName.length > 0) {
    const name =
      Buffer.byteLength(options.appName, 'utf8') <= 128
        ? options.appName
        : Buffer.from(options.appName, 'utf8').subarray(0, 128).toString('utf8');
    metadataDocument.setIfFits('application', { name });
  }

  // Driver info goes next, we're not going to be at the limit yet, max bytes used ~128
  const name =
    typeof options.driverInfo.name === 'string' && options.driverInfo.name.length > 0
      ? `nodejs|${options.driverInfo.name}`
      : 'nodejs';

  const version =
    typeof options.driverInfo.version === 'string' && options.driverInfo.version.length > 0
      ? `${NODE_DRIVER_VERSION}|${options.driverInfo.version}`
      : NODE_DRIVER_VERSION;

  metadataDocument.setIfFits('driver', { name, version });

  // Platform likely to make it in, depending on driverInfo.name length
  const platform =
    typeof options.driverInfo.platform === 'string' && options.driverInfo.platform.length > 0
      ? `Node.js ${process.version}, ${os.endianness()}|${options.driverInfo.platform}`
      : `Node.js ${process.version}, ${os.endianness()}`;

  metadataDocument.setIfFits('platform', platform);

  const osInfo = {
    type: os.type(),
    name: process.platform,
    architecture: process.arch,
    version: os.release()
  };

  if (!metadataDocument.setIfFits('os', osInfo)) {
    // Could not add full OS info, add only type
    metadataDocument.setIfFits('os', { type: osInfo.type });
  }

  const faasEnv = getFAASEnv();
  if (faasEnv != null) {
    if (!metadataDocument.setIfFits('env', faasEnv)) {
      metadataDocument.setIfFits('env', { name: faasEnv.get('name') });
    }
  }

  return BSON.deserialize(BSON.serialize(metadataDocument), {
    promoteLongs: false,
    promoteBuffers: false,
    promoteValues: false,
    useBigInt64: false
  }) as ClientMetadata;
}

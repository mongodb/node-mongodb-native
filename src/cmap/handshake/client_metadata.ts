import * as os from 'os';
import * as process from 'process';

import { BSON, Int32 } from '../../bson';
import { MongoInvalidArgumentError } from '../../error';
import type { MongoOptions } from '../../mongo_client';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const NODE_DRIVER_VERSION = require('../../../package.json').version;

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
  /** FaaS environment information */
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

/** @internal */
export class LimitedSizeDocument {
  private document = new Map();
  /** BSON overhead: Int32 + Null byte */
  private documentSize = 5;
  constructor(private maxSize: number) {}

  /** Only adds key/value if the bsonByteLength is less than MAX_SIZE */
  public ifItFitsItSits(key: string, value: Record<string, any> | string): boolean {
    // The BSON byteLength of the new element is the same as serializing it to its own document
    // subtracting the document size int32 and the null terminator.
    const newElementSize = BSON.serialize(new Map().set(key, value)).byteLength - 5;

    if (newElementSize + this.documentSize > this.maxSize) {
      return false;
    }

    this.documentSize += newElementSize;

    this.document.set(key, value);

    return true;
  }

  toObject(): ClientMetadata {
    return BSON.deserialize(BSON.serialize(this.document), {
      promoteLongs: false,
      promoteBuffers: false,
      promoteValues: false,
      useBigInt64: false
    }) as ClientMetadata;
  }
}

type MakeClientMetadataOptions = Pick<MongoOptions, 'appName' | 'driverInfo'>;
/**
 * From the specs:
 * Implementors SHOULD cumulatively update fields in the following order until the document is under the size limit:
 * 1. Omit fields from `env` except `env.name`.
 * 2. Omit fields from `os` except `os.type`.
 * 3. Omit the `env` document entirely.
 * 4. Truncate `platform`. -- special we do not truncate this field
 */
export function makeClientMetadata(options: MakeClientMetadataOptions): ClientMetadata {
  const metadataDocument = new LimitedSizeDocument(512);

  const { appName = '' } = options;
  // Add app name first, it must be sent
  if (appName.length > 0) {
    const name =
      Buffer.byteLength(appName, 'utf8') <= 128
        ? options.appName
        : Buffer.from(appName, 'utf8').subarray(0, 128).toString('utf8');
    metadataDocument.ifItFitsItSits('application', { name });
  }

  const { name = '', version = '', platform = '' } = options.driverInfo;

  const driverInfo = {
    name: name.length > 0 ? `nodejs|${name}` : 'nodejs',
    version: version.length > 0 ? `${NODE_DRIVER_VERSION}|${version}` : NODE_DRIVER_VERSION
  };

  if (!metadataDocument.ifItFitsItSits('driver', driverInfo)) {
    throw new MongoInvalidArgumentError(
      'Unable to include driverInfo name and version, metadata cannot exceed 512 bytes'
    );
  }

  let runtimeInfo = getRuntimeInfo();
  if (platform.length > 0) {
    runtimeInfo = `${runtimeInfo}|${platform}`;
  }

  if (!metadataDocument.ifItFitsItSits('platform', runtimeInfo)) {
    throw new MongoInvalidArgumentError(
      'Unable to include driverInfo platform, metadata cannot exceed 512 bytes'
    );
  }

  // Note: order matters, os.type is last so it will be removed last if we're at maxSize
  const osInfo = new Map()
    .set('name', process.platform)
    .set('architecture', process.arch)
    .set('version', os.release())
    .set('type', os.type());

  if (!metadataDocument.ifItFitsItSits('os', osInfo)) {
    for (const key of osInfo.keys()) {
      osInfo.delete(key);
      if (osInfo.size === 0) break;
      if (metadataDocument.ifItFitsItSits('os', osInfo)) break;
    }
  }

  const faasEnv = getFAASEnv();
  if (faasEnv != null) {
    if (!metadataDocument.ifItFitsItSits('env', faasEnv)) {
      for (const key of faasEnv.keys()) {
        faasEnv.delete(key);
        if (faasEnv.size === 0) break;
        if (metadataDocument.ifItFitsItSits('env', faasEnv)) break;
      }
    }
  }

  return metadataDocument.toObject();
}

/**
 * Collects FaaS metadata.
 * - `name` MUST be the last key in the Map returned.
 */
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
    VERCEL_REGION = ''
  } = process.env;

  const isAWSFaaS =
    AWS_EXECUTION_ENV.startsWith('AWS_Lambda_') || AWS_LAMBDA_RUNTIME_API.length > 0;
  const isAzureFaaS = FUNCTIONS_WORKER_RUNTIME.length > 0;
  const isGCPFaaS = K_SERVICE.length > 0 || FUNCTION_NAME.length > 0;
  const isVercelFaaS = VERCEL.length > 0;

  // Note: order matters, name must always be the last key
  const faasEnv = new Map();

  // When isVercelFaaS is true so is isAWSFaaS; Vercel inherits the AWS env
  if (isVercelFaaS && !(isAzureFaaS || isGCPFaaS)) {
    if (VERCEL_REGION.length > 0) {
      faasEnv.set('region', VERCEL_REGION);
    }

    faasEnv.set('name', 'vercel');
    return faasEnv;
  }

  if (isAWSFaaS && !(isAzureFaaS || isGCPFaaS || isVercelFaaS)) {
    if (AWS_REGION.length > 0) {
      faasEnv.set('region', AWS_REGION);
    }

    if (
      AWS_LAMBDA_FUNCTION_MEMORY_SIZE.length > 0 &&
      Number.isInteger(+AWS_LAMBDA_FUNCTION_MEMORY_SIZE)
    ) {
      faasEnv.set('memory_mb', new Int32(AWS_LAMBDA_FUNCTION_MEMORY_SIZE));
    }

    faasEnv.set('name', 'aws.lambda');
    return faasEnv;
  }

  if (isAzureFaaS && !(isGCPFaaS || isAWSFaaS || isVercelFaaS)) {
    faasEnv.set('name', 'azure.func');
    return faasEnv;
  }

  if (isGCPFaaS && !(isAzureFaaS || isAWSFaaS || isVercelFaaS)) {
    if (FUNCTION_REGION.length > 0) {
      faasEnv.set('region', FUNCTION_REGION);
    }

    if (FUNCTION_MEMORY_MB.length > 0 && Number.isInteger(+FUNCTION_MEMORY_MB)) {
      faasEnv.set('memory_mb', new Int32(FUNCTION_MEMORY_MB));
    }

    if (FUNCTION_TIMEOUT_SEC.length > 0 && Number.isInteger(+FUNCTION_TIMEOUT_SEC)) {
      faasEnv.set('timeout_sec', new Int32(FUNCTION_TIMEOUT_SEC));
    }

    faasEnv.set('name', 'gcp.func');
    return faasEnv;
  }

  return null;
}

/**
 * @internal
 * This type represents the global Deno object and the minimal type contract we expect it to satisfy.
 */
declare const Deno: { version?: { deno?: string } } | undefined;

/**
 * @internal
 * This type represents the global Bun object and the minimal type contract we expect it to satisfy.
 */
declare const Bun: { (): void; version?: string } | undefined;

/**
 * @internal
 * Get current JavaScript runtime platform
 *
 * NOTE: The version information fetching is intentionally written defensively
 * to avoid having a released driver version that becomes incompatible
 * with a future change to these global objects.
 */
function getRuntimeInfo(): string {
  if ('Deno' in globalThis) {
    const version = typeof Deno?.version?.deno === 'string' ? Deno?.version?.deno : '0.0.0-unknown';

    return `Deno v${version}, ${os.endianness()}`;
  }

  if ('Bun' in globalThis) {
    const version = typeof Bun?.version === 'string' ? Bun?.version : '0.0.0-unknown';

    return `Bun v${version}, ${os.endianness()}`;
  }

  return `Node.js ${process.version}, ${os.endianness()}`;
}

import * as process from 'process';

import { BSON, ByteUtils, type Document, Int32, NumberUtils } from '../../bson';
import { MongoInvalidArgumentError } from '../../error';
import type { DriverInfo, MongoOptions } from '../../mongo_client';
import { fileIsAccessible } from '../../utils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const NODE_DRIVER_VERSION = require('../../../package.json').version;

/** @internal */
export function isDriverInfoEqual(info1: DriverInfo, info2: DriverInfo): boolean {
  /** for equality comparison, we consider "" as unset */
  const nonEmptyCmp = (s1: string | undefined, s2: string | undefined): boolean => {
    s1 ||= undefined;
    s2 ||= undefined;

    return s1 === s2;
  };

  return (
    nonEmptyCmp(info1.name, info2.name) &&
    nonEmptyCmp(info1.platform, info2.platform) &&
    nonEmptyCmp(info1.version, info2.version)
  );
}

/**
 * @internal
 * @see https://github.com/mongodb/specifications/blob/master/source/mongodb-handshake/handshake.md#hello-command
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
  env?: {
    agent?: string;
    container?: {
      runtime?: string;
      orchestrator?: string;
    };
    /** FaaS environment information */
    name?: 'aws.lambda' | 'gcp.func' | 'azure.func' | 'vercel';
    timeout_sec?: Int32;
    memory_mb?: Int32;
    region?: string;
  };
}

/** @internal */
export class LimitedSizeDocument {
  private document = new Map();
  /** BSON overhead: Int32 + Null byte */
  private documentSize = 5;
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

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

  toObject(): Document {
    return BSON.deserialize(BSON.serialize(this.document), {
      promoteLongs: false,
      promoteBuffers: false,
      promoteValues: false,
      useBigInt64: false
    });
  }
}

type MakeClientMetadataOptions = Pick<MongoOptions, 'appName' | 'runtime'>;

/**
 * From the specs:
 * Implementors SHOULD cumulatively update fields in the following order until the document is under the size limit:
 * 1. Omit fields from `env` except `env.name` & `env.agent`.
 * 2. Omit fields from `os` except `os.type`.
 * 3. Omit the `env` document entirely.
 * 4. Truncate `platform`. -- special we do not truncate this field
 */
export async function makeClientMetadata(
  driverInfoList: DriverInfo[],
  { appName = '', runtime }: MakeClientMetadataOptions
): Promise<ClientMetadata> {
  const { os } = await runtime;
  const metadataDocument = new LimitedSizeDocument(512);

  // Add app name first, it must be sent
  if (appName.length > 0) {
    const name =
      ByteUtils.utf8ByteLength(appName) <= 128
        ? appName
        : ByteUtils.toUTF8(ByteUtils.fromUTF8(appName), 0, 128, false);
    metadataDocument.ifItFitsItSits('application', { name });
  }

  const driverInfo = {
    name: 'nodejs',
    version: NODE_DRIVER_VERSION
  };

  // This is where we handle additional driver info added after client construction.
  for (const { name: n = '', version: v = '' } of driverInfoList) {
    if (n.length > 0) {
      driverInfo.name = `${driverInfo.name}|${n}`;
    }
    if (v.length > 0) {
      driverInfo.version = `${driverInfo.version}|${v}`;
    }
  }

  if (!metadataDocument.ifItFitsItSits('driver', driverInfo)) {
    throw new MongoInvalidArgumentError(
      'Unable to include driverInfo name and version, metadata cannot exceed 512 bytes'
    );
  }

  let runtimeInfo = getRuntimeInfo();
  // This is where we handle additional driver info added after client construction.
  for (const { platform = '' } of driverInfoList) {
    if (platform.length > 0) {
      runtimeInfo = `${runtimeInfo}|${platform}`;
    }
  }

  if (!metadataDocument.ifItFitsItSits('platform', runtimeInfo)) {
    throw new MongoInvalidArgumentError(
      'Unable to include driverInfo platform, metadata cannot exceed 512 bytes'
    );
  }

  // Note: order matters, os.type is last so it will be removed last if we're at maxSize
  const osInfo = new Map()
    .set('name', os.platform())
    .set('architecture', os.arch())
    .set('version', os.release())
    .set('type', os.type());

  if (!metadataDocument.ifItFitsItSits('os', osInfo)) {
    for (const key of osInfo.keys()) {
      osInfo.delete(key);
      if (osInfo.size === 0) break;
      if (metadataDocument.ifItFitsItSits('os', osInfo)) break;
    }
  }

  // Env has an order of precedence for data truncation, and order matters.
  // We append in the order of delete preference. 'name' is appended at the end of
  // faasEnv, and is preference-agnostic with 'agent'. So we'll prefer keeping
  // 'agent' over 'name', and 'name' over all FAAS props, and all FAAS props
  // over 'container' (since FAAS props and 'container' are preference-agnostic as well)
  const containerMetadata = await getContainerMetadata();
  const faasEnv = getFAASEnv();
  const agentEnv = getAgentEnv();

  const fullEnv = new Map<string, unknown>();
  for (const [k, v] of faasEnv) fullEnv.set(k, v);
  if (agentEnv.length > 0) fullEnv.set('agent', agentEnv);
  if (containerMetadata.size > 0) fullEnv.set('container', containerMetadata);

  if (fullEnv.size > 0 && !metadataDocument.ifItFitsItSits('env', fullEnv)) {
    for (const key of fullEnv.keys()) {
      fullEnv.delete(key);
      if (fullEnv.size === 0) break;
      if (metadataDocument.ifItFitsItSits('env', fullEnv)) break;
    }
  }

  return metadataDocument.toObject() as ClientMetadata;
}

let dockerPromise: Promise<boolean>;
/** @internal */
async function getContainerMetadata(): Promise<Map<string, string>> {
  dockerPromise ??= fileIsAccessible('/.dockerenv');
  const isDocker = await dockerPromise;

  const { KUBERNETES_SERVICE_HOST = '' } = process.env;
  const isKubernetes = KUBERNETES_SERVICE_HOST.length > 0 ? true : false;

  const containerMetadata = new Map<string, string>();

  if (isDocker) containerMetadata.set('runtime', 'docker');
  if (isKubernetes) containerMetadata.set('orchestrator', 'kubernetes');

  return containerMetadata;
}

/**
 * @internal
 * Environment variables that indicate the driver is being used by an AI agent, in the order the
 * spec requires them to be evaluated. [0] is the environment variable, [1] is the value to set
 * when that environment variable is encountered. If [1] is null, use the environment variable value.
 *
 * From the spec:
 * client.env.agent is a single string. Its value is determined by the environment variables below.
 * Drivers MUST evaluate the list in order. The first populated variable determines the value, and
 * subsequent entries MUST NOT be considered.
 */
export const AGENT_ENV_VARIABLES: ReadonlyArray<readonly [string, string | null]> = [
  ['AI_AGENT', null],
  ['AGENT', null],
  ['CLAUDECODE', 'claude-code'],
  ['CURSOR_AGENT', 'cursor'],
  ['GEMINI_CLI', 'gemini-cli'],
  ['CODEX_SANDBOX', 'codex'],
  ['AUGMENT_AGENT', 'augment'],
  ['OPENCODE_CLIENT', 'opencode']
];

/**
 * @internal
 * Resolves `env.agent` from the environment, or an empty string when no agent variable is
 * populated. Returns the value of the first populated variable in `AGENT_ENV_VARIABLES`.
 */
export function getAgentEnv(): string {
  for (const [key, literal] of AGENT_ENV_VARIABLES) {
    // A variable is only populated if it is present with a non-empty value, so an empty or
    // whitespace-only value never selects an entry, even one with a fixed table value.
    // A populated value is reported verbatim; only the populated check ignores whitespace.
    const envValue = process.env[key] ?? '';
    if (envValue.trim().length > 0) {
      return literal ?? envValue;
    }
  }

  return '';
}

export const FAAS_ENV_VARIABLES = [
  'AWS_EXECUTION_ENV',
  'AWS_LAMBDA_RUNTIME_API',
  'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
  'AWS_REGION',
  'FUNCTIONS_WORKER_RUNTIME',
  'K_SERVICE',
  'FUNCTION_NAME',
  'FUNCTION_MEMORY_MB',
  'FUNCTION_REGION',
  'FUNCTION_TIMEOUT_SEC',
  'VERCEL',
  'VERCEL_REGION',
  'KUBERNETES_SERVICE_HOST'
] as const;

/**
 * Collects FaaS metadata.
 * - `name` MUST be the last key in the Map returned.
 */
export function getFAASEnv(): Map<string, string | Int32> {
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

  return faasEnv;
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
  const endianness = NumberUtils.isBigEndian ? 'BE' : 'LE';
  if ('Deno' in globalThis) {
    const version = typeof Deno?.version?.deno === 'string' ? Deno?.version?.deno : '0.0.0-unknown';

    return `Deno v${version}, ${endianness}`;
  }

  if ('Bun' in globalThis) {
    const version = typeof Bun?.version === 'string' ? Bun?.version : '0.0.0-unknown';

    return `Bun v${version}, ${endianness}`;
  }

  return `Node.js ${process.version}, ${endianness}`;
}

import * as process from 'process';

import { BSON, type Document, Int32, NumberUtils } from '../../bson';
import { MongoInvalidArgumentError } from '../../error';
import type { DriverInfo, MongoOptions } from '../../mongo_client';
import { DriverStringUtils, fileIsAccessible } from '../../utils';

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

    let baseDocumentSize = this.documentSize;
    // If the incoming key is a replace op, don't double-count the size
    if (this.document.has(key)) {
      // new document size = current size - existing value, prepping for replacement
      baseDocumentSize -= BSON.serialize(new Map().set(key, this.document.get(key))).byteLength - 5;
    }

    if (newElementSize + baseDocumentSize > this.maxSize) {
      return false;
    }

    this.documentSize = baseDocumentSize + newElementSize;

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

// Maximum size of application.name in bytes
const APP_NAME_TRUNCATION_LIMIT_BYTES = 128;

type MakeClientMetadataOptions = Pick<MongoOptions, 'appName' | 'runtime'>;

/**
 * From the specs:
 * Implementors SHOULD cumulatively update fields in the following order until the document is under the size limit:
 * 1. Omit fields from `env` except `env.name` and `env.agent`.
 * 2. Omit `env.agent`. If `env` then has no remaining fields, omit `env` entirely.
 * 3. Omit fields from `os` except `os.type`.
 * 4. Omit the `env` document entirely.
 * 5. Truncate `platform`. -- special we do not truncate this field
 *
 * `env.agent` is omitted before `env.name` because drivers have reported `env.name` since before
 * `env.agent` existed.
 */
export async function makeClientMetadata(
  driverInfoList: DriverInfo[],
  { appName = '', runtime }: MakeClientMetadataOptions
): Promise<ClientMetadata> {
  const { os } = await runtime;
  const metadataDocument = new LimitedSizeDocument(512);

  // The document keeps a reference to whatever it accepts, so a Map group is copied. An empty group is skipped.
  const fit = (key: string, value: Record<string, any> | string): boolean => {
    if (!(value instanceof Map)) return metadataDocument.ifItFitsItSits(key, value);
    return value.size === 0 || metadataDocument.ifItFitsItSits(key, new Map(value));
  };

  const osInfo = new Map<string, unknown>().set('type', os.type());
  const envInfo = new Map<string, unknown>();

  // Add app name first, it must be sent
  if (appName.length > 0) {
    const name = DriverStringUtils.truncateStringBytes(appName, APP_NAME_TRUNCATION_LIMIT_BYTES);
    fit('application', { name });
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

  if (!fit('driver', driverInfo)) {
    throw new MongoInvalidArgumentError(
      'Unable to include driverInfo name and version, metadata cannot exceed 512 bytes'
    );
  }

  // os.type is never omitted, so it is added before platform (the spec truncates platform last)
  fit('os', osInfo);

  let runtimeInfo = getRuntimeInfo();
  // This is where we handle additional driver info added after client construction.
  for (const { platform = '' } of driverInfoList) {
    if (platform.length > 0) {
      runtimeInfo = `${runtimeInfo}|${platform}`;
    }
  }

  if (!fit('platform', runtimeInfo)) {
    throw new MongoInvalidArgumentError(
      'Unable to include driverInfo platform, metadata cannot exceed 512 bytes'
    );
  }

  // Add the remaining os and env fields in the reverse of the spec's omission order, so the fields
  // the spec omits first are added last. Stop at the first group that does not fit to keep the
  // truncation cumulative, and only gather a group's values once the earlier groups have fit.
  // Append order (os.type is added before platform): os.type, platform, env.name, ...os, env.agent, ...env
  const faasEnv = getFAASEnv();
  if (faasEnv.has('name')) envInfo.set('name', faasEnv.get('name'));
  let fits = fit('env', envInfo);

  if (fits) {
    osInfo
      .set('name', os.platform())
      .set('architecture', os.arch())
      .set('version', os.release());
    fits = fit('os', osInfo);
  }

  if (fits) {
    const agentEnv = getAgentEnv();
    if (agentEnv.length > 0) envInfo.set('agent', agentEnv);
    fits = fit('env', envInfo);
  }

  if (fits) {
    for (const [k, v] of faasEnv) {
      if (k !== 'name') envInfo.set(k, v);
    }
    const containerMetadata = await getContainerMetadata();
    if (containerMetadata.size > 0) envInfo.set('container', containerMetadata);
    fit('env', envInfo);
  }

  return metadataDocument.toObject() as ClientMetadata;
}

let dockerPromise: Promise<boolean> | undefined;

/** @internal */
export function resetDockerPromise(value?: Promise<boolean>) {
  dockerPromise = value;
}

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
  ['CLAUDECODE', 'claude_code'],
  ['CLAUDE_CODE_ENTRYPOINT', 'claude_code'],
  ['CURSOR_AGENT', 'cursor'],
  ['CODEX_SANDBOX', 'codex_cli'],
  ['CLINE_ACTIVE', 'cline'],
  ['GEMINI_CLI', 'gemini_cli'],
  ['AUGMENT_AGENT', 'auggie_cli'],
  ['OPENCODE', 'opencode_client'],
  ['OPENCODE_CLIENT', 'opencode_client'],
  ['TRAE_AI_SHELL_ID', 'trae_ai'],
  ['GOOSE_TERMINAL', 'goose'],
  ['GOOSE_AGENT', 'goose'],
  ['AI_AGENT', null]
];

// Maximum size of env.agent in bytes, applied after trim and lowercase
const AGENT_ENV_LIMIT_BYTES = 64;

/**
 * @internal
 * Values used in AI_AGENT to indicate an agent is being used but are non-identifying
 */
export const AGENT_ENV_UNIDENTIFYING = new Set(['1', 'true']);

/**
 * @internal
 * Resolves `env.agent` from the environment, or an empty string when no agent variable is
 * populated. Returns the value of the first populated variable in `AGENT_ENV_VARIABLES`.
 */
export function getAgentEnv(): string {
  for (const [key, literal] of AGENT_ENV_VARIABLES) {
    // A variable is only populated if it is present with a non-empty normalized value, so an empty or
    // whitespace-only value never selects an entry, even one with a fixed table value.
    let envValue = (process.env[key] ?? '').trim().toLowerCase();

    if (envValue.length > 0) {
      envValue = DriverStringUtils.truncateStringBytes(envValue, AGENT_ENV_LIMIT_BYTES);
      if (!literal) {
        return AGENT_ENV_UNIDENTIFYING.has(envValue) ? 'ai_agent' : envValue;
      }
      return literal;
    }
  }

  return '';
}

/**
 * @internal
 * Environment variables relevant to FaaS runtimes, governed by the spec:
 * https://github.com/mongodb/specifications/blob/9cfe388c7d2ce1e02b24b53606e97ce7b73ebb7d/source/mongodb-handshake/handshake.md#faas
 */
export const FAAS_ENV_VARIABLES = [
  'AWS_EXECUTION_ENV',
  'AWS_LAMBDA_RUNTIME_API',
  'FUNCTIONS_WORKER_RUNTIME',
  'K_SERVICE',
  'FUNCTION_NAME',
  'VERCEL',
  'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
  'AWS_REGION',
  'FUNCTION_MEMORY_MB',
  'FUNCTION_REGION',
  'FUNCTION_TIMEOUT_SEC',
  'VERCEL_REGION'
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

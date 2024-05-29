import { EJSON } from 'bson';
import { expect } from 'chai';
import ConnectionString from 'mongodb-connection-string-url';
import { gte as semverGte, lte as semverLte } from 'semver';
import { isDeepStrictEqual } from 'util';

/* eslint-disable @typescript-eslint/no-restricted-imports */
import { ClientEncryption } from '../../../src/client-side-encryption/client_encryption';
import {
  type AutoEncryptionOptions,
  type CollectionOptions,
  type DbOptions,
  type Document,
  getMongoDBClientEncryption,
  type MongoClient
} from '../../mongodb';
import { shouldRunServerlessTest } from '../../tools/utils';
import type { CmapEvent, CommandEvent, EntitiesMap, SdamEvent } from './entities';
import { matchesEvents } from './match';
import type {
  ClientEncryptionEntity,
  CollectionOrDatabaseOptions,
  ExpectedEventsForClient,
  KMSProvidersEntity,
  RunOnRequirement,
  StringOrPlaceholder
} from './schema';

const ENABLE_UNIFIED_TEST_LOGGING = false;
export function log(message: unknown, ...optionalParameters: unknown[]): void {
  if (ENABLE_UNIFIED_TEST_LOGGING) console.warn(message, ...optionalParameters);
}

export async function topologySatisfies(
  ctx: Mocha.Context,
  r: RunOnRequirement,
  utilClient: MongoClient
): Promise<boolean> {
  const config = ctx.configuration;
  let ok = true;

  let skipReason;

  if (r.topologies) {
    const topologyType = {
      Single: 'single',
      ReplicaSetNoPrimary: 'replicaset',
      ReplicaSetWithPrimary: 'replicaset',
      Sharded: 'sharded',
      LoadBalanced: 'load-balanced'
    }[config.topologyType];

    if (!Array.isArray(r.topologies)) {
      throw new Error('Topology specification must be an array');
    }

    if (r.topologies.includes('sharded-replicaset') && topologyType === 'sharded') {
      const shards = await utilClient.db('config').collection('shards').find({}).toArray();
      ok &&= shards.length > 0 && shards.every(shard => shard.host.split(',').length > 1);
      if (!ok && skipReason == null) {
        skipReason = `requires sharded-replicaset but shards.length=${shards.length}`;
      }
    } else {
      if (!topologyType) throw new Error(`Topology undiscovered: ${config.topologyType}`);
      ok &&= r.topologies.includes(topologyType);
      if (!ok && skipReason == null) {
        skipReason = `requires ${r.topologies} but discovered a ${topologyType} topology`;
      }
    }
  }

  if (r.minServerVersion) {
    const minVersion = patchVersion(r.minServerVersion);
    ok &&= semverGte(config.version, minVersion);
    if (!ok && skipReason == null) {
      skipReason = `requires mongodb version greater than ${minVersion}`;
    }
  }
  if (r.maxServerVersion) {
    const maxVersion = patchVersion(r.maxServerVersion);
    ok &&= semverLte(config.version, maxVersion);
    if (!ok && skipReason == null) skipReason = `requires mongodb version less than ${maxVersion}`;
  }

  if (r.serverParameters) {
    if (!config.parameters) throw new Error('Configuration does not have server parameters');
    for (const [name, value] of Object.entries(r.serverParameters)) {
      if (name in config.parameters) {
        ok &&= isDeepStrictEqual(config.parameters[name], value);
        if (!ok && skipReason == null) {
          skipReason = `requires serverParameter ${name} to be ${value} but found ${config.parameters[name]}`;
        }
      }
    }
  }

  if (typeof r.auth === 'boolean') {
    if (r.auth === true) {
      ok &&= process.env.AUTH === 'auth';
      if (!ok && skipReason == null) {
        skipReason = `requires auth but auth is not enabled`;
      }
      if (
        r.authMechanism &&
        !config.parameters.authenticationMechanisms.includes(r.authMechanism)
      ) {
        ok &&= false;
        skipReason = `requires ${r.authMechanism} to be supported by the server`;
      }
    } else if (r.auth === false) {
      ok &&= process.env.AUTH === 'noauth' || process.env.AUTH == null;
      if (!ok && skipReason == null) skipReason = `requires no auth but auth is enabled`;
    }
  }

  if (r.serverless) {
    ok &&= shouldRunServerlessTest(r.serverless, config.isServerless);
    if (!ok && skipReason == null) skipReason = `has serverless set to ${r.serverless}`;
  }

  if (typeof r.csfle === 'boolean') {
    const versionSupportsCSFLE = semverGte(config.version, '4.2.0');
    const csfleEnabled = config.clientSideEncryption.enabled;

    if (r.csfle) {
      ok &&= versionSupportsCSFLE && csfleEnabled;
      if (!ok && skipReason == null) {
        skipReason = versionSupportsCSFLE
          ? `requires csfle to run but CSFLE is not set for this environment`
          : 'requires mongodb >= 4.2 to run csfle tests';
      }
    } else {
      ok &&= !(csfleEnabled && versionSupportsCSFLE);
      if (!ok && skipReason == null) {
        skipReason = versionSupportsCSFLE
          ? `forbids csfle to run but CSFLE is set for this environment`
          : 'forbids mongodb >= 4.2 to run csfle tests';
      }
    }
  }

  if (!ok && skipReason != null) {
    if (ctx.currentTest) {
      // called from beforeEach hook
      ctx.currentTest.skipReason = skipReason;
    } else if (ctx.test) {
      // called from within a test
      ctx.test.skipReason = skipReason;
    }
  }

  return ok;
}

export async function isAnyRequirementSatisfied(ctx, requirements, client) {
  const skipTarget = ctx.currentTest || ctx.test;
  const skipReasons = [];
  for (const requirement of requirements) {
    const met = await topologySatisfies(ctx, requirement, client);
    if (met) {
      return true;
    }
    skipReasons.push(skipTarget.skipReason);
  }
  skipTarget.skipReason = skipReasons.join(' OR ');
  return false;
}

/** Turns two lists into a joined list of tuples. Uses longer array length */
export function* zip<T = unknown, U = unknown>(
  iter1: T[],
  iter2: U[]
): Generator<[T | undefined, U | undefined], void> {
  const longerArrayLength = Math.max(iter1.length, iter2.length);
  for (let index = 0; index < longerArrayLength; index++) {
    yield [iter1[index], iter2[index]];
  }
}

/** Correct schema version to be semver compliant */
export function patchVersion(version: string): string {
  expect(version).to.be.a('string');
  const [major, minor, patch] = version.split('.');
  return `${major}.${minor ?? 0}.${patch ?? 0}`;
}

export function patchDbOptions(options: CollectionOrDatabaseOptions = {}): DbOptions {
  // TODO
  return { ...options } as DbOptions;
}

export function patchCollectionOptions(
  options: CollectionOrDatabaseOptions = {}
): CollectionOptions {
  // TODO
  return { ...options } as CollectionOptions;
}

export function translateOptions(options: Document): Document {
  const translatedOptions = { ...options };
  if (options.returnDocument) {
    translatedOptions.returnDocument = options.returnDocument.toLowerCase();
  }
  return translatedOptions as Document;
}

export function makeConnectionString(
  uri: string,
  uriOptions: Record<string, unknown> = {}
): string {
  const connectionString = new ConnectionString(uri);
  for (const [name, value] of Object.entries(uriOptions ?? {})) {
    if (name === 'authMechanismProperties' && '$$placeholder' in (value as any)) {
      // This is a no-op - we want to ignore setting this as the URI in the
      // environment already has the auth mech property set.
    } else {
      connectionString.searchParams.set(name, String(value));
    }
  }
  return connectionString.toString();
}

export function getMatchingEventCount(event, client, entities): number {
  return client.getCapturedEvents('all').filter(capturedEvent => {
    try {
      matchesEvents(
        { events: [event] } as ExpectedEventsForClient,
        [capturedEvent] as CommandEvent[] | CmapEvent[] | SdamEvent[],
        entities
      );
      return true;
    } catch {
      return false;
    }
  }).length;
}

/**
 * parses the process.env for three required environment variables
 *
 * - CSFLE_KMS_PROVIDERS
 * - KMIP_TLS_CA_FILE
 * - KMIP_TLS_CERT_FILE
 *
 * @throws if any required environment variable is undefined, or if we are unable to
 *   parse the CLSFE_KMS_PROVIDERS from the environment
 */
export function getCSFLETestDataFromEnvironment(environment: Record<string, string | undefined>): {
  kmsProviders: Document;
  tlsOptions: AutoEncryptionOptions['tlsOptions'];
} {
  if (environment.CSFLE_KMS_PROVIDERS == null) {
    throw new Error(
      'CSFLE_KMS_PROVIDERS is required to run the csfle tests.  Please make sure it is set in the environment.'
    );
  }
  let parsedKMSProviders;
  try {
    parsedKMSProviders = EJSON.parse(environment.CSFLE_KMS_PROVIDERS ?? '', {
      relaxed: false
    });
  } catch {
    throw new Error('Malformed CSFLE_KMS_PROVIDERS provided to unified tests.');
  }

  if (environment.KMIP_TLS_CA_FILE == null) {
    throw new Error(
      'KMIP_TLS_CA_FILE is required to run the csfle tests.  Please make sure it is set in the environment.'
    );
  }

  if (environment.KMIP_TLS_CERT_FILE == null) {
    throw new Error(
      'KMIP_TLS_CERT_FILE is required to run the csfle tests.  Please make sure it is set in the environment.'
    );
  }

  return {
    kmsProviders: parsedKMSProviders,
    tlsOptions: {
      kmip: {
        tlsCAFile: environment.KMIP_TLS_CA_FILE,
        tlsCertificateKeyFile: environment.KMIP_TLS_CERT_FILE
      }
    }
  };
}

/**
 * merges kms provider data from the environment variable with kms provider data from the test.
 * this function satisfies the following requirements from the spec:
 *
 * Drivers MUST NOT configure a KMS provider if it is not given.
 * This is to permit testing conditions where a required KMS provider is not configured.
 *
 * If a KMS provider is given as an empty document (e.g.`kmsProviders: { aws: {} }`),
 * drivers MUST configure the KMS provider without credentials to permit testing conditions
 * where KMS credentials are needed.
 *
 * If a KMS credentials field has a placeholder value
 * drivers MUST replace the field with credentials that satisfy the operations required by the
 * unified test files. Drivers MAY load the credentials from the environment or a configuration
 * file as needed to satisfy the requirements of the given KMS provider and tests.
 *
 * If a KMS credentials field is not given drivers MUST NOT include
 * the field during KMS configuration. This is to permit testing conditions where required KMS
 * credentials fields are not provided.
 *
 * Otherwise, drivers MUST configure the KMS provider with the explicit value of KMS credentials
 * field given in the test file. This is to permit testing conditions where invalid
 * KMS credentials are provided.
 */
export function mergeKMSProviders(
  kmsProvidersFromTest: KMSProvidersEntity,
  kmsProvidersFromEnvironment: Document
): NonNullable<AutoEncryptionOptions['kmsProviders']> {
  const isPlaceholderValue = (value: StringOrPlaceholder) =>
    typeof value !== 'string' && typeof value.$$placeholder !== 'undefined';

  const options = {};

  const validKMSProviders: Array<keyof KMSProvidersEntity> = [
    'kmip',
    'local',
    'aws',
    'azure',
    'gcp'
  ];

  for (const provider of validKMSProviders) {
    if (!(provider in kmsProvidersFromTest)) continue;

    const providerDataFromTest = kmsProvidersFromTest[provider];
    const providerDataFromEnvironment = kmsProvidersFromEnvironment[provider];

    const providerOptions = {};

    for (const [key, value] of Object.entries(providerDataFromTest ?? {})) {
      if (isPlaceholderValue(value)) {
        providerOptions[key] = providerDataFromEnvironment[key];
      } else {
        providerOptions[key] = value;
      }
    }

    options[provider] = providerOptions;
  }

  return options;
}

export function createClientEncryption(
  map: EntitiesMap,
  entity: ClientEncryptionEntity
): ClientEncryption {
  getMongoDBClientEncryption();

  const { clientEncryptionOpts } = entity;
  const {
    keyVaultClient,
    keyVaultNamespace,
    kmsProviders: kmsProvidersFromTest
  } = clientEncryptionOpts;

  const clientEntity = map.getEntity('client', keyVaultClient, false);
  if (!clientEntity) {
    throw new Error(
      'unable to get client entity required by client encryption entity in unified test'
    );
  }

  const { kmsProviders: kmsProvidersFromEnvironment, tlsOptions } = getCSFLETestDataFromEnvironment(
    process.env
  );

  const kmsProviders = mergeKMSProviders(kmsProvidersFromTest, kmsProvidersFromEnvironment);

  const autoEncryptionOptions: AutoEncryptionOptions = {
    keyVaultClient: clientEntity,
    kmsProviders,
    keyVaultNamespace,
    tlsOptions
  };

  if (process.env.CRYPT_SHARED_LIB_PATH) {
    autoEncryptionOptions.extraOptions = {
      cryptSharedLibPath: process.env.CRYPT_SHARED_LIB_PATH
    };
  }

  const clientEncryption = new ClientEncryption(clientEntity, autoEncryptionOptions);
  return clientEncryption;
}

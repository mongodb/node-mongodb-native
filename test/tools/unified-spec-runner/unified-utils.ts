import { AssertionError, expect } from 'chai';
import ConnectionString from 'mongodb-connection-string-url';
import { gte as semverGte, lte as semverLte } from 'semver';
import { isDeepStrictEqual } from 'util';

/* eslint-disable @typescript-eslint/no-restricted-imports */
import { ClientEncryption } from '../../../src/client-side-encryption/client_encryption';
import { getCSFLEKMSProviders } from '../../csfle-kms-providers';
import {
  type AutoEncryptionOptions,
  type CollectionOptions,
  type DbOptions,
  type Document,
  getMongoDBClientEncryption,
  type MongoClient,
  ReturnDocument
} from '../../mongodb';
import { shouldRunServerlessTest } from '../../tools/utils';
import type { CmapEvent, CommandEvent, EntitiesMap, SdamEvent } from './entities';
import { matchesEvents } from './match';
import { MalformedOperationError } from './operations';
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
      throw new AssertionError('Topology specification must be an array');
    }

    if (r.topologies.includes('sharded-replicaset') && topologyType === 'sharded') {
      const shards = await utilClient.db('config').collection('shards').find({}).toArray();
      ok &&= shards.length > 0 && shards.every(shard => shard.host.split(',').length > 1);
      if (!ok && skipReason == null) {
        skipReason = `requires sharded-replicaset but shards.length=${shards.length}`;
      }
    } else {
      if (!topologyType) throw new AssertionError(`Topology undiscovered: ${config.topologyType}`);
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
    if (!config.parameters)
      throw new AssertionError('Configuration does not have server parameters');
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
    const returnDocument = options.returnDocument.toLowerCase();
    if (![ReturnDocument.BEFORE, ReturnDocument.AFTER].includes(returnDocument)) {
      throw new MalformedOperationError(
        'Return document must be specified as either "before" or "after"'
      );
    }
    translatedOptions.returnDocument = returnDocument;
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
 * - CSFLE_TLS_CA_FILE
 * - CSFLE_TLS_CLIENT_CERT_FILE
 *
 * @throws if any required environment variable is undefined, or if we are unable to
 *   parse the CLSFE_KMS_PROVIDERS from the environment
 */
export function getCSFLETestDataFromEnvironment(environment: Record<string, string | undefined>): {
  kmsProviders: Document;
  tlsOptions: AutoEncryptionOptions['tlsOptions'];
} {
  const kmsProviders = getCSFLEKMSProviders();

  if (environment.CSFLE_TLS_CA_FILE == null) {
    throw new AssertionError(
      'CSFLE_TLS_CA_FILE is required to run the csfle tests.  Please make sure it is set in the environment.'
    );
  }

  if (environment.CSFLE_TLS_CLIENT_CERT_FILE == null) {
    throw new AssertionError(
      'CSFLE_TLS_CLIENT_CERT_FILE is required to run the csfle tests.  Please make sure it is set in the environment.'
    );
  }

  return {
    kmsProviders: kmsProviders,
    tlsOptions: {
      kmip: {
        tlsCAFile: environment.CSFLE_TLS_CA_FILE,
        tlsCertificateKeyFile: environment.CSFLE_TLS_CLIENT_CERT_FILE
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
 *
 * Tests may also reference named KMS providers. KMS providers with the name
 * `name1` are expected to be configured exactly as the unnamed KMS
 * providers. The `aws:name2` KMS provider and `aws:name1` KMS providers
 * deliberately use separate AWS accounts that do not have permission to the
 * other's keys.
 */
export function mergeKMSProviders(
  kmsProvidersFromTest: KMSProvidersEntity,
  kmsProvidersFromEnvironment: Document
): NonNullable<AutoEncryptionOptions['kmsProviders']> {
  const isPlaceholderValue = (value: StringOrPlaceholder) =>
    value && typeof value !== 'string' && typeof value.$$placeholder !== 'undefined';

  const providers: Document = {};

  function parseAWS(env, test) {
    const awsProviders = {};
    test['accessKeyId'] &&
      (awsProviders['accessKeyId'] = isPlaceholderValue(test['accessKeyId'])
        ? env['accessKeyId']
        : test['accessKeyId']);

    test['secretAccessKey'] &&
      (awsProviders['secretAccessKey'] = isPlaceholderValue(test['secretAccessKey'])
        ? env['secretAccessKey']
        : test['secretAccessKey']);

    test['sessionToken'] &&
      (awsProviders['sessionToken'] = isPlaceholderValue(test['sessionToken'])
        ? env['sessionToken']
        : test['sessionToken']);

    if (!awsProviders['accessKeyId'] || !awsProviders['secretAccessKey']) {
      throw new AssertionError(
        'AWS KMS providers must constain "accessKeyId" and "secretAccessKey"'
      );
    }

    return awsProviders;
  }
  function parseAzure(env, test) {
    const azureProviders: Document = {};
    test['tenantId'] &&
      (azureProviders['tenantId'] = isPlaceholderValue(test['tenantId'])
        ? env['tenantId']
        : test['tenantId']);

    test['clientId'] &&
      (azureProviders['clientId'] = isPlaceholderValue(test['clientId'])
        ? env['clientId']
        : test['clientId']);

    test['clientSecret'] &&
      (azureProviders['clientSecret'] = isPlaceholderValue(test['clientSecret'])
        ? env['clientSecret']
        : test['clientSecret']);

    test['identityPlatformEndpoint'] &&
      (azureProviders['identityPlatformEndpoint'] = isPlaceholderValue(
        test['identityPlatformEndpoint']
      )
        ? env['identityPlatformEndpoint']
        : test['identityPlatformEndpoint']);

    if (
      !azureProviders['tenantId'] ||
      !azureProviders['clientId'] ||
      !azureProviders['clientSecret']
    ) {
      throw new AssertionError(
        'Azure KMS providers must contain "tenantId", "clientId", and "clientSecret"'
      );
    }

    return azureProviders;
  }

  function parseGCP(env, test) {
    const gcpProviders = {};
    test['email'] &&
      (gcpProviders['email'] = isPlaceholderValue(test['email']) ? env['email'] : test['email']);

    test['privateKey'] &&
      (gcpProviders['privateKey'] = isPlaceholderValue(test['privateKey'])
        ? env['privateKey']
        : test['privateKey']);

    test['endPoint'] &&
      (gcpProviders['endPoint'] = isPlaceholderValue(test['endPoint'])
        ? env['endPoint']
        : test['endPoint']);

    if (!gcpProviders['email'] || !gcpProviders['privateKey']) {
      throw new AssertionError('GCP KMS providers must contain "email" and "privateKey"');
    }

    return gcpProviders;
  }
  function parseLocal(env, test) {
    const localProviders = {};
    test['key'] &&
      (localProviders['key'] = isPlaceholderValue(test['key']) ? env['key'] : test['key']);
    return localProviders;
  }
  function parseKMIP(env, test) {
    const localProviders = {};
    test['endpoint'] &&
      (localProviders['endpoint'] = isPlaceholderValue(test['endpoint'])
        ? env['endpoint']
        : test['endpoint']);

    return localProviders;
  }
  if ('aws' in kmsProvidersFromTest) {
    const env = kmsProvidersFromEnvironment['aws'];
    const fromTest = kmsProvidersFromTest['aws'];

    providers['aws'] = parseAWS(env, fromTest);
  }

  if ('aws:name1' in kmsProvidersFromTest) {
    const env = kmsProvidersFromEnvironment['aws'];
    const fromTest = kmsProvidersFromTest['aws:name1'];

    providers['aws:name1'] = parseAWS(env, fromTest);
  }

  if ('aws:name2' in kmsProvidersFromTest) {
    providers['aws:name2'] = {
      accessKeyId: process.env.FLE_AWS_KEY2,
      secretAccessKey: process.env.FLE_AWS_SECRET2
    };
  }

  if ('azure' in kmsProvidersFromTest) {
    const env = kmsProvidersFromEnvironment['azure'];
    const fromTest = kmsProvidersFromTest['azure'];

    providers['azure'] = parseAzure(env, fromTest);
  }

  if ('azure:name1' in kmsProvidersFromTest) {
    const env = kmsProvidersFromEnvironment['azure'];
    const fromTest = kmsProvidersFromTest['azure:name1'];

    providers['azure:name1'] = parseAzure(env, fromTest);
  }

  if ('gcp' in kmsProvidersFromTest) {
    const env = kmsProvidersFromEnvironment['gcp'];
    const fromTest = kmsProvidersFromTest['gcp'];

    providers['gcp'] = parseGCP(env, fromTest);
  }

  if ('gcp:name1' in kmsProvidersFromTest) {
    const env = kmsProvidersFromEnvironment['gcp'];
    const fromTest = kmsProvidersFromTest['gcp:name1'];

    providers['gcp:name1'] = parseGCP(env, fromTest);
  }

  if ('local' in kmsProvidersFromTest) {
    const env = kmsProvidersFromEnvironment['local'];
    const fromTest = kmsProvidersFromTest['local'];

    providers['local'] = parseLocal(env, fromTest);
  }

  if ('local:name1' in kmsProvidersFromTest) {
    const env = kmsProvidersFromEnvironment['local'];
    const fromTest = kmsProvidersFromTest['local:name1'];

    providers['local:name1'] = parseLocal(env, fromTest);
  }

  if ('local:name2' in kmsProvidersFromTest) {
    const env = kmsProvidersFromEnvironment['local'];
    const fromTest = kmsProvidersFromTest['local:name2'];

    providers['local:name2'] = parseLocal(env, fromTest);
  }

  if ('kmip' in kmsProvidersFromTest) {
    const env = kmsProvidersFromEnvironment['kmip'];
    const fromTest = kmsProvidersFromTest['kmip'];

    providers['kmip'] = parseKMIP(env, fromTest);
  }

  if ('kmip:name1' in kmsProvidersFromTest) {
    const env = kmsProvidersFromEnvironment['kmip'];
    const fromTest = kmsProvidersFromTest['kmip:name1'];

    providers['kmip:name1'] = parseKMIP(env, fromTest);
  }

  if (Object.keys(providers).length === 0) {
    throw new AssertionError('Found empty KMS providers in test');
  }

  return providers;
}

export async function createClientEncryption(
  map: EntitiesMap,
  entity: ClientEncryptionEntity
): Promise<ClientEncryption> {
  getMongoDBClientEncryption();

  const { clientEncryptionOpts } = entity;
  const {
    keyVaultClient,
    keyVaultNamespace,
    kmsProviders: kmsProvidersFromTest
  } = clientEncryptionOpts;

  const clientEntity = map.getEntity('client', keyVaultClient, false);
  if (!clientEntity) {
    throw new AssertionError(
      'unable to get client entity required by client encryption entity in unified test'
    );
  }

  const { kmsProviders: kmsProvidersFromEnvironment, tlsOptions } = getCSFLETestDataFromEnvironment(
    process.env
  );

  function parseTLSOptions() {
    const handlers: Record<string, string> = {
      aws: 'aws',
      'aws:name1': 'aws',
      'aws:name2': 'aws',
      azure: 'azure',
      'azure:name1': 'azure',
      gcp: 'gcp',
      'gcp:name1': 'gcp',
      local: 'local',
      'local:name1': 'local',
      'local:name2': 'local',
      kmip: 'kmip',
      'kmip:name1': 'kmip'
    };

    return Object.keys(kmsProvidersFromTest).reduce((accum, provider) => {
      const rootProvider = handlers[provider];
      if (rootProvider && rootProvider in tlsOptions) {
        accum[provider] = tlsOptions[rootProvider];
      }
      return accum;
    }, {});
  }

  let kmsProviders;
  try {
    kmsProviders = mergeKMSProviders(kmsProvidersFromTest, kmsProvidersFromEnvironment);
  } catch (error) {
    await clientEntity.close();
    throw error;
  }

  const autoEncryptionOptions: AutoEncryptionOptions = {
    keyVaultClient: clientEntity,
    kmsProviders,
    keyVaultNamespace,
    tlsOptions: parseTLSOptions()
  };

  if (process.env.CRYPT_SHARED_LIB_PATH) {
    autoEncryptionOptions.extraOptions = {
      cryptSharedLibPath: process.env.CRYPT_SHARED_LIB_PATH
    };
  }

  const clientEncryption = new ClientEncryption(clientEntity, autoEncryptionOptions);
  return clientEncryption;
}

import { expect } from 'chai';
import ConnectionString from 'mongodb-connection-string-url';
import { gte as semverGte, lte as semverLte } from 'semver';
import { isDeepStrictEqual } from 'util';

import type { CollectionOptions, DbOptions, Document, MongoClient } from '../../../src';
import { shouldRunServerlessTest } from '../../tools/utils';
import type { CollectionOrDatabaseOptions, RunOnRequirement } from './schema';

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
        skipReason = `requires ${r.topologies} but against a ${topologyType} topology`;
      }
    }
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
      // TODO(NODE-2471): Currently when there are credentials our driver will send a ping command
      // All other drivers connect implicitly upon the first operation
      // but in node you'll run into auth errors / successes at client.connect() time.
      // so we cannot run into saslContinue failPoints that get configured for an operation to fail with
      // Ex. 'errors during authentication are processed' in test/spec/load-balancers/sdam-error-handling.yml
      ok &&= false; // process.env.AUTH === 'auth';
      if (!ok && skipReason == null) {
        skipReason = `requires auth but auth cannot be tested in the unified format - TODO(NODE-2471)`;
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

export function patchDbOptions(options: CollectionOrDatabaseOptions): DbOptions {
  // TODO
  return { ...options } as DbOptions;
}

export function patchCollectionOptions(options: CollectionOrDatabaseOptions): CollectionOptions {
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
    connectionString.searchParams.set(name, String(value));
  }
  return connectionString.toString();
}

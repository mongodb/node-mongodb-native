import { expect } from 'chai';
import type { Document } from '../../../src';
import type { CollectionOrDatabaseOptions, RunOnRequirement } from './schema';
import { gte as semverGte, lte as semverLte } from 'semver';
import { CollectionOptions, DbOptions, MongoClient } from '../../../src';
import { isDeepStrictEqual } from 'util';
import { TestConfiguration } from './runner';

const ENABLE_UNIFIED_TEST_LOGGING = false;
export function log(message: unknown, ...optionalParameters: unknown[]): void {
  if (ENABLE_UNIFIED_TEST_LOGGING) console.warn(message, ...optionalParameters);
}

export async function topologySatisfies(
  config: TestConfiguration,
  r: RunOnRequirement,
  utilClient: MongoClient
): Promise<boolean> {
  let ok = true;
  if (r.minServerVersion) {
    const minVersion = patchVersion(r.minServerVersion);
    ok &&= semverGte(config.version, minVersion);
  }
  if (r.maxServerVersion) {
    const maxVersion = patchVersion(r.maxServerVersion);
    ok &&= semverLte(config.version, maxVersion);
  }

  if (r.topologies) {
    const topologyType = {
      Single: 'single',
      ReplicaSetNoPrimary: 'replicaset',
      ReplicaSetWithPrimary: 'replicaset',
      Sharded: 'sharded',
      LoadBalanced: 'load-balanced'
    }[config.topologyType];

    if (r.topologies.includes('sharded-replicaset') && topologyType === 'sharded') {
      const shards = await utilClient.db('config').collection('shards').find({}).toArray();
      ok &&= shards.length > 0 && shards.every(shard => shard.host.split(',').length > 1);
    } else {
      if (!topologyType) throw new Error(`Topology undiscovered: ${config.topologyType}`);
      ok &&= r.topologies.includes(topologyType);
    }
  }

  if (r.serverParameters) {
    if (!config.parameters) throw new Error('Configuration does not have server parameters');
    for (const [name, value] of Object.entries(r.serverParameters)) {
      if (name in config.parameters) {
        ok &&= isDeepStrictEqual(config.parameters[name], value);
      }
    }
  }

  if (r.auth) {
    ok &&=
      !!utilClient.options.auth ||
      !!utilClient.options.authSource ||
      !!utilClient.options.authMechanism;
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

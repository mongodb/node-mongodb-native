import { expect } from 'chai';
import {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent
} from '../../../src/cmap/events';
import type { CommandEvent } from './entities';
import type { CollectionOrDatabaseOptions, ExpectedEvent, RunOnRequirement } from './schema';
import type { TestConfiguration } from './unified.test';
import { gte as semverGte, lte as semverLte } from 'semver';
import { CollectionOptions, DbOptions } from '../../../src';

const ENABLE_UNIFIED_TEST_LOGGING = false;
export function log(message: unknown, ...optionalParameters: unknown[]): void {
  if (ENABLE_UNIFIED_TEST_LOGGING) console.warn(message, ...optionalParameters);
}

export function getUnmetRequirements(config: TestConfiguration, r: RunOnRequirement): boolean {
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
      Sharded: 'sharded'
    }[config.topologyType];
    if (!topologyType) throw new Error(`Topology undiscovered: ${config.topologyType}`);
    ok &&= r.topologies.includes(topologyType);
  }

  if (r.serverParameters) {
    // for (const [name, value] of Object.entries(r.serverParameters)) {
    //   // TODO
    // }
  }

  return ok;
}

/** Turns two lists into a joined list of tuples. Uses longer array length */
export function* zip<T = unknown, U = unknown>(
  iter1: T[],
  iter2: U[]
): Generator<[T | undefined, U | undefined], void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const longerArrayLength = Math.max(iter1.length, iter2.length);
  for (let index = 0; index < longerArrayLength; index++) {
    yield [iter1[index], iter2[index]];
  }
}

export function matchesEvents(expected: ExpectedEvent[], actual: CommandEvent[]): void {
  expect(expected).to.have.lengthOf(actual.length);

  for (const [index, actualEvent] of actual.entries()) {
    const expectedEvent = expected[index];

    if (expectedEvent.commandStartedEvent && actualEvent instanceof CommandStartedEvent) {
      expect(actualEvent.commandName).to.equal(expectedEvent.commandStartedEvent.commandName);
      expect(actualEvent.command).to.containSubset(expectedEvent.commandStartedEvent.command);
      expect(actualEvent.databaseName).to.equal(expectedEvent.commandStartedEvent.databaseName);
    } else if (
      expectedEvent.commandSucceededEvent &&
      actualEvent instanceof CommandSucceededEvent
    ) {
      expect(actualEvent.commandName).to.equal(expectedEvent.commandSucceededEvent.commandName);
      expect(actualEvent.reply).to.containSubset(expectedEvent.commandSucceededEvent.reply);
    } else if (expectedEvent.commandFailedEvent && actualEvent instanceof CommandFailedEvent) {
      expect(actualEvent.commandName).to.equal(expectedEvent.commandFailedEvent.commandName);
    } else {
      expect.fail(`Events must be one of the known types, got ${actualEvent}`);
    }
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

export interface ExistsOperator {
  $$exists: boolean;
}
export function isExistsOperator(value: unknown): value is ExistsOperator {
  return typeof value === 'object' && value != null && '$$exists' in value;
}
export interface TypeOperator {
  $$type: boolean;
}
export function isTypeOperator(value: unknown): value is TypeOperator {
  return typeof value === 'object' && value != null && '$$type' in value;
}
export interface MatchesEntityOperator {
  $$matchesEntity: string;
}
export function isMatchesEntityOperator(value: unknown): value is MatchesEntityOperator {
  return typeof value === 'object' && value != null && '$$matchesEntity' in value;
}
export interface MatchesHexBytesOperator {
  $$matchesHexBytes: string;
}
export function isMatchesHexBytesOperator(value: unknown): value is MatchesHexBytesOperator {
  return typeof value === 'object' && value != null && '$$matchesHexBytes' in value;
}
export interface UnsetOrMatchesOperator {
  $$unsetOrMatches: unknown;
}
export function isUnsetOrMatchesOperator(value: unknown): value is UnsetOrMatchesOperator {
  return typeof value === 'object' && value != null && '$$unsetOrMatches' in value;
}
export interface SessionLsidOperator {
  $$sessionLsid: unknown;
}
export function isSessionLsidOperator(value: unknown): value is SessionLsidOperator {
  return typeof value === 'object' && value != null && '$$sessionLsid' in value;
}

export const SpecialOperatorKeys = [
  '$$exists',
  '$$type',
  '$$matchesEntity',
  '$$matchesHexBytes',
  '$$unsetOrMatches',
  '$$sessionLsid'
];

export type SpecialOperator =
  | ExistsOperator
  | TypeOperator
  | MatchesEntityOperator
  | MatchesHexBytesOperator
  | UnsetOrMatchesOperator
  | SessionLsidOperator;

// eslint-disable-next-line @typescript-eslint/ban-types
type KeysOfUnion<T> = T extends object ? keyof T : never;
export type SpecialOperatorKey = KeysOfUnion<SpecialOperator>;
export function isSpecialOperator(value: unknown): value is SpecialOperator {
  return (
    isExistsOperator(value) ||
    isTypeOperator(value) ||
    isMatchesEntityOperator(value) ||
    isMatchesHexBytesOperator(value) ||
    isUnsetOrMatchesOperator(value) ||
    isSessionLsidOperator(value)
  );
}

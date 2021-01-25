import { expect } from 'chai';
import { isDeepStrictEqual } from 'util';
import { Binary, Document, Long, ObjectId, MongoError } from '../../../src';
import {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent
} from '../../../src/cmap/events';
import { CommandEvent, EntitiesMap } from './entities';
import { ExpectedError, ExpectedEvent } from './schema';

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
  $$sessionLsid: string;
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

const TYPE_MAP = new Map();

TYPE_MAP.set('double', actual => typeof actual === 'number' || actual._bsontype === 'Double');
TYPE_MAP.set('string', actual => typeof actual === 'string');
TYPE_MAP.set('object', actual => typeof actual === 'object' && actual !== null);
TYPE_MAP.set('array', actual => Array.isArray(actual));
TYPE_MAP.set('binData', actual => actual instanceof Binary);
TYPE_MAP.set('undefined', actual => actual === undefined);
TYPE_MAP.set('objectId', actual => actual instanceof ObjectId);
TYPE_MAP.set('bool', actual => typeof actual === 'boolean');
TYPE_MAP.set('date', actual => actual instanceof Date);
TYPE_MAP.set('null', actual => actual === null);
TYPE_MAP.set('regex', actual => actual instanceof RegExp || actual._bsontype === 'BSONRegExp');
TYPE_MAP.set('dbPointer', actual => actual._bsontype === 'DBRef');
TYPE_MAP.set('javascript', actual => actual._bsontype === 'Code');
TYPE_MAP.set('symbol', actual => actual._bsontype === 'Symbol');
TYPE_MAP.set('javascriptWithScope', actual => actual._bsontype === 'Code' && actual.scope);
TYPE_MAP.set('timestamp', actual => actual._bsontype === 'Timestamp');
TYPE_MAP.set('decimal', actual => actual._bsontype === 'Decimal128');
TYPE_MAP.set('minKey', actual => actual._bsontype === 'MinKey');
TYPE_MAP.set('maxKey', actual => actual._bsontype === 'MaxKey');
TYPE_MAP.set(
  'int',
  actual => (typeof actual === 'number' && Number.isInteger(actual)) || actual._bsontype === 'Int32'
);
TYPE_MAP.set(
  'long',
  actual => (typeof actual === 'number' && Number.isInteger(actual)) || Long.isLong(actual)
);

export function expectResultCheck(
  actual: Document,
  expected: Document | number | string | boolean,
  entities: EntitiesMap,
  path: string[] = [],
  depth = 0
): boolean {
  const ok = resultCheck(actual, expected, entities, path, depth);
  if (ok === false) {
    const pathString = path.join('');
    const expectedJSON = JSON.stringify(expected, undefined, 2);
    const actualJSON = JSON.stringify(actual, undefined, 2);
    expect.fail(`Unable to match ${expectedJSON} to ${actualJSON} at ${pathString}`);
  }
  return ok;
}

export function resultCheck(
  actual: Document,
  expected: Document | number | string | boolean,
  entities: EntitiesMap,
  path: string[],
  depth = 0
): boolean {
  if (typeof expected === 'object' && expected !== null) {
    // Expected is an object
    // either its a special operator or just an object to check equality against

    if (isSpecialOperator(expected)) {
      // Special operation check is a base condition
      // specialCheck may recurse depending upon the check ($$unsetOrMatches)
      return specialCheck(actual, expected, entities, path, depth);
    } else {
      // Just a plain object, however this object can contain special operations
      // So we need to recurse over each key,value
      let ok = true;
      const expectedEntries = Object.entries(expected);

      if (depth > 1 && Object.keys(actual).length !== Object.keys(expected).length) {
        throw new Error(`[${Object.keys(actual)}] length !== [${Object.keys(expected)}]`);
      }

      for (const [key, value] of expectedEntries) {
        path.push(Array.isArray(expected) ? `[${key}]` : `.${key}`); // record what key we're at
        depth += 1;
        ok &&= expectResultCheck(actual[key], value, entities, path, depth);
        depth -= 1;
        path.pop(); // if the recursion was successful we can drop the tested key
      }
      return ok;
    }
  } else {
    // Here's our recursion base case
    // expected is: number | string | boolean | null
    return isDeepStrictEqual(actual, expected);
  }
}

export function specialCheck(
  actual: Document,
  expected: SpecialOperator,
  entities: EntitiesMap,
  path: string[] = [],
  depth = 0
): boolean {
  let ok = false;
  if (isUnsetOrMatchesOperator(expected)) {
    // $$unsetOrMatches
    ok = true; // start with true assumption
    if (actual === null || actual === undefined) ok = true;
    else {
      depth += 1;
      ok &&= expectResultCheck(actual, expected.$$unsetOrMatches, entities, path, depth);
      depth -= 1;
    }
  } else if (isMatchesEntityOperator(expected)) {
    // $$matchesEntity
    const entity = entities.get(expected.$$matchesEntity);
    if (!entity) ok = false;
    else ok = isDeepStrictEqual(actual, entity);
  } else if (isMatchesHexBytesOperator(expected)) {
    // $$matchesHexBytes
    const expectedBuffer = Buffer.from(expected.$$matchesHexBytes, 'hex');
    ok = expectedBuffer.every((byte, index) => byte === actual[index]);
  } else if (isSessionLsidOperator(expected)) {
    // $$sessionLsid
    const session = entities.getEntity('session', expected.$$sessionLsid, false);
    if (!session) ok = false;
    else ok = session.id.id.buffer.equals(actual.lsid.id.buffer);
  } else if (isTypeOperator(expected)) {
    // $$type
    const types = Array.isArray(expected.$$type) ? expected.$$type : [expected.$$type];
    for (const type of types) {
      ok ||= TYPE_MAP.get(type)(actual);
    }
  } else if (isExistsOperator(expected)) {
    // $$exists - unique, this op uses the path to check if the key is (not) in actual
    const actualExists = actual !== undefined && actual !== null;
    ok = (expected.$$exists && actualExists) || (!expected.$$exists && !actualExists);
  } else {
    throw new Error(`Unknown special operator: ${JSON.stringify(expected)}`);
  }

  return ok;
}

export function matchesEvents(
  expected: ExpectedEvent[],
  actual: CommandEvent[],
  entities: EntitiesMap
): void {
  // TODO: NodeJS Driver has extra events
  // expect(actual).to.have.lengthOf(expected.length);

  for (const [index, actualEvent] of actual.entries()) {
    const expectedEvent = expected[index];

    if (expectedEvent.commandStartedEvent && actualEvent instanceof CommandStartedEvent) {
      expectResultCheck(actualEvent, expectedEvent.commandStartedEvent, entities, [
        `events[${index}].commandStartedEvent`
      ]);
    } else if (
      expectedEvent.commandSucceededEvent &&
      actualEvent instanceof CommandSucceededEvent
    ) {
      expectResultCheck(actualEvent, expectedEvent.commandSucceededEvent, entities, [
        `events[${index}].commandSucceededEvent`
      ]);
    } else if (expectedEvent.commandFailedEvent && actualEvent instanceof CommandFailedEvent) {
      expect(actualEvent.commandName).to.equal(expectedEvent.commandFailedEvent.commandName);
    } else {
      expect.fail(`Events must be one of the known types, got ${actualEvent}`);
    }
  }
}

export function expectErrorCheck(
  error: Error | MongoError,
  expected: ExpectedError,
  entities: EntitiesMap
): boolean {
  if (Object.keys(expected)[0] === 'isClientError' || Object.keys(expected)[0] === 'isError') {
    // FIXME: We cannot tell if Error arose from driver and not from server
    return;
  }

  if (expected.errorContains) {
    if (error.message.includes(expected.errorContains)) {
      throw new Error(
        `Error message was supposed to contain '${expected.errorContains}' but had '${error.message}'`
      );
    }
  }

  if (!(error instanceof MongoError)) {
    throw new Error(`Assertions need ${error} to be a MongoError`);
  }

  if (expected.errorCode) {
    if (error.code !== expected.errorCode) {
      throw new Error(`${error} was supposed to have code '${expected.errorCode}'`);
    }
  }

  if (expected.errorCodeName) {
    if (error.codeName !== expected.errorCodeName) {
      throw new Error(`${error} was supposed to have '${expected.errorCodeName}' codeName`);
    }
  }

  if (expected.errorLabelsContain) {
    for (const errorLabel of expected.errorLabelsContain) {
      if (!error.hasErrorLabel(errorLabel)) {
        throw new Error(`${error} was supposed to have '${errorLabel}'`);
      }
    }
  }

  if (expected.errorLabelsOmit) {
    for (const errorLabel of expected.errorLabelsOmit) {
      if (error.hasErrorLabel(errorLabel)) {
        throw new Error(`${error} was not supposed to have '${errorLabel}'`);
      }
    }
  }

  if (expected.expectResult) {
    if (!expectResultCheck(error, expected.expectResult, entities)) {
      throw new Error(`${error} supposed to match result ${JSON.stringify(expected.expectResult)}`);
    }
  }
}

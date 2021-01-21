import { expect } from 'chai';
import { isDeepStrictEqual } from 'util';
import {
  Binary,
  BSONRegExp,
  Document,
  Double,
  Int32,
  Long,
  ObjectId,
  Timestamp
} from '../../../src';
import {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent
} from '../../../src/cmap/events';
import { CommandEvent, EntitiesMap } from './entities';
import { ExpectedEvent } from './schema';

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
function typeof_double(actual): actual is number | Double {
  return typeof actual === 'number' || actual._bsontype === 'Double';
}
function typeof_string(actual: unknown): actual is string {
  return typeof actual === 'string';
}
function typeof_object(actual: unknown): actual is Document {
  return typeof actual === 'object' && actual !== null;
}
function typeof_array(actual: unknown): actual is unknown[] {
  return Array.isArray(actual);
}
function typeof_binData(actual) {
  return actual instanceof Binary;
}
function typeof_undefined(actual) {
  return actual === undefined;
}
function typeof_objectId(actual) {
  return actual instanceof ObjectId;
}
function typeof_bool(actual) {
  return typeof actual === 'boolean';
}
function typeof_date(actual) {
  return actual instanceof Date;
}
function typeof_null(actual) {
  return actual === null;
}
function typeof_regex(actual) {
  return actual instanceof RegExp || actual._bsontype === 'BSONRegExp';
}
function typeof_dbPointer(actual) {
  return actual._bsontype === 'DBRef';
}
function typeof_javascript(actual) {
  return actual._bsontype === 'Code';
}
function typeof_symbol(actual) {
  return actual._bsontype === 'Symbol';
}
function typeof_javascriptWithScope(actual) {
  return actual._bsontype === 'Code' && actual.scope;
}
function typeof_int(actual): actual is number | Int32 {
  return (typeof actual === 'number' && Number.isInteger(actual)) || actual._bsontype === 'Int32';
}
function typeof_timestamp(actual: Timestamp, expected: Timestamp) {
  expect(actual.equals(expected)).to.be.true;
}
function typeof_long(actual: unknown): actual is number | Long {
  return (typeof actual === 'number' && Number.isInteger(actual)) || Long.isLong(actual);
}
function typeof_decimal(actual) {
  return actual._bsontype === 'Decimal128';
}
function typeof_minKey(actual) {
  return actual._bsontype === 'MinKey';
}
function typeof_maxKey(actual) {
  return actual._bsontype === 'MaxKey';
}

TYPE_MAP.set('double', typeof_double);
TYPE_MAP.set('string', typeof_string);
TYPE_MAP.set('object', typeof_object);
TYPE_MAP.set('array', typeof_array);
TYPE_MAP.set('binData', typeof_binData);
TYPE_MAP.set('undefined', typeof_undefined);
TYPE_MAP.set('objectId', typeof_objectId);
TYPE_MAP.set('bool', typeof_bool);
TYPE_MAP.set('date', typeof_date);
TYPE_MAP.set('null', typeof_null);
TYPE_MAP.set('regex', typeof_regex);
TYPE_MAP.set('dbPointer', typeof_dbPointer);
TYPE_MAP.set('javascript', typeof_javascript);
TYPE_MAP.set('symbol', typeof_symbol);
TYPE_MAP.set('javascriptWithScope', typeof_javascriptWithScope);
TYPE_MAP.set('int', typeof_int);
TYPE_MAP.set('timestamp', typeof_timestamp);
TYPE_MAP.set('long', typeof_long);
TYPE_MAP.set('decimal', typeof_decimal);
TYPE_MAP.set('minKey', typeof_minKey);
TYPE_MAP.set('maxKey', typeof_maxKey);

export function expectResultCheck(
  actual: Document,
  expected: Document | number | string | boolean,
  entities: EntitiesMap,
  path: string[] = []
): boolean {
  const result = resultCheck(actual, expected, entities, path);
  if (result[0] === false) {
    const path = result[1].join('');
    const expectedJSON = JSON.stringify(expected, undefined, 2);
    const actualJSON = JSON.stringify(actual, undefined, 2);
    expect.fail(`Unable to match ${expectedJSON} to ${actualJSON} at ${path}`);
  }
  return result[0];
}

export function resultCheck(
  actual: Document,
  expected: Document | number | string | boolean,
  entities: EntitiesMap,
  path: string[]
): [ok: boolean, path: string[]] {
  if (typeof expected === 'object' && expected !== null) {
    // Expected is an object
    // either its a special operator or just an object to check equality against

    if (isSpecialOperator(expected)) {
      // Special operation check is a base condition
      // specialCheck may recurse depending upon the check ($$unsetOrMatches)
      return [specialCheck(actual, expected, entities, path), path];
    } else {
      // Just a plain object, however this object can contain special operations
      // So we need to recurse over each key,value
      let ok = true;
      const expectedEntries = Object.entries(expected);
      for (const [key, value] of expectedEntries) {
        path.push(Array.isArray(expected) ? `[${key}]` : `.${key}`); // record what key we're at
        ok &&= expectResultCheck(actual[key], value, entities, path);
        path.pop(); // if the recursion was successful we can drop the tested key
      }
      return [ok, path];
    }
  } else {
    // Here's our recursion base case
    // expected is: number | string | boolean | null
    return [isDeepStrictEqual(actual, expected), path];
  }
}

export function specialCheck(
  actual: Document,
  expected: SpecialOperator,
  entities: EntitiesMap,
  path: string[] = []
): boolean {
  let ok = false;
  if (isUnsetOrMatchesOperator(expected)) {
    // $$unsetOrMatches
    ok = true; // start with true assumption
    if (actual === null || actual === undefined) ok = true;
    else ok &&= expectResultCheck(actual, expected.$$unsetOrMatches, entities, path);
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

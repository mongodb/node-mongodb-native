import { expect } from 'chai';
import { inspect } from 'util';
import {
  Binary,
  Document,
  Long,
  ObjectId,
  MongoError,
  MongoDriverError,
  MongoServerError,
  MongoNetworkError
} from '../../../src';
import {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent
} from '../../../src/cmap/command_monitoring_events';
import {
  ConnectionPoolCreatedEvent,
  ConnectionPoolClosedEvent,
  ConnectionCreatedEvent,
  ConnectionReadyEvent,
  ConnectionClosedEvent,
  ConnectionCheckOutStartedEvent,
  ConnectionCheckOutFailedEvent,
  ConnectionCheckedOutEvent,
  ConnectionCheckedInEvent,
  ConnectionPoolClearedEvent
} from '../../../src/cmap/connection_pool_events';
import { CommandEvent, CmapEvent, EntitiesMap } from './entities';
import { ExpectedCmapEvent, ExpectedCommandEvent, ExpectedError } from './schema';

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

export function resultCheck(
  actual: Document,
  expected: Document | number | string | boolean,
  entities: EntitiesMap,
  path: string[] = [],
  depth = 0
): void {
  if (typeof expected === 'object' && expected) {
    // Expected is an object
    // either its a special operator or just an object to check equality against

    if (isSpecialOperator(expected)) {
      // Special operation check is a base condition
      // specialCheck may recurse depending upon the check ($$unsetOrMatches)
      specialCheck(actual, expected, entities, path, depth);
      return;
    } else {
      // Just a plain object, however this object can contain special operations
      // So we need to recurse over each key,value
      const expectedEntries = Object.entries(expected);

      if (depth > 1) {
        expect(actual, `Expected actual to exist at ${path.join('')}`).to.exist;
        const actualKeys = Object.keys(actual);
        const expectedKeys = Object.keys(expected);
        // Don't check for full key set equality because some of the actual keys
        // might be e.g. $$unsetOrMatches, which can be omitted.
        expect(
          actualKeys.filter(key => !expectedKeys.includes(key)),
          `[${Object.keys(actual)}] has more than the expected keys: [${Object.keys(expected)}]`
        ).to.have.lengthOf(0);
      }

      for (const [key, value] of expectedEntries) {
        path.push(Array.isArray(expected) ? `[${key}]` : `.${key}`); // record what key we're at
        depth += 1;
        if (key === 'sort') {
          // TODO: This is a workaround that works because all sorts in the specs
          // are objects with one key; ideally we'd want to adjust the spec definitions
          // to indicate whether order matters for any given key and set general
          // expectations accordingly (see NODE-3235)
          expect(Object.keys(value)).to.have.lengthOf(1);
          expect(actual[key]).to.be.instanceOf(Map);
          expect(actual[key].size).to.equal(1);
          const expectedSortKey = Object.keys(value)[0];
          expect(actual[key]).to.have.all.keys(expectedSortKey);
          const objFromActual = { [expectedSortKey]: actual[key].get(expectedSortKey) };
          resultCheck(objFromActual, value, entities, path, depth);
        } else {
          resultCheck(actual[key], value, entities, path, depth);
        }
        depth -= 1;
        path.pop(); // if the recursion was successful we can drop the tested key
      }
    }
  } else {
    // Here's our recursion base case
    // expected is: number | Long | string | boolean | null
    if (Long.isLong(actual) && typeof expected === 'number') {
      // Long requires special equality check
      expect(actual.equals(expected)).to.be.true;
    } else if (Long.isLong(expected) && typeof actual === 'number') {
      // Long requires special equality check
      expect(expected.equals(actual)).to.be.true;
    } else {
      expect(actual).to.equal(expected);
    }
  }
}

export function specialCheck(
  actual: Document,
  expected: SpecialOperator,
  entities: EntitiesMap,
  path: string[] = [],
  depth = 0
): boolean {
  if (isUnsetOrMatchesOperator(expected)) {
    // $$unsetOrMatches
    if (actual === null || actual === undefined) return;
    else {
      depth += 1;
      resultCheck(actual, expected.$$unsetOrMatches, entities, path, depth);
      depth -= 1;
    }
  } else if (isMatchesEntityOperator(expected)) {
    // $$matchesEntity
    const entity = entities.get(expected.$$matchesEntity);
    if (
      typeof actual === 'object' && // an object
      actual && // that isn't null
      'equals' in actual && // with an equals
      typeof actual.equals === 'function' // method
    ) {
      expect(actual.equals(entity)).to.be.true;
    } else {
      expect(actual).to.equal(entity);
    }
  } else if (isMatchesHexBytesOperator(expected)) {
    // $$matchesHexBytes
    const expectedBuffer = Buffer.from(expected.$$matchesHexBytes, 'hex');
    expect(expectedBuffer.every((byte, index) => byte === actual[index])).to.be.true;
  } else if (isSessionLsidOperator(expected)) {
    // $$sessionLsid
    const session = entities.getEntity('session', expected.$$sessionLsid, false);
    expect(session, `Session ${expected.$$sessionLsid} does not exist in entities`).to.exist;
    const entitySessionHex = session.id.id.buffer.toString('hex').toUpperCase();
    const actualSessionHex = actual.id.buffer.toString('hex').toUpperCase();
    expect(
      entitySessionHex,
      `Session entity ${expected.$$sessionLsid} does not match lsid`
    ).to.equal(actualSessionHex);
  } else if (isTypeOperator(expected)) {
    // $$type
    let ok: boolean;
    const types = Array.isArray(expected.$$type) ? expected.$$type : [expected.$$type];
    for (const type of types) {
      ok ||= TYPE_MAP.get(type)(actual);
    }
    expect(ok, `Expected [${actual}] to be one of [${types}]`).to.be.true;
  } else if (isExistsOperator(expected)) {
    // $$exists
    const actualExists = actual !== undefined && actual !== null;
    expect((expected.$$exists && actualExists) || (!expected.$$exists && !actualExists)).to.be.true;
  } else {
    expect.fail(`Unknown special operator: ${JSON.stringify(expected)}`);
  }
}

// CMAP events where the payload does not matter.
const EMPTY_CMAP_EVENTS = {
  poolCreatedEvent: ConnectionPoolCreatedEvent,
  poolClosedEvent: ConnectionPoolClosedEvent,
  connectionCreatedEvent: ConnectionCreatedEvent,
  connectionReadyEvent: ConnectionReadyEvent,
  connectionCheckOutStartedEvent: ConnectionCheckOutStartedEvent,
  connectionCheckOutFailedEvent: ConnectionCheckOutFailedEvent,
  connectionCheckedOutEvent: ConnectionCheckedOutEvent,
  connectionCheckedInEvent: ConnectionCheckedInEvent
};

function validEmptyCmapEvent(
  expected: ExpectedCommandEvent | ExpectedCmapEvent,
  actual: CommandEvent | CmapEvent
) {
  return Object.values(EMPTY_CMAP_EVENTS).some(value => {
    return actual instanceof value;
  });
}

export function matchesEvents(
  expected: (ExpectedCommandEvent & ExpectedCmapEvent)[],
  actual: (CommandEvent & CmapEvent)[],
  entities: EntitiesMap
): void {
  if (actual.length !== expected.length) {
    const actualNames = actual.map(a => a.constructor.name);
    const expectedNames = expected.map(e => Object.keys(e)[0]);
    expect.fail(
      `Expected event count mismatch, expected ${inspect(expectedNames)} but got ${inspect(
        actualNames
      )}`
    );
  }

  for (const [index, actualEvent] of actual.entries()) {
    const expectedEvent = expected[index];

    if (expectedEvent.commandStartedEvent) {
      expect(actualEvent).to.be.instanceOf(CommandStartedEvent);
      resultCheck(actualEvent, expectedEvent.commandStartedEvent, entities, [
        `events[${index}].commandStartedEvent`
      ]);
    } else if (expectedEvent.commandSucceededEvent) {
      expect(actualEvent).to.be.instanceOf(CommandSucceededEvent);
      resultCheck(actualEvent, expectedEvent.commandSucceededEvent, entities, [
        `events[${index}].commandSucceededEvent`
      ]);
    } else if (expectedEvent.commandFailedEvent) {
      expect(actualEvent).to.be.instanceOf(CommandFailedEvent);
      expect(actualEvent.commandName).to.equal(expectedEvent.commandFailedEvent.commandName);
    } else if (expectedEvent.connectionClosedEvent) {
      expect(actualEvent).to.be.instanceOf(ConnectionClosedEvent);
      if (expectedEvent.connectionClosedEvent.hasServiceId) {
        expect(actualEvent).property('serviceId').to.exist;
      }
    } else if (expectedEvent.poolClearedEvent) {
      expect(actualEvent).to.be.instanceOf(ConnectionPoolClearedEvent);
      if (expectedEvent.poolClearedEvent.hasServiceId) {
        expect(actualEvent).property('serviceId').to.exist;
      }
    } else if (!validEmptyCmapEvent(expectedEvent, actualEvent)) {
      expect.fail(`Events must be one of the known types, got ${inspect(actualEvent)}`);
    }
  }
}

export function expectErrorCheck(
  error: Error | MongoError,
  expected: ExpectedError,
  entities: EntitiesMap
): boolean {
  if (expected.isClientError === true) {
    expect(error).to.satisfy(
      (error: unknown) => error instanceof MongoDriverError || error instanceof MongoNetworkError
    );
  } else if (expected.isClientError === false) {
    expect(error).to.be.instanceOf(MongoServerError);
  }

  const expectMessage = `\n\nOriginal Error Stack:\n${error.stack}\n\n`;

  if (expected.errorContains != null) {
    expect(error.message, expectMessage).to.include(expected.errorContains);
  }

  if (!(error instanceof MongoError)) {
    // if statement asserts type for TS, expect will always fail
    expect(error, expectMessage).to.be.instanceOf(MongoError);
    return;
  }

  if (expected.errorCode != null) {
    expect(error, expectMessage).to.have.property('code', expected.errorCode);
  }

  if (expected.errorCodeName != null) {
    expect(error, expectMessage).to.have.property('codeName', expected.errorCodeName);
  }

  if (expected.errorLabelsContain != null) {
    for (const errorLabel of expected.errorLabelsContain) {
      expect(
        error.hasErrorLabel(errorLabel),
        `Error was supposed to have label ${errorLabel}, has [${error.errorLabels}] -- ${expectMessage}`
      ).to.be.true;
    }
  }

  if (expected.errorLabelsOmit != null) {
    for (const errorLabel of expected.errorLabelsOmit) {
      expect(
        error.hasErrorLabel(errorLabel),
        `Error was supposed to have label ${errorLabel}, has [${error.errorLabels}] -- ${expectMessage}`
      ).to.be.false;
    }
  }

  if (expected.expectResult != null) {
    resultCheck(error, expected.expectResult, entities);
  }
}

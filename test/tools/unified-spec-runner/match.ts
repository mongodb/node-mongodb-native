/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { EJSON } from 'bson';
import { expect } from 'chai';
import { inspect } from 'util';

import {
  Binary,
  type BSONTypeAlias,
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent,
  ConnectionCheckedInEvent,
  ConnectionCheckedOutEvent,
  ConnectionCheckOutFailedEvent,
  ConnectionCheckOutStartedEvent,
  ConnectionClosedEvent,
  ConnectionCreatedEvent,
  ConnectionPoolClearedEvent,
  ConnectionPoolClosedEvent,
  ConnectionPoolCreatedEvent,
  ConnectionPoolReadyEvent,
  ConnectionReadyEvent,
  type Document,
  Long,
  MongoBulkWriteError,
  MongoClientBulkWriteError,
  MongoError,
  MongoOperationTimeoutError,
  MongoServerError,
  ObjectId,
  type OneOrMore,
  ServerClosedEvent,
  ServerDescriptionChangedEvent,
  ServerHeartbeatFailedEvent,
  ServerHeartbeatStartedEvent,
  ServerHeartbeatSucceededEvent,
  ServerOpeningEvent,
  TopologyClosedEvent,
  TopologyDescriptionChangedEvent,
  TopologyOpeningEvent
} from '../../mongodb';
import { ejson } from '../utils';
import { type CmapEvent, type CommandEvent, type EntitiesMap, type SdamEvent } from './entities';
import {
  type ExpectedCmapEvent,
  type ExpectedCommandEvent,
  type ExpectedError,
  type ExpectedEventsForClient,
  type ExpectedLogMessage,
  type ExpectedSdamEvent
} from './schema';

export interface ExistsOperator {
  $$exists: boolean;
}
export function isExistsOperator(value: unknown): value is ExistsOperator {
  return typeof value === 'object' && value != null && '$$exists' in value;
}
export interface TypeOperator {
  $$type: OneOrMore<BSONTypeAlias>;
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
export interface MatchAsDocumentOperator {
  $$matchAsDocument: unknown;
}
export function isMatchAsDocumentOperator(value: unknown): value is MatchAsDocumentOperator {
  return typeof value === 'object' && value != null && '$$matchAsDocument' in value;
}
export interface MatchAsRootOperator {
  $$matchAsRoot: unknown;
}
export function isMatchAsRootOperator(value: unknown): value is MatchAsRootOperator {
  return typeof value === 'object' && value != null && '$$matchAsRoot' in value;
}

export interface LteOperator {
  $$lte: number;
}

export function isLteOperator(value: unknown): value is LteOperator {
  return (
    typeof value === 'object' &&
    value != null &&
    '$$lte' in value &&
    typeof value['$$lte'] === 'number'
  );
}

export const SpecialOperatorKeys = [
  '$$exists',
  '$$type',
  '$$matchesEntity',
  '$$matchesHexBytes',
  '$$matchAsRoot',
  '$$matchAsDocument',
  '$$unsetOrMatches',
  '$$sessionLsid',
  '$$lte'
];

export type SpecialOperator =
  | ExistsOperator
  | TypeOperator
  | MatchesEntityOperator
  | MatchesHexBytesOperator
  | UnsetOrMatchesOperator
  | SessionLsidOperator
  | MatchAsDocumentOperator
  | MatchAsRootOperator
  | LteOperator;

type KeysOfUnion<T> = T extends object ? keyof T : never;
export type SpecialOperatorKey = KeysOfUnion<SpecialOperator>;
export function isSpecialOperator(value: unknown): value is SpecialOperator {
  return (
    isExistsOperator(value) ||
    isTypeOperator(value) ||
    isMatchesEntityOperator(value) ||
    isMatchesHexBytesOperator(value) ||
    isUnsetOrMatchesOperator(value) ||
    isSessionLsidOperator(value) ||
    isMatchAsRootOperator(value) ||
    isMatchAsDocumentOperator(value) ||
    isLteOperator(value)
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
  actual =>
    (typeof actual === 'number' && Number.isInteger(actual)) || actual?._bsontype === 'Int32'
);
TYPE_MAP.set(
  'long',
  actual =>
    (typeof actual === 'number' && Number.isInteger(actual)) ||
    Long.isLong(actual) ||
    typeof actual === 'bigint'
);

/**
 * resultCheck
 *
 * @param actual - the actual result
 * @param expected - the expected result
 * @param entities - the EntitiesMap associated with the test
 * @param path - an array of strings representing the 'path' in the document down to the current
 *              value.  For example, given `{ a: { b: { c: 4 } } }`, when evaluating `{ c: 4 }`, the path
 *              will look like: `['a', 'b']`.  Used to print useful error messages when assertions fail.
 * @param checkExtraKeys - a boolean value that determines how keys present on the `actual` object but
 *              not on the `expected` object are treated.  When set to `true`, any extra keys on the
 *              `actual` object will throw an error
 */
export function resultCheck(
  actual: Document,
  expected: Document | number | string | boolean,
  entities: EntitiesMap,
  path: string[] = [],
  checkExtraKeys = false
): void {
  function checkNestedDocuments(key: string, value: any, checkExtraKeys: boolean) {
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
      resultCheck(objFromActual, value, entities, path, checkExtraKeys);
    } else if (key === 'createIndexes') {
      for (const [i, userIndex] of actual.indexes.entries()) {
        if (expected?.indexes?.[i]?.key == null) {
          // The expectation does not include an assertion for the index key
          continue;
        }
        expect(expected).to.have.nested.property(`.indexes[${i}].key`).to.be.a('object');
        // @ts-expect-error: Not worth narrowing to a document
        expect(Object.keys(expected.indexes[i].key)).to.have.lengthOf(1);
        expect(userIndex).to.have.property('key').that.is.instanceOf(Map);
        expect(
          userIndex.key.size,
          'Test input is JSON and cannot correctly test more than 1 key'
        ).to.equal(1);
        userIndex.key = Object.fromEntries(userIndex.key);
      }
      resultCheck(actual[key], value, entities, path, checkExtraKeys);
    } else {
      // If our actual value is a map, such as in the client bulk write results, we need
      // to convert the expected keys from the string numbers to actual numbers since the key
      // values in the maps are actual numbers.
      const isActualMap = actual instanceof Map;
      const mapKey = !Number.isNaN(Number(key)) ? Number(key) : key;
      resultCheck(
        isActualMap ? actual.get(mapKey) : actual[key],
        value,
        entities,
        path,
        checkExtraKeys
      );
    }
  }

  if (typeof expected === 'object' && expected) {
    // Expected is an object
    // either its a special operator or just an object to check equality against

    if (isSpecialOperator(expected)) {
      // Special operation check is a base condition
      // specialCheck may recurse depending upon the check ($$unsetOrMatches)
      specialCheck(actual, expected, entities, path, checkExtraKeys);
      return;
    }

    if (typeof actual !== 'object') {
      expect.fail(
        `Expected actual value (${inspect(actual)}) to be an object at: ${path.join('')}`
      );
    }

    const expectedEntries = Object.entries(expected);

    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) {
        expect.fail(
          `expected value at ${path.join('.')} to be an array, but received ${inspect(actual)}`
        );
      }
      for (const [index, value] of expectedEntries) {
        path.push(`[${index}]`);
        checkNestedDocuments(index, value, checkExtraKeys);
        path.pop();
      }
    } else {
      for (const [key, value] of expectedEntries) {
        path.push(`.${key}`);
        checkNestedDocuments(key, value, checkExtraKeys);
        path.pop();
      }

      if (checkExtraKeys) {
        expect(actual, `Expected actual to exist at ${path.join('')}`).to.exist;
        // by using `Object.keys`, we ignore non-enumerable properties. This is intentional.
        const actualKeys = Object.keys(actual);
        const expectedKeys = Object.keys(expected);
        // Don't check for full key set equality because some of the actual keys
        // might be e.g. $$unsetOrMatches, which can be omitted.
        const extraKeys = actualKeys.filter(key => !expectedKeys.includes(key));

        if (extraKeys.length > 0) {
          expect.fail(
            `object has more keys than expected.  \n\tactual: [${actualKeys}] \n\texpected: [${expectedKeys}]`
          );
        }
      }
    }

    return;
  }

  // Here's our recursion base case
  // expected is: number | Long | string | boolean | null
  if (Long.isLong(actual) && typeof expected === 'number') {
    // Long requires special equality check
    expect(actual.equals(expected)).to.be.true;
  } else if (Long.isLong(expected) && typeof actual === 'number') {
    // Long requires special equality check
    expect(expected.equals(actual)).to.be.true;
  } else if (Number.isNaN(actual) && Number.isNaN(expected)) {
    // in JS, NaN isn't equal to NaN but we want to not fail if we have two NaN
  } else if (
    typeof expected === 'number' &&
    typeof actual === 'number' &&
    expected === 0 &&
    actual === 0
  ) {
    // case to handle +0 and -0
    expect(Object.is(expected, actual)).to.be.true;
  } else if (actual && actual._bsontype === 'Int32' && typeof expected === 'number') {
    expect(actual.value).to.equal(expected);
  } else {
    expect(actual).to.equal(expected);
  }
}

export function specialCheck(
  actual: Document,
  expected: SpecialOperator,
  entities: EntitiesMap,
  path: string[] = [],
  checkExtraKeys: boolean
): void {
  if (isUnsetOrMatchesOperator(expected)) {
    if (actual === null || actual === undefined) return;

    resultCheck(actual, expected.$$unsetOrMatches as any, entities, path, checkExtraKeys);
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
    const entitySessionHex = session.id!.id.toString('hex').toUpperCase();
    const actualSessionHex = actual.id!.toString('hex').toUpperCase();

    expect(
      entitySessionHex,
      `Session entity ${expected.$$sessionLsid} does not match lsid`
    ).to.equal(actualSessionHex);
  } else if (isTypeOperator(expected)) {
    // $$type
    let ok = false;
    const types = Array.isArray(expected.$$type) ? expected.$$type : [expected.$$type];
    for (const type of types) {
      ok ||= TYPE_MAP.get(type)(actual);
    }
    expect(ok, `Expected ${path.join('.')} [${actual}] to be one of [${types}]`).to.be.true;
  } else if (isExistsOperator(expected)) {
    // $$exists
    const actualExists = actual !== undefined && actual !== null;

    if (expected.$$exists) {
      expect(
        actualExists,
        ejson`expected value at path ${path.join('')} to exist, but received ${actual}`
      ).to.be.true;
    } else {
      expect(
        actualExists,
        ejson`expected value at path ${path.join('')} NOT to exist, but received ${actual}`
      ).to.be.false;
    }
  } else if (isMatchAsDocumentOperator(expected)) {
    if (typeof actual === 'string') {
      const actualDoc = EJSON.parse(actual, { relaxed: false });
      resultCheck(actualDoc, expected.$$matchAsDocument as any, entities, path, checkExtraKeys);
    } else {
      expect.fail(
        `Expected value at path '${path.join('')}' to be string, but received ${inspect(actual)}`
      );
    }
  } else if (isMatchAsRootOperator(expected)) {
    expect(
      typeof actual,
      `Expected value at path '${path.join('')}' to be object, but received ${inspect(actual)}`
    ).to.equal('object');
    expect(typeof expected.$$matchAsRoot, 'Value of $$matchAsRoot must be an object').to.equal(
      'object'
    );

    resultCheck(actual, expected.$$matchAsRoot as any, entities, path, false);
  } else if (isLteOperator(expected)) {
    expect(typeof actual).to.equal('number');
    expect(actual).to.be.lte(expected.$$lte);
  } else {
    expect.fail(`Unknown special operator: ${JSON.stringify(expected)}`);
  }
}

// CMAP events where the payload does not matter.
const EMPTY_CMAP_EVENTS = {
  poolCreatedEvent: ConnectionPoolCreatedEvent,
  poolReadyEvent: ConnectionPoolReadyEvent,
  poolClosedEvent: ConnectionPoolClosedEvent,
  connectionCreatedEvent: ConnectionCreatedEvent,
  connectionReadyEvent: ConnectionReadyEvent,
  connectionCheckOutStartedEvent: ConnectionCheckOutStartedEvent,
  connectionCheckOutFailedEvent: ConnectionCheckOutFailedEvent,
  connectionCheckedOutEvent: ConnectionCheckedOutEvent,
  connectionCheckedInEvent: ConnectionCheckedInEvent
};

function validEmptyCmapEvent(expected: ExpectedCommandEvent | ExpectedCmapEvent) {
  const expectedEventName = Object.keys(expected)[0];
  return !!EMPTY_CMAP_EVENTS[expectedEventName];
}

function failOnMismatchedCount(
  actual: CommandEvent[] | CmapEvent[] | SdamEvent[],
  expected: (ExpectedCommandEvent & ExpectedCmapEvent & ExpectedSdamEvent)[]
) {
  const actualNames = actual.map(a => a.constructor.name);
  const expectedNames = expected.map(e => Object.keys(e)[0]);
  expect.fail(
    `Expected event count mismatch, expected ${inspect(expectedNames)} but got ${inspect(
      actualNames
    )}`
  );
}

function compareCommandStartedEvents(
  actual: CommandStartedEvent,
  expected: ExpectedCommandEvent['commandStartedEvent'],
  entities: EntitiesMap,
  prefix: string
) {
  if (expected!.command) {
    resultCheck(actual.command, expected!.command, entities, [`${prefix}.command`]);
  }
  if (expected!.commandName) {
    expect(
      expected!.commandName,
      `expected ${prefix}.commandName to equal ${expected!.commandName} but received ${
        actual.commandName
      }`
    ).to.equal(actual.commandName);
  }
  if (expected!.databaseName) {
    expect(
      expected!.databaseName,
      `expected ${prefix}.databaseName to equal ${expected!.databaseName} but received ${
        actual.databaseName
      }`
    ).to.equal(actual.databaseName);
  }
}

function compareCommandSucceededEvents(
  actual: CommandSucceededEvent,
  expected: ExpectedCommandEvent['commandSucceededEvent'],
  entities: EntitiesMap,
  prefix: string
) {
  if (expected!.reply) {
    resultCheck(actual.reply as Document, expected!.reply, entities, [prefix]);
  }
  if (expected!.commandName) {
    expect(
      expected!.commandName,
      `expected ${prefix}.commandName to equal ${expected!.commandName} but received ${
        actual.commandName
      }`
    ).to.equal(actual.commandName);
  }
}

function compareCommandFailedEvents(
  actual: CommandFailedEvent,
  expected: ExpectedCommandEvent['commandFailedEvent'],
  entities: EntitiesMap,
  prefix: string
) {
  if (expected!.commandName) {
    expect(
      expected!.commandName,
      `expected ${prefix}.commandName to equal ${expected!.commandName} but received ${
        actual.commandName
      }`
    ).to.equal(actual.commandName);
  }
}

function expectInstanceOf<T extends new (...args: any[]) => any>(
  instance: any,
  ctor: T
): asserts instance is InstanceType<T> {
  expect(instance).to.be.instanceOf(ctor);
}

function compareEvents(
  actual: CommandEvent[] | CmapEvent[] | SdamEvent[],
  expected: (ExpectedCommandEvent & ExpectedCmapEvent & ExpectedSdamEvent)[],
  entities: EntitiesMap
) {
  if (actual.length !== expected.length) {
    failOnMismatchedCount(actual, expected);
  }
  for (const [index, actualEvent] of actual.entries()) {
    const expectedEvent = expected[index];
    const rootPrefix = `events[${index}]`;

    if (expectedEvent.commandStartedEvent) {
      const path = `${rootPrefix}.commandStartedEvent`;
      expectInstanceOf(actualEvent, CommandStartedEvent);
      compareCommandStartedEvents(actualEvent, expectedEvent.commandStartedEvent, entities, path);
      if (expectedEvent.commandStartedEvent.hasServerConnectionId) {
        expect(actualEvent).property('serverConnectionId').to.be.a('bigint');
      } else if (expectedEvent.commandStartedEvent.hasServerConnectionId === false) {
        expect(actualEvent).property('serverConnectionId').to.be.null;
      }
    } else if (expectedEvent.commandSucceededEvent) {
      const path = `${rootPrefix}.commandSucceededEvent`;
      expectInstanceOf(actualEvent, CommandSucceededEvent);
      compareCommandSucceededEvents(
        actualEvent,
        expectedEvent.commandSucceededEvent,
        entities,
        path
      );
      if (expectedEvent.commandSucceededEvent.hasServerConnectionId) {
        expect(actualEvent).property('serverConnectionId').to.be.a('bigint');
      } else if (expectedEvent.commandSucceededEvent.hasServerConnectionId === false) {
        expect(actualEvent).property('serverConnectionId').to.be.null;
      }
    } else if (expectedEvent.commandFailedEvent) {
      const path = `${rootPrefix}.commandFailedEvent`;
      expectInstanceOf(actualEvent, CommandFailedEvent);
      compareCommandFailedEvents(actualEvent, expectedEvent.commandFailedEvent, entities, path);
      if (expectedEvent.commandFailedEvent.hasServerConnectionId) {
        expect(actualEvent).property('serverConnectionId').to.be.a('bigint');
      } else if (expectedEvent.commandFailedEvent.hasServerConnectionId === false) {
        expect(actualEvent).property('serverConnectionId').to.be.null;
      }
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
      if (expectedEvent.poolClearedEvent.interruptInUseConnections != null) {
        expect(actualEvent)
          .property('interruptInUseConnections')
          .to.equal(expectedEvent.poolClearedEvent.interruptInUseConnections);
      }
    } else if (validEmptyCmapEvent(expectedEvent as ExpectedCmapEvent)) {
      const expectedEventName = Object.keys(expectedEvent)[0];
      const expectedEventInstance = EMPTY_CMAP_EVENTS[expectedEventName];
      expect(actualEvent).to.be.instanceOf(expectedEventInstance);
    } else if (expectedEvent.serverDescriptionChangedEvent) {
      expect(actualEvent).to.be.instanceOf(ServerDescriptionChangedEvent);
      const expectedServerDescriptionKeys = ['previousDescription', 'newDescription'];
      expect(expectedServerDescriptionKeys).to.include.all.members(
        Object.keys(expectedEvent.serverDescriptionChangedEvent)
      );
      for (const descriptionKey of expectedServerDescriptionKeys) {
        expect(actualEvent).to.have.property(descriptionKey);
        const expectedDescription =
          expectedEvent.serverDescriptionChangedEvent[descriptionKey] ?? {};
        for (const nestedKey of Object.keys(expectedDescription)) {
          expect(actualEvent[descriptionKey]).to.have.property(
            nestedKey,
            expectedDescription[nestedKey]
          );
        }
      }
    } else if (expectedEvent.serverHeartbeatStartedEvent) {
      expect(actualEvent).to.be.instanceOf(ServerHeartbeatStartedEvent);
      const expectedSdamEvent = expectedEvent.serverHeartbeatStartedEvent;
      for (const property of Object.keys(expectedSdamEvent)) {
        expect(actualEvent[property]).to.equal(expectedSdamEvent[property]);
      }
    } else if (expectedEvent.serverHeartbeatFailedEvent) {
      expect(actualEvent).to.be.instanceOf(ServerHeartbeatFailedEvent);
      const expectedSdamEvent = expectedEvent.serverHeartbeatFailedEvent;
      for (const property of Object.keys(expectedSdamEvent)) {
        expect(actualEvent[property]).to.equal(expectedSdamEvent[property]);
      }
    } else if (expectedEvent.serverHeartbeatSucceededEvent) {
      expect(actualEvent).to.be.instanceOf(ServerHeartbeatSucceededEvent);
      const expectedSdamEvent = expectedEvent.serverHeartbeatSucceededEvent;
      for (const property of Object.keys(expectedSdamEvent)) {
        expect(actualEvent[property]).to.equal(expectedSdamEvent[property]);
      }
    } else if (expectedEvent.serverOpeningEvent) {
      expect(actualEvent).to.be.instanceOf(ServerOpeningEvent);
      const expectedSdamEvent = expectedEvent.serverOpeningEvent;
      for (const property of Object.keys(expectedSdamEvent)) {
        expect(actualEvent[property]).to.equal(expectedSdamEvent[property]);
      }
    } else if (expectedEvent.serverClosedEvent) {
      expect(actualEvent).to.be.instanceOf(ServerClosedEvent);
      const expectedSdamEvent = expectedEvent.serverClosedEvent;
      for (const property of Object.keys(expectedSdamEvent)) {
        expect(actualEvent[property]).to.equal(expectedSdamEvent[property]);
      }
    } else if (expectedEvent.topologyOpeningEvent) {
      expect(actualEvent).to.be.instanceOf(TopologyOpeningEvent);
      const expectedSdamEvent = expectedEvent.topologyOpeningEvent;
      for (const property of Object.keys(expectedSdamEvent)) {
        expect(actualEvent[property]).to.equal(expectedSdamEvent[property]);
      }
    } else if (expectedEvent.topologyClosedEvent) {
      expect(actualEvent).to.be.instanceOf(TopologyClosedEvent);
      const expectedSdamEvent = expectedEvent.topologyClosedEvent;
      for (const property of Object.keys(expectedSdamEvent)) {
        expect(actualEvent[property]).to.equal(expectedSdamEvent[property]);
      }
    } else if (expectedEvent.topologyDescriptionChangedEvent) {
      expect(actualEvent).to.be.instanceOf(TopologyDescriptionChangedEvent);

      const actualTopChangedEvent = actualEvent as TopologyDescriptionChangedEvent;
      const expectedSdamEvent = expectedEvent.topologyDescriptionChangedEvent;

      if (expectedSdamEvent.previousDescription?.type) {
        expect(actualTopChangedEvent.previousDescription.type).to.equal(
          expectedSdamEvent.previousDescription.type
        );
      }

      if (expectedSdamEvent.newDescription?.type) {
        expect(actualTopChangedEvent.newDescription.type).to.equal(
          expectedSdamEvent.newDescription.type
        );
      }
    } else {
      expect.fail(`Encountered unexpected event - ${inspect(actualEvent)}`);
    }
  }
}

export function matchesEvents(
  { events: expected, ignoreExtraEvents }: ExpectedEventsForClient,
  actual: CommandEvent[] | CmapEvent[] | SdamEvent[],
  entities: EntitiesMap
): void {
  ignoreExtraEvents = ignoreExtraEvents ?? false;

  if (ignoreExtraEvents) {
    if (actual.length < expected.length) {
      failOnMismatchedCount(actual, expected);
    }

    const slicedActualEvents = actual.slice(0, expected.length);

    compareEvents(slicedActualEvents, expected, entities);
  } else {
    if (actual.length !== expected.length) {
      failOnMismatchedCount(actual, expected);
    }

    compareEvents(actual, expected, entities);
  }
}

export function filterIgnoredMessages(
  logsToIgnore: ExpectedLogMessage[],
  actual: ExpectedLogMessage[],
  entities: EntitiesMap
): ExpectedLogMessage[] {
  function isLogRelevant(log: ExpectedLogMessage) {
    for (const logToIgnore of logsToIgnore) {
      try {
        // see if log matches a log to ignore, it is not relevant
        resultCheck(log.data, logToIgnore.data, entities, undefined, false);
        return false;
      } catch {
        continue;
      }
    }
    // if log does not match any logs to ignore, it is relevant
    return true;
  }
  const filteredMessages: ExpectedLogMessage[] = actual.filter(isLogRelevant);
  return filteredMessages;
}

export function compareLogs(
  expected: ExpectedLogMessage[],
  actual: ExpectedLogMessage[],
  entities: EntitiesMap,
  ignoreExtraMessages = false
): void {
  if (!ignoreExtraMessages) {
    expect(actual).to.have.lengthOf(expected.length);
  }

  for (const [index, actualLog] of actual.entries()) {
    if (index >= expected.length && ignoreExtraMessages) return;

    const rootPrefix = `expectLogMessages[${index}]`;
    const expectedLog = expected[index];

    // Check that log levels match
    expect(actualLog).to.have.property('level', expectedLog.level);

    // Check that components match
    expect(actualLog).to.have.property('component', expectedLog.component);

    // NOTE: The spec states that if the failureIsRedacted flag is present, we
    // must assert that a failure occurred.
    if (expectedLog.failureIsRedacted !== undefined) {
      expect(expectedLog.failureIsRedacted).to.be.a('boolean');
      expect(actualLog.data.failure, 'Expected failure to exist').to.exist;
      if (expectedLog.failureIsRedacted) {
        // Assert that failure has been redacted
        expect(actualLog.data.failure, 'Expected failure to have been redacted').to.equal(
          '(redacted)'
        );
      } else {
        // Assert that failure has not been redacted
        expect(
          actualLog.data.failure,
          'Expected failure to have not been redacted'
        ).to.not.deep.equal({});
      }
    }

    resultCheck(actualLog.data, expectedLog.data, entities, [rootPrefix], false);
  }
}

function isMongoCryptError(err): boolean {
  if (err.constructor.name === 'MongoCryptError') {
    return true;
  }
  return err.stack.includes('at ClientEncryption');
}

export function expectErrorCheck(
  error: Error | MongoError,
  expected: ExpectedError,
  entities: EntitiesMap
): void {
  const expectMessage = `\n\nOriginal Error Stack:\n${error.stack}\n\n`;

  if (!isMongoCryptError(error)) {
    expect(error, expectMessage).to.be.instanceOf(MongoError);
  }

  if (expected.isClientError === false) {
    expect(error).to.be.instanceOf(MongoServerError);
  } else if (expected.isClientError === true) {
    if (error instanceof MongoBulkWriteError) {
      // TODO(NODE-6281): do not throw MongoServerErrors from bulk write if the error is a client-side error
      expect(error.errorResponse).not.to.be.instanceOf(MongoServerError);
    } else {
      expect(error).not.to.be.instanceOf(MongoServerError);
    }
  }

  if (expected.isTimeoutError === false) {
    expect(error).to.not.be.instanceof(MongoOperationTimeoutError);
  } else if (expected.isTimeoutError === true) {
    if ('errorResponse' in error) {
      expect(error.errorResponse).to.be.instanceof(MongoOperationTimeoutError);
    } else {
      expect(error).to.be.instanceof(MongoOperationTimeoutError);
    }
  }

  if (expected.errorContains != null) {
    expect(error.message.toLowerCase(), expectMessage.toLowerCase()).to.include(
      expected.errorContains.toLowerCase()
    );
  }

  if (expected.errorCode != null) {
    if (error instanceof MongoClientBulkWriteError) {
      expect(error.cause).to.have.property('code', expected.errorCode);
    } else {
      expect(error, expectMessage).to.have.property('code', expected.errorCode);
    }
  }

  if (expected.errorCodeName != null) {
    expect(error, expectMessage).to.have.property('codeName', expected.errorCodeName);
  }

  if (expected.errorLabelsContain != null) {
    let mongoError = error as MongoError;
    if (error instanceof MongoClientBulkWriteError) {
      mongoError = error.cause as MongoError;
    }
    for (const errorLabel of expected.errorLabelsContain) {
      expect(
        mongoError.hasErrorLabel(errorLabel),
        `Error was supposed to have label ${errorLabel}, has [${mongoError.errorLabels}] -- ${expectMessage}`
      ).to.be.true;
    }
  }

  if (expected.errorLabelsOmit != null) {
    const mongoError = error as MongoError;
    for (const errorLabel of expected.errorLabelsOmit) {
      expect(
        mongoError.hasErrorLabel(errorLabel),
        `Error was not supposed to have label ${errorLabel}, has [${mongoError.errorLabels}] -- ${expectMessage}`
      ).to.be.false;
    }
  }

  if (expected.expectResult != null) {
    if ('partialResult' in error) {
      resultCheck(error.partialResult, expected.expectResult as any, entities);
    } else {
      resultCheck(error, expected.expectResult as any, entities);
    }
  }

  if (expected.errorResponse != null) {
    if (error instanceof MongoClientBulkWriteError) {
      resultCheck(error.cause, expected.errorResponse, entities);
    } else {
      resultCheck(error, expected.errorResponse, entities);
    }
  }
}

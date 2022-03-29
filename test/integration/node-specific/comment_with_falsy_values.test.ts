import { Long } from '../../../src';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';
import * as uni from '../../tools/unified-spec-runner/schema';

const falsyValues = [0, false, '', Long.ZERO, null, NaN] as const;
const falsyToString = (value: typeof falsyValues[number]) => {
  if (Number.isNaN(value)) {
    return 'NaN';
  }

  if (value === '') {
    return "''";
  }

  if (value?._bsontype === 'Long') {
    return 'Long.ZERO';
  }

  return JSON.stringify(value);
};

function* generateTestCombinations() {
  for (const [name, args] of [
    ['find', { filter: { _id: 1 } }] as const,
    ['aggregate', { pipeline: [] }] as const,
    ['insertMany', { documents: [{ name: 'john' }] }] as const,
    ['deleteOne', { filter: { toBeDeleted: true } }] as const,
    ['findOneAndReplace', { filter: { _id: 1 }, replacement: { x: 12 } }] as const
  ]) {
    for (const falsyValue of falsyValues) {
      yield { name, args: { ...args, comment: falsyValue } };
    }
  }
}

const operations = Array.from(generateTestCombinations());

const unifiedTestBase: uni.UnifiedSuite = {
  description: 'comment',
  schemaVersion: '1.0',
  runOnRequirements: [{ minServerVersion: '4.4' }],
  createEntities: [
    {
      client: {
        id: 'client0',
        useMultipleMongoses: true,
        observeEvents: ['commandStartedEvent']
      }
    },
    {
      database: {
        id: 'database0',
        client: 'client0',
        databaseName: 'comment-falsy-values-tests'
      }
    },
    {
      collection: {
        id: 'collection0',
        database: 'database0',
        collectionName: 'coll0'
      }
    }
  ],
  initialData: [
    {
      collectionName: 'coll0',
      databaseName: 'comment-falsy-values-tests',
      documents: [
        { _id: 1, x: 11 },
        { _id: 2, toBeDeleted: true } // This should only be used by the delete test
      ]
    }
  ],
  tests: operations.map(({ name, args }) => ({
    description: `${name} should pass falsy value ${falsyToString(
      args.comment
    )} for comment option`,
    operations: [
      {
        name,
        object: 'collection0',
        arguments: args
      }
    ],
    expectEvents: [
      {
        client: 'client0',
        events: [
          {
            commandStartedEvent: {
              command: {
                comment: args.comment
              }
            }
          }
        ]
      }
    ]
  }))
};

describe('comment w/ falsy values ', () => {
  runUnifiedSuite([unifiedTestBase]);
});

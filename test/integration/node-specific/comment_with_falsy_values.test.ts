import { Long } from '../../../src';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';
import { TestBuilder, UnifiedTestSuiteBuilder } from '../../tools/utils';

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

const tests = Array.from(generateTestCombinations()).map(({ name, args }) => {
  const description = `${name} should pass falsy value ${falsyToString(
    args.comment
  )} for comment option`;
  return new TestBuilder(description)
    .operation({
      name,
      object: 'collection0',
      arguments: args
    })
    .expectEvents({
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
    })
    .toJSON();
});

const testSuite = new UnifiedTestSuiteBuilder('Comment with Falsy Values')
  .runOnRequirement({ minServerVersion: '4.4.0' })
  .initialData({
    collectionName: 'coll0',
    databaseName: '',
    documents: [
      { _id: 1, x: 11 },
      { _id: 2, toBeDeleted: true } // This should only be used by the delete test
    ]
  })
  .databaseName('comment-with-falsy-values')
  .test(tests)
  .toJSON();

const testsForChangeStreamsAggregate = falsyValues.map(falsyValue => {
  const description = `ChangeStreams should pass falsy value ${falsyToString(
    falsyValue
  )} for comment option on initial aggregate`;

  return new TestBuilder(description)
    .operation({
      name: 'createChangeStream',
      object: 'collection0',
      arguments: {
        pipeline: [],
        comment: falsyValue
      },
      saveResultAsEntity: 'changeStream0'
    })
    .expectEvents({
      client: 'client0',
      events: [
        {
          commandStartedEvent: {
            command: {
              comment: falsyValue
            }
          }
        }
      ]
    })
    .toJSON();
});

const testsForGetMore = falsyValues.map(falsyValue => {
  const description = `ChangeStreams should pass falsy value ${falsyToString(
    falsyValue
  )} for comment option on getMore`;

  return new TestBuilder(description)
    .runOnRequirement({ topologies: ['replicaset'] })
    .operation({
      name: 'createChangeStream',
      object: 'collection0',
      arguments: {
        pipeline: [],
        comment: falsyValue
      },
      saveResultAsEntity: 'changeStream0'
    })
    .operation({
      name: 'insertOne',
      object: 'collection0',
      arguments: {
        document: {
          a: 1
        }
      }
    })
    .operation({
      name: 'iterateUntilDocumentOrError',
      object: 'changeStream0',
      arguments: {}
    })
    .expectEvents({
      client: 'client0',
      events: [
        {
          commandStartedEvent: {
            command: {
              comment: falsyValue
            }
          }
        },
        {
          commandStartedEvent: {}
        },
        {
          commandStartedEvent: {
            command: {
              comment: falsyValue
            }
          }
        }
      ]
    })
    .toJSON();
});

const changeStreamTestSuite = new UnifiedTestSuiteBuilder(
  'Change Streams Comment with Falsy Values'
)
  .schemaVersion('1.0')
  .initialData({
    collectionName: 'coll0',
    databaseName: '',
    documents: []
  })
  .databaseName('change-streams-comment-with-falsy-values')
  .runOnRequirement({ minServerVersion: '4.4.0', topologies: ['replicaset', 'sharded-replicaset'] })
  .test(testsForChangeStreamsAggregate)
  .test(testsForGetMore)
  .toJSON();

describe('comment w/ falsy values ', () => {
  runUnifiedSuite([testSuite]);
  runUnifiedSuite([changeStreamTestSuite]);
});

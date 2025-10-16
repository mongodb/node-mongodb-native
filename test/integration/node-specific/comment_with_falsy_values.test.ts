import { expect } from 'chai';

import { type Collection, type CommandStartedEvent, Long, type MongoClient } from '../../../src';
import { TestBuilder, UnifiedTestSuiteBuilder } from '../../tools/unified_suite_builder';

const falsyValues = [0, false, '', Long.ZERO, null, NaN] as const;
const falsyToString = (value: (typeof falsyValues)[number]) => {
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
    ['findOneAndReplace', { filter: { _id: 1 }, replacement: { x: 12 } }] as const,
    ['estimatedDocumentCount', {}] as const
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

describe('Comment with falsy values', () => {
  UnifiedTestSuiteBuilder.describe('Comment with Falsy Values')
    .runOnRequirement({ minServerVersion: '4.4.0' })
    .createEntities(UnifiedTestSuiteBuilder.defaultEntities)
    .initialData({
      collectionName: 'collection0',
      databaseName: 'database0',
      documents: [
        { _id: 1, x: 11 },
        { _id: 2, toBeDeleted: true } // This should only be used by the delete test
      ]
    })
    .test(tests)
    .run();

  UnifiedTestSuiteBuilder.describe('Change Streams Comment with Falsy Values')
    .schemaVersion('1.0')
    .createEntities(UnifiedTestSuiteBuilder.defaultEntities)
    .initialData({
      collectionName: 'collection0',
      databaseName: 'database0',
      documents: []
    })
    .runOnRequirement({
      minServerVersion: '4.4.0',
      topologies: ['replicaset', 'sharded-replicaset']
    })
    .test(testsForChangeStreamsAggregate)
    .test(testsForGetMore)
    .run();

  context('Collection.distinct()', function () {
    let client: MongoClient;
    let collection: Collection;
    let commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({ monitorCommands: true });
      client.on('commandStarted', e => commands.push(e));
      await client.connect();
      collection = await client.db('comment-falsy-values').createCollection('collection');
      commands = [];
    });

    afterEach(async function () {
      await collection.drop();
      await client.close();
    });

    for (const falsyValue of falsyValues) {
      it(`distinct should send falsy value ${falsyToString(
        falsyValue
      )} on the command`, async function () {
        await collection.distinct('some-key', {}, { comment: falsyValue }).catch(() => null);

        expect(commands).to.have.lengthOf(1);
        const distinctCommand = commands.find(command => command.commandName === 'distinct');
        expect(distinctCommand).to.exist;

        // chai does not narrow types, so TS doesn't know the distinct command exists at this point.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const command = distinctCommand!.command;

        expect(command).to.haveOwnProperty('comment');

        if (Number.isNaN(falsyValue)) {
          expect(command.comment).to.be.NaN;
        } else {
          expect(command.comment).to.equal(falsyValue);
        }
      });
    }
  });
});

import { type FailPoint, TestBuilder, UnifiedTestSuiteBuilder } from '../../tools/utils';

describe('Unified Test Runner', () => {
  UnifiedTestSuiteBuilder.describe('withTransaction error propagation')
    .runOnRequirement({ topologies: ['replicaset'], minServerVersion: '4.4.0' })
    .createEntities([
      {
        client: {
          id: 'client',
          useMultipleMongoses: true,
          uriOptions: { appName: 'bob' },
          observeEvents: ['commandStartedEvent', 'commandSucceededEvent', 'commandFailedEvent']
        }
      },
      { database: { id: 'database', client: 'client', databaseName: 'test' } },
      { collection: { id: 'collection', database: 'database', collectionName: 'coll' } },
      { session: { id: 'session', client: 'client' } },

      { client: { id: 'failPointClient', useMultipleMongoses: false } }
    ])
    .test(
      TestBuilder.it('should propagate the error to the withTransaction API')
        .operation({
          name: 'failPoint',
          object: 'testRunner',
          arguments: {
            client: 'failPointClient',
            failPoint: {
              configureFailPoint: 'failCommand',
              mode: { times: 1 },
              data: { failCommands: ['insert'], errorCode: 50, appName: 'bob' }
            } as FailPoint
          }
        })
        .operation({
          name: 'withTransaction',
          object: 'session',
          arguments: {
            callback: [
              {
                name: 'insertOne',
                object: 'collection',
                arguments: { session: 'session', document: { _id: 1 } },
                expectError: { isClientError: false }
              }
            ]
          },
          expectError: { isClientError: false }
        })
        .expectEvents({
          client: 'client',
          events: [
            {
              commandStartedEvent: {
                commandName: 'insert',
                databaseName: 'test',
                command: { insert: 'coll' }
              }
            },
            { commandFailedEvent: { commandName: 'insert' } },
            {
              commandStartedEvent: {
                commandName: 'abortTransaction',
                databaseName: 'admin',
                command: { abortTransaction: 1 }
              }
            },
            { commandFailedEvent: { commandName: 'abortTransaction' } }
          ]
        })
        .toJSON()
    )
    .run();
});

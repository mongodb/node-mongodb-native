import { expect } from 'chai';

import { Long } from '../../mongodb';
import * as mongodb from '../../mongodb';

describe('abstract operation', function () {
  describe('command name getter', function () {
    interface AbstractOperationSubclasses {
      subclassCreator: () => mongodb.AbstractOperation;
      subclassType: any;
      correctCommandName: string;
    }

    let client: mongodb.MongoClient;
    let db: mongodb.Db;
    let admin: mongodb.Admin;
    let collection: mongodb.Collection;

    const subclassArray: AbstractOperationSubclasses[] = [
      {
        subclassCreator: () =>
          new mongodb.AggregateOperation(collection.fullNamespace, [{ a: 1 }], {}),
        subclassType: mongodb.AggregateOperation,
        correctCommandName: 'aggregate'
      },
      {
        subclassCreator: () => new mongodb.CountOperation(collection.fullNamespace, { a: 1 }, {}),
        subclassType: mongodb.CountOperation,
        correctCommandName: 'count'
      },
      {
        subclassCreator: () => new mongodb.CreateCollectionOperation(db, 'name'),
        subclassType: mongodb.CreateCollectionOperation,
        correctCommandName: 'create'
      },
      {
        subclassCreator: () =>
          new mongodb.DeleteOperation(collection.fullNamespace, [{ q: { a: 1 }, limit: 1 }], {}),
        subclassType: mongodb.DeleteOperation,
        correctCommandName: 'delete'
      },
      {
        subclassCreator: () =>
          new mongodb.DeleteOneOperation(collection.fullNamespace, [{ q: { a: 1 }, limit: 1 }], {}),
        subclassType: mongodb.DeleteOneOperation,
        correctCommandName: 'delete'
      },
      {
        subclassCreator: () =>
          new mongodb.DeleteManyOperation(
            collection.fullNamespace,
            [{ q: { a: 1 }, limit: 1 }],
            {}
          ),
        subclassType: mongodb.DeleteManyOperation,
        correctCommandName: 'delete'
      },
      {
        subclassCreator: () => new mongodb.DistinctOperation(collection, 'a', { a: 1 }),
        subclassType: mongodb.DistinctOperation,
        correctCommandName: 'distinct'
      },
      {
        subclassCreator: () => new mongodb.DropCollectionOperation(db, 'collectionName', {}),
        subclassType: mongodb.DropCollectionOperation,
        correctCommandName: 'drop'
      },
      {
        subclassCreator: () => new mongodb.DropDatabaseOperation(db, {}),
        subclassType: mongodb.DropDatabaseOperation,
        correctCommandName: 'dropDatabase'
      },
      {
        subclassCreator: () => new mongodb.EstimatedDocumentCountOperation(collection, {}),
        subclassType: mongodb.EstimatedDocumentCountOperation,
        correctCommandName: 'count'
      },
      {
        subclassCreator: () => new mongodb.FindOperation(collection.fullNamespace),
        subclassType: mongodb.FindOperation,
        correctCommandName: 'find'
      },
      {
        subclassCreator: () => new mongodb.FindAndModifyOperation(collection, { a: 1 }, {}),
        subclassType: mongodb.FindAndModifyOperation,
        correctCommandName: 'findAndModify'
      },
      {
        subclassCreator: () => new mongodb.FindOneAndDeleteOperation(collection, { a: 1 }, {}),
        subclassType: mongodb.FindOneAndDeleteOperation,
        correctCommandName: 'findAndModify'
      },
      {
        subclassCreator: () =>
          new mongodb.FindOneAndReplaceOperation(collection, { a: 2 }, { a: 1 }, {}),
        subclassType: mongodb.FindOneAndReplaceOperation,
        correctCommandName: 'findAndModify'
      },
      {
        subclassCreator: () =>
          new mongodb.FindOneAndUpdateOperation(collection, { a: 2 }, { $a: 1 }, {}),
        subclassType: mongodb.FindOneAndUpdateOperation,
        correctCommandName: 'findAndModify'
      },
      {
        subclassCreator: () =>
          new mongodb.GetMoreOperation(
            collection.fullNamespace,
            Long.fromNumber(1),
            {} as any as mongodb.Server,
            {}
          ),
        subclassType: mongodb.GetMoreOperation,
        correctCommandName: 'getMore'
      },
      {
        subclassCreator: () =>
          mongodb.CreateIndexesOperation.fromIndexDescriptionArray(db, 'bar', [{ key: { a: 1 } }]),
        subclassType: mongodb.CreateIndexesOperation,
        correctCommandName: 'createIndexes'
      },
      {
        subclassCreator: () => new mongodb.DropIndexOperation(collection, 'a', {}),
        subclassType: mongodb.DropIndexOperation,
        correctCommandName: 'dropIndexes'
      },
      {
        subclassCreator: () => new mongodb.ListIndexesOperation(collection, {}),
        subclassType: mongodb.ListIndexesOperation,
        correctCommandName: 'listIndexes'
      },
      {
        subclassCreator: () =>
          new mongodb.InsertOperation(collection.fullNamespace, [{ a: 1 }], {}),
        subclassType: mongodb.InsertOperation,
        correctCommandName: 'insert'
      },
      {
        subclassCreator: () => new mongodb.InsertOneOperation(collection, { a: 1 }, {}),
        subclassType: mongodb.InsertOneOperation,
        correctCommandName: 'insert'
      },
      {
        subclassCreator: () =>
          new mongodb.KillCursorsOperation(
            Long.fromNumber(1),
            collection.fullNamespace,
            {} as any as mongodb.Server,
            {}
          ),
        subclassType: mongodb.KillCursorsOperation,
        correctCommandName: 'killCursors'
      },
      {
        subclassCreator: () => new mongodb.ListCollectionsOperation(db, { a: 1 }, {}),
        subclassType: mongodb.ListCollectionsOperation,
        correctCommandName: 'listCollections'
      },
      {
        subclassCreator: () => new mongodb.ListDatabasesOperation(db, {}),
        subclassType: mongodb.ListDatabasesOperation,
        correctCommandName: 'listDatabases'
      },
      {
        subclassCreator: () => new mongodb.ProfilingLevelOperation(db, {}),
        subclassType: mongodb.ProfilingLevelOperation,
        correctCommandName: 'profile'
      },
      {
        subclassCreator: () => new mongodb.RemoveUserOperation(db, 'userToDrop', {}),
        subclassType: mongodb.RemoveUserOperation,
        correctCommandName: 'dropUser'
      },
      {
        subclassCreator: () => new mongodb.RenameOperation(collection, 'newName', {}),
        subclassType: mongodb.RenameOperation,
        correctCommandName: 'renameCollection'
      },
      {
        subclassCreator: () =>
          new mongodb.RunCommandOperation(
            new mongodb.MongoDBNamespace('foo', 'bar'),
            { dummyCommand: 'dummyCommand' },
            {}
          ),
        subclassType: mongodb.RunCommandOperation,
        correctCommandName: 'runCommand'
      },
      {
        subclassCreator: () =>
          new mongodb.CreateSearchIndexesOperation(collection, [{ definition: { a: 1 } }]),
        subclassType: mongodb.CreateSearchIndexesOperation,
        correctCommandName: 'createSearchIndexes'
      },
      {
        subclassCreator: () => new mongodb.DropSearchIndexOperation(collection, 'dummyName'),
        subclassType: mongodb.DropSearchIndexOperation,
        correctCommandName: 'dropSearchIndex'
      },
      {
        subclassCreator: () =>
          new mongodb.UpdateSearchIndexOperation(collection, 'dummyName', {
            a: 1
          }),
        subclassType: mongodb.UpdateSearchIndexOperation,
        correctCommandName: 'updateSearchIndex'
      },
      {
        subclassCreator: () => new mongodb.SetProfilingLevelOperation(db, 'all', {}),
        subclassType: mongodb.SetProfilingLevelOperation,
        correctCommandName: 'profile'
      },
      {
        subclassCreator: () => new mongodb.DbStatsOperation(db, {}),
        subclassType: mongodb.DbStatsOperation,
        correctCommandName: 'dbStats'
      },
      {
        subclassCreator: () =>
          new mongodb.UpdateOperation(
            collection.fullNamespace,
            [{ q: { a: 1 }, u: { $a: 2 } }],
            {}
          ),
        subclassType: mongodb.UpdateOperation,
        correctCommandName: 'update'
      },
      {
        subclassCreator: () =>
          new mongodb.UpdateOneOperation(collection.fullNamespace, { a: 1 }, { $a: 2 }, {}),
        subclassType: mongodb.UpdateOneOperation,
        correctCommandName: 'update'
      },
      {
        subclassCreator: () =>
          new mongodb.UpdateManyOperation(collection.fullNamespace, { a: 1 }, { $a: 2 }, {}),
        subclassType: mongodb.UpdateManyOperation,
        correctCommandName: 'update'
      },
      {
        subclassCreator: () =>
          new mongodb.ReplaceOneOperation(collection.fullNamespace, { a: 1 }, { b: 1 }, {}),
        subclassType: mongodb.ReplaceOneOperation,
        correctCommandName: 'update'
      },
      {
        subclassCreator: () => new mongodb.ValidateCollectionOperation(admin, 'bar', {}),
        subclassType: mongodb.ValidateCollectionOperation,
        correctCommandName: 'validate'
      }
    ];

    beforeEach(async function () {
      client = this.configuration.newClient();
      db = client.db('foo');
      admin = client.db().admin();
      collection = db.collection('bar');
      await client.connect();
    });

    afterEach(async function () {
      await client.close();
    });

    for (const { subclassCreator, subclassType, correctCommandName } of subclassArray) {
      context(`when subclass is ${subclassType.name}`, function () {
        it(`operation.commandName equals correct string`, async function () {
          const subclassInstance = subclassCreator();
          expect(subclassInstance.commandName).to.equal(correctCommandName);
        });

        if (subclassType !== mongodb.RunCommandOperation) {
          it(
            `operation.commandName is a key in the command document`,
            {
              requires: { topology: 'single' }
            },
            async function () {
              const session = client.startSession();
              const pool = Array.from(client.topology.s.servers.values())[0].pool;
              const timeoutContext = mongodb.TimeoutContext.create({
                waitQueueTimeoutMS: 1000,
                serverSelectionTimeoutMS: 1000
              });
              const connection = await pool.checkOut({
                timeoutContext
              });

              try {
                const command = subclassCreator().buildCommand(connection, session);
                expect(command).to.have.property(subclassCreator().commandName);
              } finally {
                pool.checkIn(connection);
              }
            }
          );
        }
      });
    }
  });
});

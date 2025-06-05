import { expect } from 'chai';
import * as sinon from 'sinon';

import { executeOperation, Long, Server } from '../../mongodb';
import * as mongodb from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

describe('abstract operation', function () {
  describe('command name getter', function () {
    interface AbstractOperationSubclasses {
      subclassCreator: () => mongodb.AbstractOperation;
      subclassType: any;
      correctCommandName: string;
    }

    const WrapperSubclasses = [
      'RunAdminCommandOperation',
      'RunCommandOperation',
      'OptionsOperation',
      'IsCappedOperation',
      'BulkWriteOperation',
      'IndexOperation',
      'CollectionsOperation'
    ];

    const sameServerOnlyOperationSubclasses = ['GetMoreOperation', 'KillCursorsOperation'];

    let client;
    let db;
    let admin;
    let collection;
    let constructorServer;
    const subclassArray: AbstractOperationSubclasses[] = [
      {
        subclassCreator: () =>
          new mongodb.AggregateOperation(collection.fullNamespace, [{ a: 1 }], {}),
        subclassType: mongodb.AggregateOperation,
        correctCommandName: 'aggregate'
      },
      {
        subclassCreator: () =>
          new mongodb.BulkWriteOperation(collection, [{ insertOne: { document: { a: 1 } } }], {}),
        subclassType: mongodb.BulkWriteOperation,
        correctCommandName: 'bulkWrite'
      },
      {
        subclassCreator: () => new mongodb.CollectionsOperation(db, {}),
        subclassType: mongodb.CollectionsOperation,
        correctCommandName: 'listCollections'
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
          new mongodb.DeleteOneOperation(collection, [{ q: { a: 1 }, limit: 1 }], {}),
        subclassType: mongodb.DeleteOneOperation,
        correctCommandName: 'delete'
      },
      {
        subclassCreator: () =>
          new mongodb.DeleteManyOperation(collection, [{ q: { a: 1 }, limit: 1 }], {}),
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
            constructorServer,
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
        subclassCreator: () => new mongodb.InsertManyOperation(collection, [{ a: 1 }], {}),
        subclassType: mongodb.InsertManyOperation,
        correctCommandName: 'insert'
      },
      {
        subclassCreator: () => new mongodb.IsCappedOperation(collection, {}),
        subclassType: mongodb.IsCappedOperation,
        correctCommandName: 'listCollections'
      },
      {
        subclassCreator: () =>
          new mongodb.KillCursorsOperation(
            Long.fromNumber(1),
            collection.fullNamespace,
            constructorServer,
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
        subclassCreator: () => new mongodb.OptionsOperation(collection, {}),
        subclassType: mongodb.OptionsOperation,
        correctCommandName: 'listCollections'
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
          new mongodb.RunCommandOperation(db, { dummyCommand: 'dummyCommand' }, {}),
        subclassType: mongodb.RunCommandOperation,
        correctCommandName: 'runCommand'
      },
      {
        subclassCreator: () =>
          new mongodb.RunAdminCommandOperation({ dummyCommand: 'dummyCommand' }, {}),
        subclassType: mongodb.RunAdminCommandOperation,
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
        subclassCreator: () => new mongodb.UpdateOneOperation(collection, { a: 1 }, { $a: 2 }, {}),
        subclassType: mongodb.UpdateOneOperation,
        correctCommandName: 'update'
      },
      {
        subclassCreator: () => new mongodb.UpdateManyOperation(collection, { a: 1 }, { $a: 2 }, {}),
        subclassType: mongodb.UpdateManyOperation,
        correctCommandName: 'update'
      },
      {
        subclassCreator: () => new mongodb.ReplaceOneOperation(collection, { a: 1 }, { b: 1 }, {}),
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
      constructorServer = new Server(
        topologyWithPlaceholderClient([], {} as any),
        new mongodb.ServerDescription('a:1'),
        {} as any
      );
    });

    afterEach(async function () {
      db = undefined;
      collection = undefined;
      constructorServer = undefined;
      admin = undefined;
      await client.close();
      sinon.restore();
    });

    for (const { subclassCreator, subclassType, correctCommandName } of subclassArray) {
      context(`when subclass is ${subclassType.name}`, function () {
        it(`operation.commandName equals correct string`, async function () {
          const subclassInstance = subclassCreator();
          expect(subclassInstance.commandName).to.equal(correctCommandName);
        });

        if (!WrapperSubclasses.includes(subclassType.name.toString())) {
          it(`operation.commandName equals key in command document`, async function () {
            const subclassInstance = subclassCreator();
            const yieldDoc =
              subclassType.name === 'ProfilingLevelOperation' ? { ok: 1, was: 1 } : { ok: 1 };
            const cmdCallerStub = sinon.stub(Server.prototype, 'command').resolves(yieldDoc);
            if (sameServerOnlyOperationSubclasses.includes(subclassType.name.toString())) {
              await subclassInstance.execute(constructorServer, client.session);
            } else {
              await executeOperation(client, subclassInstance);
            }
            expect(cmdCallerStub).to.have.been.calledWith(
              sinon.match.any,
              sinon.match.hasOwn(subclassInstance.commandName)
            );
          });
        }
      });
    }
  });
});

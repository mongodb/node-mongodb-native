import { expect } from 'chai';
import * as sinon from 'sinon';

import { executeOperation, Long, Server, Topology } from '../../mongodb';
import * as mongodb from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

describe('abstract operation', async function () {
  describe('command name getter', async function () {
    interface AbstractOperationSubclasses {
      subclassCreator: () => mongodb.AbstractOperation;
      subclassType: any;
    }

    const serverlessOperationSubclasses = [
      'RunAdminCommandOperation',
      'RunCommandOperation',
      'OptionsOperation',
      'IsCappedOperation',
      'BulkWriteOperation',
      'IndexExistsOperation',
      'IndexOperation',
      'CollectionsOperation',
      'IndexInformationOperation'
    ];

    const sameServerOnlyOperationSubclases = ['GetMoreOperation', 'KillCursorsOperation'];

    let client;
    let db;
    let admin;
    let collection;
    let constructorServer;
    const subclassArray: AbstractOperationSubclasses[] = [
      {
        subclassCreator: () =>
          new mongodb.AggregateOperation(collection.fullNamespace, [{ a: 1 }], {}),
        subclassType: mongodb.AggregateOperation
      },
      {
        subclassCreator: () =>
          new mongodb.BulkWriteOperation(collection, [{ insertOne: { document: { a: 1 } } }], {}),
        subclassType: mongodb.BulkWriteOperation
      },
      {
        subclassCreator: () => new mongodb.CollectionsOperation(db, {}),
        subclassType: mongodb.CollectionsOperation
      },
      {
        subclassCreator: () => new mongodb.CountOperation(collection.fullNamespace, { a: 1 }, {}),
        subclassType: mongodb.CountOperation
      },
      {
        subclassCreator: () => new mongodb.CountDocumentsOperation(collection, { a: 1 }, {}),
        subclassType: mongodb.CountDocumentsOperation
      },
      {
        subclassCreator: () => new mongodb.CreateCollectionOperation(db, 'name'),
        subclassType: mongodb.CreateCollectionOperation
      },
      {
        subclassCreator: () =>
          new mongodb.DeleteOperation(collection.fullNamespace, [{ q: { a: 1 }, limit: 1 }], {}),
        subclassType: mongodb.DeleteOperation
      },
      {
        subclassCreator: () =>
          new mongodb.DeleteOneOperation(collection, [{ q: { a: 1 }, limit: 1 }], {}),
        subclassType: mongodb.DeleteOneOperation
      },
      {
        subclassCreator: () =>
          new mongodb.DeleteManyOperation(collection, [{ q: { a: 1 }, limit: 1 }], {}),
        subclassType: mongodb.DeleteManyOperation
      },
      {
        subclassCreator: () => new mongodb.DistinctOperation(collection, 'a', { a: 1 }),
        subclassType: mongodb.DistinctOperation
      },
      {
        subclassCreator: () => new mongodb.DropCollectionOperation(db, 'collectionName', {}),
        subclassType: mongodb.DropCollectionOperation
      },
      {
        subclassCreator: () => new mongodb.DropDatabaseOperation(db, {}),
        subclassType: mongodb.DropDatabaseOperation
      },
      {
        subclassCreator: () => new mongodb.EstimatedDocumentCountOperation(collection, {}),
        subclassType: mongodb.EstimatedDocumentCountOperation
      },
      {
        subclassCreator: () => new mongodb.FindOperation(collection, collection.fullNamespace),
        subclassType: mongodb.FindOperation
      },
      {
        subclassCreator: () => new mongodb.FindAndModifyOperation(collection, { a: 1 }, {}),
        subclassType: mongodb.FindAndModifyOperation
      },
      {
        subclassCreator: () => new mongodb.FindOneAndDeleteOperation(collection, { a: 1 }, {}),
        subclassType: mongodb.FindOneAndDeleteOperation
      },
      {
        subclassCreator: () =>
          new mongodb.FindOneAndReplaceOperation(collection, { a: 2 }, { a: 1 }, {}),
        subclassType: mongodb.FindOneAndReplaceOperation
      },
      {
        subclassCreator: () =>
          new mongodb.FindOneAndUpdateOperation(collection, { a: 2 }, { $a: 1 }, {}),
        subclassType: mongodb.FindOneAndUpdateOperation
      },
      {
        subclassCreator: () =>
          new mongodb.GetMoreOperation(
            collection.fullNamespace,
            Object.freeze(Long.fromNumber(1)),
            constructorServer,
            {}
          ),
        subclassType: mongodb.GetMoreOperation
      },
      {
        subclassCreator: () => new mongodb.IndexesOperation(collection, {}),
        subclassType: mongodb.IndexesOperation
      },
      {
        subclassCreator: () => new mongodb.CreateIndexesOperation(db, 'bar', [{ key: { a: 1 } }]),
        subclassType: mongodb.CreateIndexesOperation
      },
      {
        subclassCreator: () =>
          new mongodb.CreateIndexOperation(db, 'collectionName', 'indexDescription'),
        subclassType: mongodb.CreateIndexOperation
      },
      {
        subclassCreator: () =>
          new mongodb.EnsureIndexOperation(db, 'collectionName', 'indexDescription'),
        subclassType: mongodb.EnsureIndexOperation
      },
      {
        subclassCreator: () => new mongodb.DropIndexOperation(collection, 'a', {}),
        subclassType: mongodb.DropIndexOperation
      },
      {
        subclassCreator: () => new mongodb.ListIndexesOperation(collection, {}),
        subclassType: mongodb.ListIndexesOperation
      },
      {
        subclassCreator: () => new mongodb.IndexExistsOperation(collection, 'a', {}),
        subclassType: mongodb.IndexExistsOperation
      },
      {
        subclassCreator: () => new mongodb.IndexInformationOperation(db, 'a', {}),
        subclassType: mongodb.IndexInformationOperation
      },
      {
        subclassCreator: () =>
          new mongodb.InsertOperation(collection.fullNamespace, [{ a: 1 }], {}),
        subclassType: mongodb.InsertOperation
      },
      {
        subclassCreator: () => new mongodb.InsertOneOperation(collection, { a: 1 }, {}),
        subclassType: mongodb.InsertOneOperation
      },
      {
        subclassCreator: () => new mongodb.InsertManyOperation(collection, [{ a: 1 }], {}),
        subclassType: mongodb.InsertManyOperation
      },
      {
        subclassCreator: () => new mongodb.IsCappedOperation(collection, {}),
        subclassType: mongodb.IsCappedOperation
      },
      {
        subclassCreator: () =>
          new mongodb.KillCursorsOperation(
            Object.freeze(Long.fromNumber(1)),
            collection.fullNamespace,
            constructorServer,
            {}
          ),
        subclassType: mongodb.KillCursorsOperation
      },
      {
        subclassCreator: () => new mongodb.ListCollectionsOperation(db, { a: 1 }, {}),
        subclassType: mongodb.ListCollectionsOperation
      },
      {
        subclassCreator: () => new mongodb.ListDatabasesOperation(db, {}),
        subclassType: mongodb.ListDatabasesOperation
      },
      {
        subclassCreator: () => new mongodb.OptionsOperation(collection, {}),
        subclassType: mongodb.OptionsOperation
      },
      {
        subclassCreator: () => new mongodb.ProfilingLevelOperation(db, {}),
        subclassType: mongodb.ProfilingLevelOperation
      },
      {
        subclassCreator: () => new mongodb.RemoveUserOperation(db, 'userToDrop', {}),
        subclassType: mongodb.RemoveUserOperation
      },
      {
        subclassCreator: () => new mongodb.RenameOperation(collection, 'newName', {}),
        subclassType: mongodb.RenameOperation
      },
      {
        subclassCreator: () =>
          new mongodb.RunCommandOperation(db, { dummyCommand: 'dummyCommand' }, {}),
        subclassType: mongodb.RunCommandOperation
      },
      {
        subclassCreator: () =>
          new mongodb.RunAdminCommandOperation({ dummyCommand: 'dummyCommand' }, {}),
        subclassType: mongodb.RunAdminCommandOperation
      },
      {
        subclassCreator: () =>
          new mongodb.CreateSearchIndexesOperation(collection, [{ definition: { a: 1 } }]),
        subclassType: mongodb.CreateSearchIndexesOperation
      },
      {
        subclassCreator: () => new mongodb.DropSearchIndexOperation(collection, 'dummyName'),
        subclassType: mongodb.DropSearchIndexOperation
      },
      {
        subclassCreator: () =>
          new mongodb.UpdateSearchIndexOperation(collection, 'dummyName', {
            a: 1
          }),
        subclassType: mongodb.UpdateSearchIndexOperation
      },
      {
        subclassCreator: () => new mongodb.SetProfilingLevelOperation(db, 'all', {}),
        subclassType: mongodb.SetProfilingLevelOperation
      },
      {
        subclassCreator: () => new mongodb.DbStatsOperation(db, {}),
        subclassType: mongodb.DbStatsOperation
      },
      {
        subclassCreator: () =>
          new mongodb.UpdateOperation(
            collection.fullNamespace,
            [{ q: { a: 1 }, u: { $a: 2 } }],
            {}
          ),
        subclassType: mongodb.UpdateOperation
      },
      {
        subclassCreator: () => new mongodb.UpdateOneOperation(collection, { a: 1 }, { $a: 2 }, {}),
        subclassType: mongodb.UpdateOneOperation
      },
      {
        subclassCreator: () => new mongodb.UpdateManyOperation(collection, { a: 1 }, { $a: 2 }, {}),
        subclassType: mongodb.UpdateManyOperation
      },
      {
        subclassCreator: () => new mongodb.ReplaceOneOperation(collection, { a: 1 }, { b: 1 }, {}),
        subclassType: mongodb.ReplaceOneOperation
      },
      {
        subclassCreator: () => new mongodb.ValidateCollectionOperation(admin, 'bar', {}),
        subclassType: mongodb.ValidateCollectionOperation
      }
    ];

    beforeEach(async function () {
      client = new mongodb.MongoClient('mongodb://localhost:27017');
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

    for (const { subclassCreator, subclassType } of subclassArray) {
      context(`when subclass is ${subclassType.name}`, async function () {
        it(`subclass prototype's commandName should equal operation.commandName`, async function () {
          const subclassInstance = subclassCreator();
          const prototypeCommandName = Object.getOwnPropertyDescriptor(
            subclassType.prototype,
            'commandName'
          )?.get?.call(null);
          expect(prototypeCommandName).to.equal(subclassInstance.commandName);
        });

        if (!serverlessOperationSubclasses.includes(subclassType.name.toString())) {
          it(`operation.commandName equals key in command document`, async function () {
            const subclassInstance = subclassCreator();
            const yieldDoc =
              subclassType.name === 'ProfilingLevelOperation' ? { ok: 1, was: 1 } : { ok: 1 };
            const cmdCallerStub = sinon
              .stub(Server.prototype, 'command')
              .yieldsRight(undefined, yieldDoc);
            if (sameServerOnlyOperationSubclases.includes(subclassType.name.toString())) {
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

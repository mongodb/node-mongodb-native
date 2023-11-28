import { expect } from 'chai';
import * as sinon from 'sinon';

import { executeOperation, Long, Server } from '../../mongodb';
import * as mongodb from '../../mongodb';
import * as mock from '../../tools/mongodb-mock/index';

describe.only('AbstractOperation commmandName', async function () {
  let client;
  let db;
  let collection;
  let admin;
  let mockServer;
  interface AbstractOperationSubclasses {
    subclassOperation: mongodb.AbstractOperation; // v in mongodb && typeof v === 'function' && v.prototype instanceof AbstractOperation
    subclassType: any;
  }
  let commandNameArray: AbstractOperationSubclasses[] = [];

  before(async function () {
    client = this.configuration.newClient();
    db = client.db('foo');
    admin = client.db().admin();
    await db.createCollection('bar', {});
    collection = db.collection('bar');
    await mock.createServer();
    commandNameArray = [
      {
        subclassOperation: new mongodb.BulkWriteShimOperation(collection, {}),
        subclassType: mongodb.BulkWriteShimOperation
      },
      {
        subclassOperation: new mongodb.AggregateOperation(collection, {}),
        subclassType: mongodb.AggregateOperation
      },
      {
        subclassOperation: new mongodb.BulkWriteOperation(collection, {}),
        subclassType: mongodb.BulkWriteOperation
      },
      {
        subclassOperation: new mongodb.CollectionsOperation(collection, {}),
        subclassType: mongodb.CollectionsOperation
      },
      {
        subclassOperation: new mongodb.CommandOperation(collection, {}),
        subclassType: mongodb.CommandOperation
      },
      {
        subclassOperation: new mongodb.CountOperation(collection, {}),
        subclassType: mongodb.CountOperation
      },
      {
        subclassOperation: new mongodb.CountDocumentsOperation(collection, {}),
        subclassType: mongodb.CountDocumentsOperation
      },
      {
        subclassOperation: new mongodb.CreateCollectionOperation(collection, {}),
        subclassType: mongodb.CreateCollectionOperation
      },
      {
        subclassOperation: new mongodb.DeleteOperation(collection, {}),
        subclassType: mongodb.DeleteOperation
      },
      {
        subclassOperation: new mongodb.DeleteOneOperation(collection, {}),
        subclassType: mongodb.DeleteOneOperation
      },
      {
        subclassOperation: new mongodb.DeleteManyOperation(collection, {}),
        subclassType: mongodb.DeleteManyOperation
      },
      {
        subclassOperation: new mongodb.DistinctOperation(collection, {}),
        subclassType: mongodb.DistinctOperation
      },
      {
        subclassOperation: new mongodb.DropCollectionOperation(collection, {}),
        subclassType: mongodb.DropCollectionOperation
      },
      {
        subclassOperation: new mongodb.DropDatabaseOperation(collection, {}),
        subclassType: mongodb.DropDatabaseOperation
      },
      {
        subclassOperation: new mongodb.EstimatedDocumentCountOperation(collection, {}),
        subclassType: mongodb.EstimatedDocumentCountOperation
      },
      {
        subclassOperation: new mongodb.FindOperation(collection, {}),
        subclassType: mongodb.FindOperation
      },
      {
        subclassOperation: new mongodb.FindAndModifyOperation(collection, {}),
        subclassType: mongodb.FindOperation
      },
      {
        subclassOperation: new mongodb.FindOneAndDeleteOperation(collection, {}),
        subclassType: mongodb.FindOneAndDeleteOperation
      },
      {
        subclassOperation: new mongodb.FindOneAndReplaceOperation(collection, {}),
        subclassType: mongodb.FindOneAndReplaceOperation
      },
      {
        subclassOperation: new mongodb.FindOneAndUpdateOperation(collection, {}),
        subclassType: mongodb.FindOneAndUpdateOperation
      },
      {
        subclassOperation: new mongodb.GetMoreOperation(collection, {}),
        subclassType: mongodb.GetMoreOperation
      },
      {
        subclassOperation: new mongodb.IndexesOperation(collection, {}),
        subclassType: mongodb.IndexesOperation
      },
      {
        subclassOperation: new mongodb.CreateIndexesOperation(collection, {}),
        subclassType: mongodb.CreateIndexesOperation
      },
      {
        subclassOperation: new mongodb.CreateIndexOperation(collection, {}),
        subclassType: mongodb.CreateIndexOperation
      },
      {
        subclassOperation: new mongodb.EnsureIndexOperation(collection, {}),
        subclassType: mongodb.EnsureIndexOperation
      },
      {
        subclassOperation: new mongodb.DropIndexOperation(collection, {}),
        subclassType: mongodb.DropIndexOperation
      },
      {
        subclassOperation: new mongodb.ListIndexesOperation(collection, {}),
        subclassType: mongodb.ListIndexesOperation
      },
      {
        subclassOperation: new mongodb.IndexExistsOperation(collection, {}),
        subclassType: mongodb.IndexExistsOperation
      },
      {
        subclassOperation: new mongodb.IndexInformationOperation(collection, {}),
        subclassType: mongodb.IndexInformationOperation
      },
      {
        subclassOperation: new mongodb.InsertOperation(collection, {}),
        subclassType: mongodb.InsertOperation
      },
      {
        subclassOperation: new mongodb.InsertOneOperation(collection, {}),
        subclassType: mongodb.InsertOneOperation
      },
      {
        subclassOperation: new mongodb.InsertManyOperation(collection, {}),
        subclassType: mongodb.InsertManyOperation
      },
      {
        subclassOperation: new mongodb.IsCappedOperation(collection, {}),
        subclassType: mongodb.IsCappedOperation
      },
      {
        subclassOperation: new mongodb.KillCursorsOperation(
          new Long(1),
          collection.fullNamespace,
          mockServer,
          {}
        ),
        subclassType: mongodb.KillCursorsOperation
      },
      {
        subclassOperation: new mongodb.ListCollectionsOperation(db, { a: 1 }, {}),
        subclassType: mongodb.ListCollectionsOperation
      },
      {
        subclassOperation: new mongodb.ListDatabasesOperation(db, {}),
        subclassType: mongodb.ListDatabasesOperation
      },
      {
        subclassOperation: new mongodb.OptionsOperation(collection, {}),
        subclassType: mongodb.OptionsOperation
      },
      {
        subclassOperation: new mongodb.ProfilingLevelOperation(collection, {}),
        subclassType: mongodb.ProfilingLevelOperation
      },
      {
        subclassOperation: new mongodb.RemoveUserOperation(db, 'userToDrop', {}),
        subclassType: mongodb.RemoveUserOperation
      },
      {
        subclassOperation: new mongodb.RenameOperation(collection, 'newName', {}),
        subclassType: mongodb.RenameOperation
      },
      {
        subclassOperation: new mongodb.RunCommandOperation(
          db,
          { dummyCommand: 'dummyCommand' },
          {}
        ),
        subclassType: mongodb.RunCommandOperation
      },
      {
        subclassOperation: new mongodb.RunAdminCommandOperation(
          { dummyCommand: 'dummyCommand' },
          {}
        ),
        subclassType: mongodb.RunAdminCommandOperation
      },
      {
        subclassOperation: new mongodb.CreateSearchIndexesOperation(collection, [
          { definition: { a: 1 } }
        ]),
        subclassType: mongodb.CreateSearchIndexesOperation
      },
      {
        subclassOperation: new mongodb.DropSearchIndexOperation(collection, 'dummyName'),
        subclassType: mongodb.DropSearchIndexOperation
      },
      {
        subclassOperation: new mongodb.UpdateSearchIndexOperation(collection, 'dummyName', {
          a: 1
        }),
        subclassType: mongodb.UpdateSearchIndexOperation
      },
      {
        subclassOperation: new mongodb.SetProfilingLevelOperation(db, 'all', {}),
        subclassType: mongodb.SetProfilingLevelOperation
      },
      {
        subclassOperation: new mongodb.DbStatsOperation(collection, {}),
        subclassType: mongodb.DbStatsOperation
      },
      {
        subclassOperation: new mongodb.UpdateOperation(
          collection.fullNamespace,
          { q: { a: 1 }, u: { b: 2 } },
          {}
        ),
        subclassType: mongodb.UpdateOperation
      },
      {
        subclassOperation: new mongodb.UpdateOneOperation(collection, { a: 1 }, { b: 1 }, {}),
        subclassType: mongodb.UpdateOneOperation
      },
      {
        subclassOperation: new mongodb.UpdateManyOperation(collection, { a: 1 }, { b: 1 }, {}),
        subclassType: mongodb.UpdateManyOperation
      },
      {
        subclassOperation: new mongodb.ReplaceOneOperation(collection, { a: 1 }, { b: 1 }, {}),
        subclassType: mongodb.ReplaceOneOperation
      },
      {
        subclassOperation: new mongodb.ValidateCollectionOperation(admin, collection, {}),
        subclassType: mongodb.ValidateCollectionOperation
      }
    ];
  });

  after(async function () {
    db = undefined;
    collection = undefined;
    await client.close();
  });

  it(`dummy`, function () {
    console.log('pass');
  });

  for (const { subclassOperation, subclassType } of commandNameArray) {
    context(`when subclass is ${subclassOperation.constructor.name}`, async function () {
      const commandName =
        subclassType instanceof mongodb.RunAdminCommandOperation
          ? 'runAdminCommand'
          : subclassType instanceof mongodb.RunCommandOperation
          ? 'runCommand'
          : subclassType instanceof mongodb.OptionsOperation
          ? 'options'
          : subclassType instanceof mongodb.IsCappedOperation
          ? 'isCapped'
          : subclassOperation.commandName;

      it(`subclass prototype's commandName should equal operation.commandName`, async function () {
        const prototypeCommandName = Object.getOwnPropertyDescriptor(
          subclassType.prototype,
          'commandName'
        )?.get?.call(null);
        expect(prototypeCommandName).to.equal(commandName);
      });

      it(`server.command's first key should equal operation.commandName`, async function () {
        const cmdCallerStub = sinon
          .stub(Server.prototype, 'command')
          .yieldsRight(undefined, { ok: 1 });
        await executeOperation(client, subclassOperation);
        expect(cmdCallerStub).to.have.been.calledOnceWith(
          sinon.match.any,
          sinon.match.hasOwn(commandName)
        );
        sinon.restore();
      });
    });
  }
});

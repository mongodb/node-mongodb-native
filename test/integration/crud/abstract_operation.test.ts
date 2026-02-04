import { expect } from 'chai';

import { DeleteManyOperation, DeleteOneOperation, DeleteOperation } from '../../mongodb';
import {
  FindAndModifyOperation,
  FindOneAndDeleteOperation,
  FindOneAndReplaceOperation,
  FindOneAndUpdateOperation
} from '../../mongodb';
import { CreateIndexesOperation, DropIndexOperation, ListIndexesOperation } from '../../mongodb';
import {
  ReplaceOneOperation,
  UpdateManyOperation,
  UpdateOneOperation,
  UpdateOperation
} from '../../mongodb';
import {
  type AbstractOperation,
  type Admin,
  type Collection,
  type Db,
  Long,
  type MongoClient,
  type Server
} from '../../mongodb';
import {
  AggregateOperation,
  CountOperation,
  CreateCollectionOperation,
  CreateSearchIndexesOperation,
  DbStatsOperation,
  DistinctOperation,
  DropCollectionOperation,
  DropDatabaseOperation,
  DropSearchIndexOperation,
  EstimatedDocumentCountOperation,
  FindOperation,
  GetMoreOperation,
  InsertOneOperation,
  InsertOperation,
  KillCursorsOperation,
  ListCollectionsOperation,
  ListDatabasesOperation,
  MongoDBNamespace,
  ProfilingLevelOperation,
  RemoveUserOperation,
  RenameOperation,
  RunCommandOperation,
  SetProfilingLevelOperation,
  TimeoutContext,
  UpdateSearchIndexOperation,
  ValidateCollectionOperation
} from '../../mongodb';

describe('abstract operation', function () {
  describe('command name getter', function () {
    interface AbstractOperationSubclasses {
      subclassCreator: () => AbstractOperation;
      subclassType: any;
      correctCommandName: string;
    }

    let client: MongoClient;
    let db: Db;
    let admin: Admin;
    let collection: Collection;

    const subclassArray: AbstractOperationSubclasses[] = [
      {
        subclassCreator: () => new AggregateOperation(collection.fullNamespace, [{ a: 1 }], {}),
        subclassType: AggregateOperation,
        correctCommandName: 'aggregate'
      },
      {
        subclassCreator: () => new CountOperation(collection.fullNamespace, { a: 1 }, {}),
        subclassType: CountOperation,
        correctCommandName: 'count'
      },
      {
        subclassCreator: () => new CreateCollectionOperation(db, 'name'),
        subclassType: CreateCollectionOperation,
        correctCommandName: 'create'
      },
      {
        subclassCreator: () =>
          new DeleteOperation(collection.fullNamespace, [{ q: { a: 1 }, limit: 1 }], {}),
        subclassType: DeleteOperation,
        correctCommandName: 'delete'
      },
      {
        subclassCreator: () =>
          new DeleteOneOperation(collection.fullNamespace, [{ q: { a: 1 }, limit: 1 }], {}),
        subclassType: DeleteOneOperation,
        correctCommandName: 'delete'
      },
      {
        subclassCreator: () =>
          new DeleteManyOperation(collection.fullNamespace, [{ q: { a: 1 }, limit: 1 }], {}),
        subclassType: DeleteManyOperation,
        correctCommandName: 'delete'
      },
      {
        subclassCreator: () => new DistinctOperation(collection, 'a', { a: 1 }),
        subclassType: DistinctOperation,
        correctCommandName: 'distinct'
      },
      {
        subclassCreator: () => new DropCollectionOperation(db, 'collectionName', {}),
        subclassType: DropCollectionOperation,
        correctCommandName: 'drop'
      },
      {
        subclassCreator: () => new DropDatabaseOperation(db, {}),
        subclassType: DropDatabaseOperation,
        correctCommandName: 'dropDatabase'
      },
      {
        subclassCreator: () => new EstimatedDocumentCountOperation(collection, {}),
        subclassType: EstimatedDocumentCountOperation,
        correctCommandName: 'count'
      },
      {
        subclassCreator: () => new FindOperation(collection.fullNamespace),
        subclassType: FindOperation,
        correctCommandName: 'find'
      },
      {
        subclassCreator: () => new FindAndModifyOperation(collection, { a: 1 }, {}),
        subclassType: FindAndModifyOperation,
        correctCommandName: 'findAndModify'
      },
      {
        subclassCreator: () => new FindOneAndDeleteOperation(collection, { a: 1 }, {}),
        subclassType: FindOneAndDeleteOperation,
        correctCommandName: 'findAndModify'
      },
      {
        subclassCreator: () => new FindOneAndReplaceOperation(collection, { a: 2 }, { a: 1 }, {}),
        subclassType: FindOneAndReplaceOperation,
        correctCommandName: 'findAndModify'
      },
      {
        subclassCreator: () => new FindOneAndUpdateOperation(collection, { a: 2 }, { $a: 1 }, {}),
        subclassType: FindOneAndUpdateOperation,
        correctCommandName: 'findAndModify'
      },
      {
        subclassCreator: () =>
          new GetMoreOperation(
            collection.fullNamespace,
            Long.fromNumber(1),
            {} as any as Server,
            {}
          ),
        subclassType: GetMoreOperation,
        correctCommandName: 'getMore'
      },
      {
        subclassCreator: () =>
          CreateIndexesOperation.fromIndexDescriptionArray(db, 'bar', [{ key: { a: 1 } }]),
        subclassType: CreateIndexesOperation,
        correctCommandName: 'createIndexes'
      },
      {
        subclassCreator: () => new DropIndexOperation(collection, 'a', {}),
        subclassType: DropIndexOperation,
        correctCommandName: 'dropIndexes'
      },
      {
        subclassCreator: () => new ListIndexesOperation(collection, {}),
        subclassType: ListIndexesOperation,
        correctCommandName: 'listIndexes'
      },
      {
        subclassCreator: () => new InsertOperation(collection.fullNamespace, [{ a: 1 }], {}),
        subclassType: InsertOperation,
        correctCommandName: 'insert'
      },
      {
        subclassCreator: () => new InsertOneOperation(collection, { a: 1 }, {}),
        subclassType: InsertOneOperation,
        correctCommandName: 'insert'
      },
      {
        subclassCreator: () =>
          new KillCursorsOperation(
            Long.fromNumber(1),
            collection.fullNamespace,
            {} as any as Server,
            {}
          ),
        subclassType: KillCursorsOperation,
        correctCommandName: 'killCursors'
      },
      {
        subclassCreator: () => new ListCollectionsOperation(db, { a: 1 }, {}),
        subclassType: ListCollectionsOperation,
        correctCommandName: 'listCollections'
      },
      {
        subclassCreator: () => new ListDatabasesOperation(db, {}),
        subclassType: ListDatabasesOperation,
        correctCommandName: 'listDatabases'
      },
      {
        subclassCreator: () => new ProfilingLevelOperation(db, {}),
        subclassType: ProfilingLevelOperation,
        correctCommandName: 'profile'
      },
      {
        subclassCreator: () => new RemoveUserOperation(db, 'userToDrop', {}),
        subclassType: RemoveUserOperation,
        correctCommandName: 'dropUser'
      },
      {
        subclassCreator: () => new RenameOperation(collection, 'newName', {}),
        subclassType: RenameOperation,
        correctCommandName: 'renameCollection'
      },
      {
        subclassCreator: () =>
          new RunCommandOperation(
            new MongoDBNamespace('foo', 'bar'),
            { dummyCommand: 'dummyCommand' },
            {}
          ),
        subclassType: RunCommandOperation,
        correctCommandName: 'runCommand'
      },
      {
        subclassCreator: () =>
          new CreateSearchIndexesOperation(collection, [{ definition: { a: 1 } }]),
        subclassType: CreateSearchIndexesOperation,
        correctCommandName: 'createSearchIndexes'
      },
      {
        subclassCreator: () => new DropSearchIndexOperation(collection, 'dummyName'),
        subclassType: DropSearchIndexOperation,
        correctCommandName: 'dropSearchIndex'
      },
      {
        subclassCreator: () =>
          new UpdateSearchIndexOperation(collection, 'dummyName', {
            a: 1
          }),
        subclassType: UpdateSearchIndexOperation,
        correctCommandName: 'updateSearchIndex'
      },
      {
        subclassCreator: () => new SetProfilingLevelOperation(db, 'all', {}),
        subclassType: SetProfilingLevelOperation,
        correctCommandName: 'profile'
      },
      {
        subclassCreator: () => new DbStatsOperation(db, {}),
        subclassType: DbStatsOperation,
        correctCommandName: 'dbStats'
      },
      {
        subclassCreator: () =>
          new UpdateOperation(collection.fullNamespace, [{ q: { a: 1 }, u: { $a: 2 } }], {}),
        subclassType: UpdateOperation,
        correctCommandName: 'update'
      },
      {
        subclassCreator: () =>
          new UpdateOneOperation(collection.fullNamespace, { a: 1 }, { $a: 2 }, {}),
        subclassType: UpdateOneOperation,
        correctCommandName: 'update'
      },
      {
        subclassCreator: () =>
          new UpdateManyOperation(collection.fullNamespace, { a: 1 }, { $a: 2 }, {}),
        subclassType: UpdateManyOperation,
        correctCommandName: 'update'
      },
      {
        subclassCreator: () =>
          new ReplaceOneOperation(collection.fullNamespace, { a: 1 }, { b: 1 }, {}),
        subclassType: ReplaceOneOperation,
        correctCommandName: 'update'
      },
      {
        subclassCreator: () => new ValidateCollectionOperation(admin, 'bar', {}),
        subclassType: ValidateCollectionOperation,
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

        if (subclassType !== RunCommandOperation) {
          it(
            `operation.commandName is a key in the command document`,
            {
              requires: { topology: 'single' }
            },
            async function () {
              const session = client.startSession();
              const pool = Array.from(client.topology.s.servers.values())[0].pool;
              const timeoutContext = TimeoutContext.create({
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

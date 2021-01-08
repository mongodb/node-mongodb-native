/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect } from 'chai';
import { Document, MongoError } from '../../../src';
import type { EntitiesMap } from './entities';
import type * as uni from './schema';
import {
  isExistsOperator,
  isMatchesEntityOperator,
  isMatchesHexBytesOperator,
  isSessionLsidOperator,
  isSpecialOperator,
  isTypeOperator,
  isUnsetOrMatchesOperator,
  SpecialOperator
} from './unified-utils';

export class UnifiedOperation {
  name: string;
  constructor(op: uni.OperationDescription) {
    this.name = op.name;
  }
}

async function abortTransactionOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function aggregateOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function assertCollectionExistsOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function assertCollectionNotExistsOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function assertIndexExistsOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function assertIndexNotExistsOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function assertDifferentLsidOnLastTwoCommandsOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function assertSameLsidOnLastTwoCommandsOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function assertSessionDirtyOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function assertSessionNotDirtyOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function assertSessionPinnedOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function assertSessionUnpinnedOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function assertSessionTransactionStateOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function bulkWriteOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function commitTransactionOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function createChangeStreamOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function createCollectionOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function createIndexOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function deleteOneOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function dropCollectionOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function endSessionOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function findOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function findOneAndReplaceOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function findOneAndUpdateOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function failPointOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function insertOneOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  const collection = entities.getCollection(op.object);
  const session = entities.get(op.arguments.session);
  const result = await collection.insertOne(op.arguments.document);
  return result;
}
async function insertManyOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  const collection = entities.getCollection(op.object);
  const session = entities.get(op.arguments.session);
  const options = {
    ordered: op.arguments.ordered ?? true
  };
  const result = await collection.insertMany(op.arguments.documents, options);
  return result;
}
async function iterateUntilDocumentOrErrorOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function listDatabasesOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function replaceOneOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function startTransactionOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function targetedFailPointOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function deleteOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function downloadOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function uploadOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}
async function withTransactionOperation(
  entities: EntitiesMap,
  op: uni.OperationDescription
): Promise<Document> {
  throw new Error('not implemented.');
}

type RunOperationFn = (entities: EntitiesMap, op: uni.OperationDescription) => Promise<Document>;
export const operations = new Map<string, RunOperationFn>();

operations.set('abortTransaction', abortTransactionOperation);
operations.set('aggregate', aggregateOperation);
operations.set('assertCollectionExists', assertCollectionExistsOperation);
operations.set('assertCollectionNotExists', assertCollectionNotExistsOperation);
operations.set('assertIndexExists', assertIndexExistsOperation);
operations.set('assertIndexNotExists', assertIndexNotExistsOperation);
operations.set(
  'assertDifferentLsidOnLastTwoCommands',
  assertDifferentLsidOnLastTwoCommandsOperation
);
operations.set('assertSameLsidOnLastTwoCommands', assertSameLsidOnLastTwoCommandsOperation);
operations.set('assertSessionDirty', assertSessionDirtyOperation);
operations.set('assertSessionNotDirty', assertSessionNotDirtyOperation);
operations.set('assertSessionPinned', assertSessionPinnedOperation);
operations.set('assertSessionUnpinned', assertSessionUnpinnedOperation);
operations.set('assertSessionTransactionState', assertSessionTransactionStateOperation);
operations.set('bulkWrite', bulkWriteOperation);
operations.set('commitTransaction', commitTransactionOperation);
operations.set('createChangeStream', createChangeStreamOperation);
operations.set('createCollection', createCollectionOperation);
operations.set('createIndex', createIndexOperation);
operations.set('deleteOne', deleteOneOperation);
operations.set('dropCollection', dropCollectionOperation);
operations.set('endSession', endSessionOperation);
operations.set('find', findOperation);
operations.set('findOneAndReplace', findOneAndReplaceOperation);
operations.set('findOneAndUpdate', findOneAndUpdateOperation);
operations.set('failPoint', failPointOperation);
operations.set('insertOne', insertOneOperation);
operations.set('insertMany', insertManyOperation);
operations.set('iterateUntilDocumentOrError', iterateUntilDocumentOrErrorOperation);
operations.set('listDatabases', listDatabasesOperation);
operations.set('replaceOne', replaceOneOperation);
operations.set('startTransaction', startTransactionOperation);
operations.set('targetedFailPoint', targetedFailPointOperation);
operations.set('delete', deleteOperation);
operations.set('download', downloadOperation);
operations.set('upload', uploadOperation);
operations.set('withTransaction', withTransactionOperation);

export async function executeOperationAndCheck(
  operation: uni.OperationDescription,
  entities: EntitiesMap
): Promise<void> {
  const operationName = operation.name;
  const opFunc = operations.get(operationName);
  expect(opFunc, `Unknown operation: ${operationName}`).to.exist;
  try {
    const result = await opFunc(entities, operation);

    if (operation.expectError) {
      expect.fail(`Operation ${operationName} succeeded but was not supposed to`);
    }

    if (operation.expectResult) {
      if (isSpecialOperator(operation.expectResult)) {
        specialCheck(result, operation.expectResult);
      } else {
        for (const [resultKey, resultValue] of Object.entries(operation.expectResult)) {
          // each key/value expectation can be is a special op
          if (isSpecialOperator(resultValue)) {
            specialCheck(result, resultValue);
          } else {
            expect(result[resultKey]).to.deep.equal(resultValue);
          }
        }
      }
    }

    if (operation.saveResultAsEntity) {
      entities.set(operation.saveResultAsEntity, result);
    }
  } catch (error) {
    if (operation.expectError) {
      expect(error).to.be.instanceof(MongoError);
      // TODO more checking of the error
    } else {
      expect.fail(`Operation ${operationName} failed with ${error.message}`);
    }
  }
}

export function specialCheck(result: Document, check: SpecialOperator): void {
  if (isUnsetOrMatchesOperator(check)) {
    if (result == null) return; // acceptable unset
    if (typeof check.$$unsetOrMatches === 'object') {
      // We need to a "deep equals" check but the props can also point to special checks
      for (const [k, v] of Object.entries(check.$$unsetOrMatches)) {
        expect(result).to.have.property(k);
        if (isSpecialOperator(v)) {
          specialCheck(result[k], v);
        } else {
          expect(v).to.equal(check.$$unsetOrMatches);
        }
      }
    } else {
      expect(result).to.equal(check.$$unsetOrMatches);
    }
  } else if (isExistsOperator(check)) {
    throw new Error('not implemented.');
  } else if (isMatchesEntityOperator(check)) {
    throw new Error('not implemented.');
  } else if (isMatchesHexBytesOperator(check)) {
    throw new Error('not implemented.');
  } else if (isSessionLsidOperator(check)) {
    throw new Error('not implemented.');
  } else if (isTypeOperator(check)) {
    throw new Error('not implemented.');
  } else {
    throw new Error('not implemented.');
  }
}

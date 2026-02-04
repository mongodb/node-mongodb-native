import { expectType } from 'tsd';

import {
  type BatchType,
  type BulkWriteOptions,
  type BulkWriteResult,
  type DeleteStatement,
  type Document,
  MongoClient,
  type UpdateStatement
} from '../../../mongodb';
import { Batch, BulkOperationBase } from '../../../mongodb';

const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection('test');

class TestBulkOperation extends BulkOperationBase {
  constructor() {
    super(collection, {}, true);
  }

  addToOperationsList(
    batchType: BatchType,
    document: Document | UpdateStatement | DeleteStatement
  ): this {
    this.s.currentBatch = new Batch<Document>(batchType, 0);
    this.s.currentBatch.operations.push(document);
    return this;
  }
}

const bulkOperation = new TestBulkOperation();

// execute

const options: BulkWriteOptions = {};

expectType<Promise<BulkWriteResult>>(bulkOperation.execute());

expectType<Promise<BulkWriteResult>>(bulkOperation.execute(options));

// ensure we can use the bulk operation execute in a callback based wrapper function
function extendedPromiseBasedBulkExecute(
  optionalOptions?: BulkWriteOptions
): Promise<BulkWriteResult> {
  return bulkOperation.execute(optionalOptions);
}

expectType<Promise<BulkWriteResult>>(extendedPromiseBasedBulkExecute());

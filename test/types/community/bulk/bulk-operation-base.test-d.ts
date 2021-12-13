import { expectType } from 'tsd';

import { Batch, BulkOperationBase } from '../../../../src/bulk/common';
import {
  AnyError,
  BatchType,
  BulkWriteOptions,
  BulkWriteResult,
  Callback,
  DeleteStatement,
  Document,
  MongoClient,
  UpdateStatement
} from '../../../../src/index';

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

expectType<void>(
  bulkOperation.execute((error, bulkWriteResult) => {
    expectType<AnyError | undefined>(error);
    expectType<BulkWriteResult | undefined>(bulkWriteResult);
  })
);

expectType<void>(
  bulkOperation.execute(options, (error, bulkWriteResult) => {
    expectType<AnyError | undefined>(error);
    expectType<BulkWriteResult | undefined>(bulkWriteResult);
  })
);

// ensure we can use the bulk operation execute in a callback based wrapper function
function extendedCallbackBasedBulkExecute(
  callback: Callback<BulkWriteResult>,
  optionalOptions?: BulkWriteOptions
): void {
  bulkOperation.execute(optionalOptions, callback);
}

expectType<void>(
  extendedCallbackBasedBulkExecute((error, bulkWriteResult) => {
    expectType<AnyError | undefined>(error);
    expectType<BulkWriteResult | undefined>(bulkWriteResult);
  })
);

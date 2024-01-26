import { expect } from 'chai';

// Exception to the import from mongodb rule we're unit testing our public API
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import * as mongodb from '../../src/index';
import { byStrings, sorted } from '../tools/utils';

/**
 * TS-NODE Adds these keys but they are undefined, they are not present when you import from lib
 * We did not think this strangeness was worth investigating so we just make sure they remain set to undefined
 */
const TS_NODE_EXPORTS = ['AnyBulkWriteOperation', 'BulkWriteOptions'];

const EXPECTED_EXPORTS = [
  ...TS_NODE_EXPORTS,
  'AbstractCursor',
  'Admin',
  'AggregationCursor',
  'AuthMechanism',
  'AutoEncryptionLoggerLevel',
  'BatchType',
  'Binary',
  'BSON',
  'BSONRegExp',
  'BSONSymbol',
  'BSONType',
  'CancellationToken',
  'ChangeStream',
  'ChangeStreamCursor',
  'ClientSession',
  'Code',
  'Collection',
  'CommandFailedEvent',
  'CommandStartedEvent',
  'CommandSucceededEvent',
  'Compressor',
  'ConnectionCheckedInEvent',
  'ConnectionCheckedOutEvent',
  'ConnectionCheckOutFailedEvent',
  'ConnectionCheckOutStartedEvent',
  'ConnectionClosedEvent',
  'ConnectionCreatedEvent',
  'ConnectionPoolClearedEvent',
  'ConnectionPoolClosedEvent',
  'ConnectionPoolCreatedEvent',
  'ConnectionPoolMonitoringEvent',
  'ConnectionPoolReadyEvent',
  'ConnectionReadyEvent',
  'CURSOR_FLAGS',
  'Db',
  'DBRef',
  'Decimal128',
  'Double',
  'ExplainVerbosity',
  'FindCursor',
  'GridFSBucket',
  'GridFSBucketReadStream',
  'GridFSBucketWriteStream',
  'GSSAPICanonicalizationValue',
  'Int32',
  'ListCollectionsCursor',
  'ListIndexesCursor',
  'Long',
  'MaxKey',
  'MinKey',
  'MongoAPIError',
  'MongoAWSError',
  'MongoBatchReExecutionError',
  'MongoBulkWriteError',
  'MongoChangeStreamError',
  'MongoClient',
  'MongoCompatibilityError',
  'MongoCursorExhaustedError',
  'MongoCursorInUseError',
  'MongoDecompressionError',
  'MongoDriverError',
  'MongoError',
  'MongoErrorLabel',
  'MongoExpiredSessionError',
  'MongoGridFSChunkError',
  'MongoGridFSStreamError',
  'MongoInvalidArgumentError',
  'MongoKerberosError',
  'MongoMissingCredentialsError',
  'MongoMissingDependencyError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
  'MongoParseError',
  'MongoRuntimeError',
  'MongoServerClosedError',
  'MongoServerError',
  'MongoServerSelectionError',
  'MongoSystemError',
  'MongoTailableCursorError',
  'MongoTopologyClosedError',
  'MongoTransactionError',
  'MongoUnexpectedServerResponseError',
  'MongoWriteConcernError',
  'ObjectId',
  'OrderedBulkOperation',
  'ProfilingLevel',
  'ReadConcern',
  'ReadConcernLevel',
  'ReadPreference',
  'ReadPreferenceMode',
  'ReturnDocument',
  'ServerApiVersion',
  'ServerClosedEvent',
  'ServerDescriptionChangedEvent',
  'ServerHeartbeatFailedEvent',
  'ServerHeartbeatStartedEvent',
  'ServerHeartbeatSucceededEvent',
  'ServerOpeningEvent',
  'ServerType',
  'SrvPollingEvent',
  'Timestamp',
  'TopologyClosedEvent',
  'TopologyDescriptionChangedEvent',
  'TopologyOpeningEvent',
  'TopologyType',
  'UnorderedBulkOperation',
  'WriteConcern'
];

describe('mongodb entrypoint', () => {
  it('should export all and only the expected keys in expected_exports', () => {
    expect(sorted(Object.keys(mongodb), byStrings)).to.deep.equal(
      sorted(EXPECTED_EXPORTS, byStrings)
    );
  });

  it('should export keys added by ts-node as undefined', () => {
    // If the array is empty, this test would be a no-op so we should remove it
    expect(TS_NODE_EXPORTS).to.have.length.greaterThan(0);
    for (const tsNodeExportKey of TS_NODE_EXPORTS) {
      expect(mongodb).to.have.property(tsNodeExportKey, undefined);
    }
  });
});

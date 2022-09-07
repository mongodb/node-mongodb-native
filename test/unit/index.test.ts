import { expect } from 'chai';

import * as mongodb from '../../src/index';
import { byStrings, sorted } from '../tools/utils';

/**
 * TS-NODE Adds these keys but they are undefined, they are not present when you import from lib
 * We did not think this strangeness was worth investigating so we just make sure they remain set to undefined
 */
const TS_NODE_EXPORTS = ['AnyBulkWriteOperation', 'BulkWriteOptions'];

const EXPECTED_EXPORTS = [
  ...TS_NODE_EXPORTS,
  'BSON',
  'Binary',
  'BSONRegExp',
  'BSONSymbol',
  'Code',
  'DBRef',
  'Decimal128',
  'Double',
  'Int32',
  'Long',
  'Map',
  'MaxKey',
  'MinKey',
  'ObjectId',
  'Timestamp',
  'ChangeStreamCursor',
  'ObjectID',
  'MongoBulkWriteError',
  'MongoAPIError',
  'MongoAWSError',
  'MongoBatchReExecutionError',
  'MongoChangeStreamError',
  'MongoCompatibilityError',
  'MongoCursorExhaustedError',
  'MongoCursorInUseError',
  'MongoDecompressionError',
  'MongoDriverError',
  'MongoError',
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
  'AbstractCursor',
  'Admin',
  'AggregationCursor',
  'CancellationToken',
  'ChangeStream',
  'ClientSession',
  'Collection',
  'Db',
  'FindCursor',
  'GridFSBucket',
  'ListCollectionsCursor',
  'ListIndexesCursor',
  'Logger',
  'MongoClient',
  'Promise',
  'BatchType',
  'GSSAPICanonicalizationValue',
  'AuthMechanism',
  'Compressor',
  'CURSOR_FLAGS',
  'AutoEncryptionLoggerLevel',
  'MongoErrorLabel',
  'ExplainVerbosity',
  'LoggerLevel',
  'ServerApiVersion',
  'BSONType',
  'ReturnDocument',
  'ProfilingLevel',
  'ReadConcernLevel',
  'ReadPreferenceMode',
  'ServerType',
  'TopologyType',
  'ReadConcern',
  'ReadPreference',
  'WriteConcern',
  'CommandFailedEvent',
  'CommandStartedEvent',
  'CommandSucceededEvent',
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
  'ConnectionReadyEvent',
  'ServerClosedEvent',
  'ServerDescriptionChangedEvent',
  'ServerHeartbeatFailedEvent',
  'ServerHeartbeatStartedEvent',
  'ServerHeartbeatSucceededEvent',
  'ServerOpeningEvent',
  'TopologyClosedEvent',
  'TopologyDescriptionChangedEvent',
  'TopologyOpeningEvent',
  'SrvPollingEvent',
  'GridFSBucketReadStream',
  'GridFSBucketWriteStream',
  'OrderedBulkOperation',
  'UnorderedBulkOperation'
];

describe('mongodb entrypoint', () => {
  it('should export all and only the expected keys in expected_exports', () => {
    expect(sorted(Object.keys(mongodb), byStrings)).to.deep.equal(
      sorted(EXPECTED_EXPORTS, byStrings)
    );
  });

  it('should export keys added by ts-node as undefined', () => {
    expect(TS_NODE_EXPORTS).to.have.length.greaterThan(0); // Are there no longer fake ts-node exports?
    for (const tsNodeExportKey of TS_NODE_EXPORTS) {
      expect(mongodb).to.have.property(tsNodeExportKey, undefined);
    }
  });
});

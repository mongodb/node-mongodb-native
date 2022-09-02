import { expect } from 'chai';

import * as mongodb from '../../src/index';
import { setDifference } from '../../src/utils';
import { byStrings, sorted } from '../tools/utils';

// prettier-ignore
const expectedExports = new Map([
  // BSON
  ['BSON',                               'reason'],
  ['Binary',                             'reason'],
  ['BSONRegExp',                         'reason'],
  ['BSONSymbol',                         'reason'],
  ['Code',                               'reason'],
  ['DBRef',                              'reason'],
  ['Decimal128',                         'reason'],
  ['Double',                             'reason'],
  ['Int32',                              'reason'],
  ['Long',                               'reason'],
  ['Map',                                'reason'],
  ['MaxKey',                             'reason'],
  ['MinKey',                             'reason'],
  ['ObjectId',                           'reason'],
  ['Timestamp',                          'reason'],
  ['ChangeStreamCursor',                 'reason'],
  ['ObjectID',                           'reason'],
  // errors
  ['MongoBulkWriteError',                'reason'],
  ['MongoAPIError',                      'reason'],
  ['MongoAWSError',                      'reason'],
  ['MongoBatchReExecutionError',         'reason'],
  ['MongoChangeStreamError',             'reason'],
  ['MongoCompatibilityError',            'reason'],
  ['MongoCursorExhaustedError',          'reason'],
  ['MongoCursorInUseError',              'reason'],
  ['MongoDecompressionError',            'reason'],
  ['MongoDriverError',                   'reason'],
  ['MongoError',                         'reason'],
  ['MongoExpiredSessionError',           'reason'],
  ['MongoGridFSChunkError',              'reason'],
  ['MongoGridFSStreamError',             'reason'],
  ['MongoInvalidArgumentError',          'reason'],
  ['MongoKerberosError',                 'reason'],
  ['MongoMissingCredentialsError',       'reason'],
  ['MongoMissingDependencyError',        'reason'],
  ['MongoNetworkError',                  'reason'],
  ['MongoNetworkTimeoutError',           'reason'],
  ['MongoNotConnectedError',             'reason'],
  ['MongoParseError',                    'reason'],
  ['MongoRuntimeError',                  'reason'],
  ['MongoServerClosedError',             'reason'],
  ['MongoServerError',                   'reason'],
  ['MongoServerSelectionError',          'reason'],
  ['MongoSystemError',                   'reason'],
  ['MongoTailableCursorError',           'reason'],
  ['MongoTopologyClosedError',           'reason'],
  ['MongoTransactionError',              'reason'],
  ['MongoUnexpectedServerResponseError', 'reason'],
  ['MongoWriteConcernError',             'reason'],
  // classes
  ['AbstractCursor',                     'reason'],
  ['Admin',                              'reason'],
  ['AggregationCursor',                  'reason'],
  ['CancellationToken',                  'reason'],
  ['ChangeStream',                       'reason'],
  ['ClientSession',                      'reason'],
  ['Collection',                         'reason'],
  ['Db',                                 'reason'],
  ['FindCursor',                         'reason'],
  ['GridFSBucket',                       'reason'],
  ['ListCollectionsCursor',              'reason'],
  ['ListIndexesCursor',                  'reason'],
  ['Logger',                             'reason'],
  ['MongoClient',                        'reason'],
  // global promise setter
  ['Promise',                            'global promise setter'],
  // enums
  ['BatchType',                          'reason'],
  ['GSSAPICanonicalizationValue',        'reason'],
  ['AuthMechanism',                      'reason'],
  ['Compressor',                         'reason'],
  ['CURSOR_FLAGS',                       'reason'],
  ['AutoEncryptionLoggerLevel',          'reason'],
  ['MongoErrorLabel',                    'reason'],
  ['ExplainVerbosity',                   'reason'],
  ['LoggerLevel',                        'reason'],
  ['ServerApiVersion',                   'reason'],
  ['BSONType',                           'reason'],
  ['ReturnDocument',                     'reason'],
  ['ProfilingLevel',                     'reason'],
  ['ReadConcernLevel',                   'reason'],
  ['ReadPreferenceMode',                 'reason'],
  ['ServerType',                         'reason'],
  ['TopologyType',                       'reason'],
  ['ReadConcern',                        'reason'],
  ['ReadPreference',                     'reason'],
  ['WriteConcern',                       'reason'],
  // events
  ['CommandFailedEvent',                 'reason'],
  ['CommandStartedEvent',                'reason'],
  ['CommandSucceededEvent',              'reason'],
  ['ConnectionCheckedInEvent',           'reason'],
  ['ConnectionCheckedOutEvent',          'reason'],
  ['ConnectionCheckOutFailedEvent',      'reason'],
  ['ConnectionCheckOutStartedEvent',     'reason'],
  ['ConnectionClosedEvent',              'reason'],
  ['ConnectionCreatedEvent',             'reason'],
  ['ConnectionPoolClearedEvent',         'reason'],
  ['ConnectionPoolClosedEvent',          'reason'],
  ['ConnectionPoolCreatedEvent',         'reason'],
  ['ConnectionPoolMonitoringEvent',      'reason'],
  ['ConnectionReadyEvent',               'reason'],
  ['ServerClosedEvent',                  'reason'],
  ['ServerDescriptionChangedEvent',      'reason'],
  ['ServerHeartbeatFailedEvent',         'reason'],
  ['ServerHeartbeatStartedEvent',        'reason'],
  ['ServerHeartbeatSucceededEvent',      'reason'],
  ['ServerOpeningEvent',                 'reason'],
  ['TopologyClosedEvent',                'reason'],
  ['TopologyDescriptionChangedEvent',    'reason'],
  ['TopologyOpeningEvent',               'reason'],
  ['SrvPollingEvent',                    'reason'],

  ['GridFSBucketReadStream',             'reason'],
  ['GridFSBucketWriteStream',            'reason'],
  ['OrderedBulkOperation',               'reason'],
  ['UnorderedBulkOperation',             'reason'],

  // TS-NODE Adds these keys but they are undefined... weird
  ['AnyBulkWriteOperation',              'ts-node'],
  ['BulkWriteOptions',                   'ts-node'],
]);

describe('mongodb entrypoint', () => {
  it('should export all keys in our exports list', () => {
    expect(sorted(Object.keys(mongodb), byStrings)).to.deep.equal(
      sorted(expectedExports.keys(), byStrings)
    );
  });

  it('should export only keys in our exports list', () => {
    const currentExports = Object.keys(mongodb);
    const difference = setDifference(currentExports, expectedExports.keys());
    expect(
      difference,
      `Found extra exports [${Array.from(difference).join(
        ', '
      )}], if these are expected, just add them to the list in this file`
    ).to.have.lengthOf(0);
  });

  it('meta test: ts-node adds keys to the module that point to undefined', () => {
    const tsNodeKeys = Array.from(expectedExports.entries()).filter(
      ([, value]) => value === 'ts-node'
    );

    for (const [tsNodeKey] of tsNodeKeys) {
      expect(mongodb).to.have.property(tsNodeKey, undefined);
    }
  });
});

'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');
const ChangeStream = require('../../lib/change_stream');

describe('Change Stream Resume Tests', function() {
  const test = {};
  const DEFAULT_IS_MASTER = {
    setName: 'rs',
    setVersion: 1,
    maxBsonObjectSize: 16777216,
    maxMessageSizeBytes: 48000000,
    maxWriteBatchSize: 1000,
    localTime: new Date(),
    maxWireVersion: 7,
    minWireVersion: 0,
    ok: 1,
    ismaster: true,
    secondary: false
  };

  function makeIsMaster(server) {
    const uri = server.uri();

    return Object.assign({}, DEFAULT_IS_MASTER, {
      hosts: [uri],
      me: uri,
      primary: uri
    });
  }

  beforeEach(() => {
    return mock.createServer().then(server => {
      test.server = server;
    });
  });
  afterEach(() => mock.cleanup());

  function turnErrorCodesIntoConfigs(errorCodes, valid) {
    return Array.from(errorCodes).map(errCode => ({ errCode, valid }));
  }

  const NON_RESUMABLE_NORMAL_ERROR_CODES = [1, 4, 100000];

  turnErrorCodesIntoConfigs(ChangeStream.RESUMABLE_ERROR_CODES, true)
    .concat(turnErrorCodesIntoConfigs(NON_RESUMABLE_NORMAL_ERROR_CODES, false))
    .forEach(config => {
      const errCode = config.errCode;
      const valid = config.valid;

      const not = valid ? '' : 'not ';
      it(`Should ${not}resume on error code ${errCode}`, {
        metadata: { requires: { mongodb: '>=3.6.0' } },
        test: function() {
          const ObjectId = this.configuration.require.ObjectId;
          const Timestamp = this.configuration.require.Timestamp;
          // const Long = this.configuration.require.Long;
          const MongoClient = this.configuration.require.MongoClient;

          const CHANGE_DOC = {
            _id: {
              ts: new Timestamp(4, 1501511802),
              ns: 'integration_tests.docsDataEvent',
              _id: new ObjectId('597f407a8fd4abb616feca93')
            },
            operationType: 'insert',
            ns: {
              db: 'integration_tests',
              coll: 'docsDataEvent'
            },
            fullDocument: {
              _id: new ObjectId('597f407a8fd4abb616feca93'),
              a: 1,
              counter: 0
            }
          };

          let firstRequest = true;
          test.server.setMessageHandler(request => {
            const doc = request.document;

            if (doc.ismaster) {
              return request.reply(makeIsMaster(test.server));
            }
            if (doc.endSessions) {
              return request.reply({ ok: 1 });
            }
            if (doc.aggregate) {
              if (firstRequest) {
                firstRequest = false;
                return request.reply({
                  ok: 0,
                  errmsg: 'something',
                  code: errCode
                });
              }

              return request.reply(CHANGE_DOC);
            }
          });

          return MongoClient.connect(`mongodb://${test.server.uri()}`).then(client => {
            const changeStream = client
              .db('test')
              .collection('test')
              .watch();

            return changeStream.next().then(
              change => {
                if (!valid) {
                  throw new Error(`Expected changeStream to not resume on error code ${errCode}`);
                }

                expect(change).to.deep.equal(CHANGE_DOC);
              },
              err => {
                if (valid) {
                  throw new Error(`Expected changeStream to resume on error code ${errCode}`);
                }

                expect(err).to.be.an.instanceof(Error);
              }
            );
          });
        }
      });
    });
});

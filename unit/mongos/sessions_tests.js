'use strict';
var Mongos = require('../../../../lib/topologies/mongos'),
  expect = require('chai').expect,
  mock = require('mongodb-mock-server'),
  genClusterTime = require('../common').genClusterTime;

const sessions = require('../../../../lib/sessions');
const ServerSessionPool = sessions.ServerSessionPool;
const ClientSession = sessions.ClientSession;
const ReadPreference = require('../../../../lib/topologies/read_preference');

const test = {};
describe('Sessions (Mongos)', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(mockServer => {
      test.server = mockServer;
    });
  });

  it('should recognize and set `clusterTime` on the topology', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const clusterTime = genClusterTime(Date.now());
      test.server.setMessageHandler(request => {
        request.reply(
          Object.assign({}, mock.DEFAULT_ISMASTER, {
            msg: 'isdbgrid',
            $clusterTime: clusterTime
          })
        );
      });

      const mongos = new Mongos([test.server.address()], {
        connectionTimeout: 30000,
        socketTimeout: 30000,
        haInterval: 500,
        size: 1
      });

      mongos.on('error', done);
      mongos.once('connect', () => {
        expect(mongos.clusterTime).to.eql(clusterTime);
        mongos.destroy();
        done();
      });

      mongos.connect();
    }
  });

  it('should report the deployment `clusterTime` for all servers in the topology', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const clusterTime = genClusterTime(Date.now());
      test.server.setMessageHandler(request => {
        request.reply(
          Object.assign({}, mock.DEFAULT_ISMASTER, {
            msg: 'isdbgrid',
            $clusterTime: clusterTime
          })
        );
      });

      const mongos = new Mongos([test.server.address()], {
        connectionTimeout: 30000,
        socketTimeout: 30000,
        haInterval: 500,
        size: 1
      });

      mongos.on('error', done);
      mongos.once('connect', () => {
        expect(mongos.clusterTime).to.eql(clusterTime);
        const servers = mongos.connectingProxies.concat(mongos.connectedProxies);
        servers.forEach(server => expect(server.clusterTime).to.eql(clusterTime));

        mongos.destroy();
        done();
      });

      mongos.connect();
    }
  });

  it('should track the highest `$clusterTime` seen', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const clusterTime = genClusterTime(Date.now()),
        futureClusterTime = genClusterTime(Date.now() + 10 * 60 * 1000);

      test.server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(
            Object.assign({}, mock.DEFAULT_ISMASTER, {
              msg: 'isdbgrid',
              $clusterTime: clusterTime
            })
          );
        } else if (doc.insert) {
          request.reply({
            ok: 1,
            n: [],
            lastOp: new Date(),
            $clusterTime: futureClusterTime
          });
        }
      });

      const mongos = new Mongos([test.server.address()]);
      mongos.on('error', done);
      mongos.once('connect', () => {
        expect(mongos.clusterTime).to.exist;
        expect(mongos.clusterTime).to.eql(clusterTime);

        mongos.insert('test.test', [{ created: new Date() }], function(err) {
          expect(err).to.not.exist;
          expect(mongos.clusterTime).to.exist;
          expect(mongos.clusterTime).to.not.eql(clusterTime);
          expect(mongos.clusterTime).to.eql(futureClusterTime);

          mongos.destroy();
          done();
        });
      });

      mongos.connect();
    }
  });

  it('should default `logicalSessionTimeoutMinutes` to `null`', {
    metadata: { requires: { topology: 'single' } },
    test: function() {
      const mongos = new Mongos([test.server.address()]);
      expect(mongos.logicalSessionTimeoutMinutes).to.equal(null);
    }
  });

  it('should track `logicalSessionTimeoutMinutes`', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      test.server.setMessageHandler(request => {
        request.reply(
          Object.assign({}, mock.DEFAULT_ISMASTER, {
            msg: 'isdbgrid',
            logicalSessionTimeoutMinutes: 10
          })
        );
      });

      var mongos = new Mongos([test.server.address()], {
        connectionTimeout: 30000,
        socketTimeout: 30000,
        haInterval: 500,
        size: 1
      });

      mongos.on('error', done);
      mongos.once('connect', () => {
        expect(mongos.logicalSessionTimeoutMinutes).to.equal(10);
        mongos.destroy();
        done();
      });

      mongos.connect();
    }
  });

  it(
    'should ensure that lsid is received within the query object of a find request when read preference is not primary',
    {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        const clusterTime = genClusterTime(Date.now());
        test.server.setMessageHandler(request => {
          const doc = request.document;
          if (doc.ismaster) {
            request.reply(
              Object.assign({}, mock.DEFAULT_ISMASTER_36, {
                msg: 'isdbgrid',
                $clusterTime: clusterTime
              })
            );
          } else if (doc.$query) {
            try {
              expect(doc.$readPreference).to.deep.equal({ mode: 'primaryPreferred' });
              expect(doc)
                .to.haveOwnProperty('$query')
                .to.haveOwnProperty('lsid')
                .that.is.an('object');
              done();
            } catch (e) {
              done(e);
            }
          } else {
            done('YOU HAVE FAILED. WE WILL FIND ANOTHER WAY. RELEASING CONTROL');
          }
        });

        const mongos = new Mongos([test.server.address()], {
          connectionTimeout: 30000,
          socketTimeout: 30000,
          haInterval: 500,
          size: 1
        });

        mongos.on('error', done);
        mongos.once('connect', () => {
          const namespace = 'testdb.testcollection';
          const findCommand = {
            find: namespace
          };
          const pool = new ServerSessionPool(mongos);
          const session = new ClientSession(mongos, pool);
          const readPreference = new ReadPreference('primaryPreferred');

          const cursor = mongos.cursor('testdb.testcollection', findCommand, {
            session,
            readPreference
          });

          cursor.next(() => {});
        });

        mongos.connect();
      }
    }
  );
});

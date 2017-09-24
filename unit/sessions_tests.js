'use strict';
var expect = require('chai').expect,
  assign = require('../../../lib/utils').assign,
  co = require('co'),
  mock = require('../../mock'),
  ObjectId = require('bson').ObjectId;

function MockReplSetState() {
  this.electionIds = [new ObjectId(), new ObjectId()];
  this.defaultFields = assign({}, mock.DEFAULT_ISMASTER, {
    setName: 'rs',
    setVersion: 1,
    electionId: this.electionIds[0],
    hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
    arbiters: ['localhost:32002']
  });

  this.primary = [
    assign({}, this.defaultFields, {
      ismaster: true,
      secondary: false,
      me: 'localhost:32000',
      primary: 'localhost:32000',
      tags: { loc: 'ny' }
    })
  ];

  this.firstSecondary = [
    assign({}, this.defaultFields, {
      ismaster: false,
      secondary: true,
      me: 'localhost:32001',
      primary: 'localhost:32000',
      tags: { loc: 'sf' }
    })
  ];

  this.arbiter = [
    assign({}, this.defaultFields, {
      ismaster: false,
      secondary: false,
      arbiterOnly: true,
      me: 'localhost:32002',
      primary: 'localhost:32000'
    })
  ];
}

describe('Sessions', function() {
  afterEach(() => mock.cleanup());

  it('should track `logicalSessionTimeoutMinutes` for a single topology', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const Server = this.configuration.mongo.Server;

      co(function*() {
        const mockServer = yield mock.createServer(37019, 'localhost');
        mockServer.setMessageHandler(request => {
          request.reply(
            assign({}, mock.DEFAULT_ISMASTER, {
              logicalSessionTimeoutMinutes: 10
            })
          );
        });

        var client = new Server({ host: 'localhost', port: 37019 });
        client.on('error', done);
        client.once('connect', () => {
          expect(client.logicalSessionTimeoutMinutes).to.equal(10);
          client.destroy();
          done();
        });

        client.connect();
      });
    }
  });

  it('should track `logicalSessionTimeoutMinutes` for a mongos topology', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const Mongos = this.configuration.mongo.Mongos;

      co(function*() {
        const mockServer = yield mock.createServer(37019, 'localhost');
        mockServer.setMessageHandler(request => {
          request.reply(
            assign({}, mock.DEFAULT_ISMASTER, {
              msg: 'isdbgrid',
              logicalSessionTimeoutMinutes: 10
            })
          );
        });

        var mongos = new Mongos([{ host: 'localhost', port: 37019 }], {
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
      });
    }
  });

  it(
    'should track `logicalSessionTimeoutMinutes` for replset topology, choosing the lowest value',
    {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        var ReplSet = this.configuration.mongo.ReplSet;

        const replSetState = new MockReplSetState();
        replSetState.primary[0].logicalSessionTimeoutMinutes = 426;
        replSetState.firstSecondary[0].logicalSessionTimeoutMinutes = 1;
        replSetState.arbiter[0].logicalSessionTimeoutMinutes = 32;

        co(function*() {
          const primaryServer = yield mock.createServer(32000, 'localhost');
          const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          const arbiterServer = yield mock.createServer(32002, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(replSetState.primary[0]);
            }
          });

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(replSetState.firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(replSetState.arbiter[0]);
            }
          });

          var replset = new ReplSet(
            [{ host: '127.0.0.1', port: 32000 }, { host: '127.0.0.1', port: 32001 }],
            {
              setName: 'rs',
              connectionTimeout: 3000,
              socketTimeout: 0,
              haInterval: 100,
              size: 1
            }
          );

          replset.on('error', done);
          replset.once('connect', () => {
            expect(replset.logicalSessionTimeoutMinutes).to.equal(1);
            replset.destroy();
            done();
          });

          replset.connect();
        });
      }
    }
  );

  it('should set `logicalSessionTimeoutMinutes` to `null` if any incoming server is `null`', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet;

      const replSetState = new MockReplSetState();
      replSetState.primary[0].logicalSessionTimeoutMinutes = 426;
      replSetState.firstSecondary[0].logicalSessionTimeoutMinutes = null;
      replSetState.arbiter[0].logicalSessionTimeoutMinutes = 32;

      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(replSetState.primary[0]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(replSetState.firstSecondary[0]);
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(replSetState.arbiter[0]);
          }
        });

        var replset = new ReplSet(
          [{ host: '127.0.0.1', port: 32000 }, { host: '127.0.0.1', port: 32001 }],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 100,
            size: 1
          }
        );

        replset.on('error', done);
        replset.once('connect', () => {
          expect(replset.logicalSessionTimeoutMinutes).to.equal(null);
          replset.destroy();
          done();
        });

        replset.connect();
      });
    }
  });

  it('should default `logicalSessionTimeoutMinutes` to `null` for all topology types', {
    metadata: { requires: { topology: 'single' } },
    test: function() {
      const ReplSet = this.configuration.mongo.ReplSet,
        Mongos = this.configuration.mongo.Mongos,
        Server = this.configuration.mongo.Server;

      const single = new Server();
      expect(single.logicalSessionTimeoutMinutes).to.equal(null);

      const mongos = new Mongos();
      expect(mongos.logicalSessionTimeoutMinutes).to.equal(null);

      const replset = new ReplSet([{ host: '127.0.0.1', port: 32000 }]);
      expect(replset.logicalSessionTimeoutMinutes).to.equal(null);
    }
  });
});

'use strict';
const Topology = require('../../../lib/core/sdam/topology').Topology;
const Server = require('../../../lib/core/sdam/server').Server;
const ServerDescription = require('../../../lib/core/sdam/server_description').ServerDescription;
const mock = require('mongodb-mock-server');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('Topology (unit)', function() {
  it('should successfully process multiple queue processing requests', function(done) {
    const singleNodeIsMaster = Object.assign({}, mock.DEFAULT_ISMASTER, {
      maxWireVersion: 9,
      ismaster: true,
      secondary: false,
      setName: 'rs',
      me: 'a:27017',
      hosts: ['a:27017'],
      logicalSessionTimeoutMinutes: 10
    });

    const topology = new Topology('a:27017', { replicaSet: 'rs' });
    this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
      this.s.state = 'connected';
      this.emit('connect');
      setTimeout(
        () =>
          this.emit('descriptionReceived', new ServerDescription(this.name, singleNodeIsMaster)),
        100
      );
    });

    function simulatedRetryableReadOperation(topology, callback) {
      topology.selectServer('primary', err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', err => {
          expect(err).to.not.exist;

          callback();
        });
      });
    }

    topology.connect(err => {
      expect(err).to.not.exist;
      this.defer(() => topology.close());

      let selected = 0;
      const completionHandler = err => {
        expect(err).to.not.exist;

        selected++;
        if (selected === 3) done();
      };

      // explicitly prevent server selection by reverting to `Unknown`
      const server = topology.s.servers.get('a:27017');
      server.emit('descriptionReceived', new ServerDescription(server.name, null));
      process.nextTick(() => {
        simulatedRetryableReadOperation(topology, completionHandler);
        simulatedRetryableReadOperation(topology, completionHandler);

        setTimeout(() => {
          server.emit(
            'descriptionReceived',
            new ServerDescription(server.name, singleNodeIsMaster)
          );

          simulatedRetryableReadOperation(topology, completionHandler);
        }, 250);
      });
    });
  });

  describe('shouldCheckForSessionSupport', function() {
    beforeEach(function() {
      this.sinon = sinon.sandbox.create();

      // these are mocks we want across all tests
      this.sinon.stub(Server.prototype, 'requestCheck');
      this.sinon
        .stub(Topology.prototype, 'selectServer')
        .callsFake(function(selector, options, callback) {
          setTimeout(() => {
            const server = Array.from(this.s.servers.values())[0];
            callback(null, server);
          }, 50);
        });
    });

    afterEach(function() {
      this.sinon.restore();
    });

    it('should check for sessions if connected to a single server and has no known servers', function(done) {
      const topology = new Topology('someserver:27019');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
        this.s.state = 'connected';
        this.emit('connect');
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.true;
        topology.close(done);
      });
    });

    it('should not check for sessions if connected to a single server', function(done) {
      const topology = new Topology('someserver:27019');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
        this.s.state = 'connected';
        this.emit('connect');

        setTimeout(() => {
          this.emit(
            'descriptionReceived',
            new ServerDescription('someserver:27019', { ok: 1, maxWireVersion: 5 })
          );
        }, 20);
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.false;
        topology.close(done);
      });
    });

    it('should check for sessions if there are no data-bearing nodes', function(done) {
      const topology = new Topology('mongos:27019,mongos:27018,mongos:27017');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
        this.s.state = 'connected';
        this.emit('connect');

        setTimeout(() => {
          this.emit(
            'descriptionReceived',
            new ServerDescription(this.name, { ok: 1, msg: 'isdbgrid', maxWireVersion: 5 })
          );
        }, 20);
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.false;
        topology.close(done);
      });
    });
  });

  describe('black holes', function() {
    let mockServer;
    beforeEach(() => mock.createServer().then(server => (mockServer = server)));
    afterEach(() => mock.cleanup());

    it('should time out operations against servers that have been blackholed', function(done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;

        let initialIsMasterSent = false;
        if ((doc.ismaster || doc.hello) && !initialIsMasterSent) {
          request.reply(mock.DEFAULT_ISMASTER_36);
          initialIsMasterSent = true;
        } else {
          // black hole all other operations
        }
      });

      const topology = new Topology(mockServer.uri());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.command('admin.$cmd', { ping: 1 }, { socketTimeout: 250 }, (err, result) => {
          expect(result).to.not.exist;
          expect(err).to.exist;
          expect(err).to.match(/timed out/);

          topology.close(done);
        });
      });
    });
  });

  describe('error handling', function() {
    let mockServer;
    beforeEach(() => mock.createServer().then(server => (mockServer = server)));
    afterEach(() => mock.cleanup());

    it('should set server to unknown and reset pool on `node is recovering` error', function(done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster || doc.hello) {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER, { maxWireVersion: 9 }));
        } else if (doc.insert) {
          request.reply({ ok: 0, message: 'node is recovering', code: 11600 });
        } else {
          request.reply({ ok: 1 });
        }
      });

      const topology = new Topology(mockServer.uri());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;
          this.defer(() => topology.close());

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          let poolCleared = false;
          topology.on('connectionPoolCleared', () => (poolCleared = true));

          server.command('test.test', { insert: { a: 42 } }, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.eql(serverDescription.error);
            expect(poolCleared).to.be.true;
            done();
          });
        });
      });
    });

    it('should set server to unknown and NOT reset pool on stepdown errors', function(done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster || doc.hello) {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER, { maxWireVersion: 9 }));
        } else if (doc.insert) {
          request.reply({ ok: 0, message: 'not master' });
        } else {
          request.reply({ ok: 1 });
        }
      });

      const topology = new Topology(mockServer.uri());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;
          this.defer(() => topology.close());

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          let poolCleared = false;
          topology.on('connectionPoolCleared', () => (poolCleared = true));

          server.command('test.test', { insert: { a: 42 } }, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.eql(serverDescription.error);
            expect(poolCleared).to.be.false;
            done();
          });
        });
      });
    });

    it('should set server to unknown on non-timeout network error', function(done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster || doc.hello) {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER, { maxWireVersion: 9 }));
        } else if (doc.insert) {
          request.connection.destroy();
        } else {
          request.reply({ ok: 1 });
        }
      });

      const topology = new Topology(mockServer.uri());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;
          this.defer(() => topology.close());

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          server.command('test.test', { insert: { a: 42 } }, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.eql(serverDescription.error);
            expect(server.description.type).to.equal('Unknown');
            done();
          });
        });
      });
    });

    it('should encounter a server selection timeout on garbled server responses', function() {
      const net = require('net');
      const server = net.createServer();
      const p = Promise.resolve();
      server.listen(0, 'localhost', 2, () => {
        server.on('connection', c => c.on('data', () => c.write('garbage_data')));
        const address = server.address();
        const client = this.configuration.newClient(
          `mongodb://${address.address}:${address.port}`,
          { serverSelectionTimeoutMS: 1000 }
        );
        p.then(() =>
          client
            .connect()
            .then(() => {
              server.close();
              client.close();
              expect.fail('Should throw a server selection error!');
            })
            .catch(error => {
              server.close();
              const closePromise = client.close();
              expect(error).to.exist;
              return closePromise;
            })
        );
      });
      return p;
    });
  });
});

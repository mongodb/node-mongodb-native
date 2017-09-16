'use strict';
var expect = require('chai').expect,
  co = require('co'),
  assign = require('../../../../lib/utils').assign,
  Connection = require('../../../../lib/connection/connection'),
  mock = require('../../../mock'),
  ConnectionSpy = require('../shared').ConnectionSpy;

describe('ReplSet Connection Tests (mocks)', function() {
  it('Successful connection to replicaset of 1 primary, 1 secondary and 1 arbiter', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var arbiterServer = null;
      var electionIds = [new ObjectId(), new ObjectId()];

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      };

      // Primary server states
      var primary = [
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function*() {
        primaryServer = yield mock.createServer(32000, 'localhost');
        firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          }
        });
      });

      const spy = new ConnectionSpy();
      Connection.enableConnectionAccounting(spy);

      // Attempt to connect
      var server = new ReplSet(
        [
          { host: 'localhost', port: 32000 },
          { host: 'localhost', port: 32001 },
          { host: 'localhost', port: 32002 }
        ],
        {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        }
      );

      server.on('joined', function(_type) {
        if (_type === 'arbiter' || _type === 'secondary' || _type === 'primary') {
          if (
            server.s.replicaSetState.secondaries.length === 1 &&
            server.s.replicaSetState.arbiters.length === 1 &&
            server.s.replicaSetState.primary
          ) {
            expect(server.s.replicaSetState.secondaries).to.have.length(1);
            expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');

            expect(server.s.replicaSetState.arbiters).to.have.length(1);
            expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');

            expect(server.s.replicaSetState.primary).to.not.be.null;
            expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

            mock.cleanup([primaryServer, firstSecondaryServer, arbiterServer, server], spy, () => {
              Connection.disableConnectionAccounting();
              done();
            });
          }
        }
      });

      server.on('connect', function() {
        server.__connected = true;
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it(
    'Successful connection to replicaset of 1 primary, 1 secondary and 1 arbiter using arbiter as seed',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var ReplSet = this.configuration.mongo.ReplSet,
          ObjectId = this.configuration.mongo.BSON.ObjectId;

        // Contain mock server
        var primaryServer = null;
        var firstSecondaryServer = null;
        var arbiterServer = null;
        var electionIds = [new ObjectId(), new ObjectId()];

        // Default message fields
        var defaultFields = {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 4,
          minWireVersion: 0,
          ok: 1,
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        };

        // Primary server states
        var primary = [
          assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000',
            tags: { loc: 'ny' }
          })
        ];

        // Primary server states
        var firstSecondary = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function*() {
          primaryServer = yield mock.createServer(32000, 'localhost');
          firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          arbiterServer = yield mock.createServer(32002, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(primary[0]);
            }
          });

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(arbiter[0]);
            }
          });
        });

        const spy = new ConnectionSpy();
        Connection.enableConnectionAccounting(spy);

        // Attempt to connect
        var server = new ReplSet([{ host: 'localhost', port: 32002 }], {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        });

        server.on('joined', function(_type) {
          if (_type === 'arbiter' || _type === 'secondary' || _type === 'primary') {
            if (
              server.s.replicaSetState.secondaries.length === 1 &&
              server.s.replicaSetState.arbiters.length === 1 &&
              server.s.replicaSetState.primary
            ) {
              expect(server.s.replicaSetState.secondaries).to.have.length(1);
              expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');

              expect(server.s.replicaSetState.arbiters).to.have.length(1);
              expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');

              expect(server.s.replicaSetState.primary).to.not.be.null;
              expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

              mock.cleanup(
                [primaryServer, firstSecondaryServer, arbiterServer, server],
                spy,
                () => {
                  Connection.disableConnectionAccounting();
                  done();
                }
              );
            }
          }
        });

        server.on('connect', function() {
          server.__connected = true;
        });

        // Gives proxies a chance to boot up
        setTimeout(function() {
          server.connect();
        }, 100);
      }
    }
  );

  it('Successful connection to replicaset of 1 primary, 1 secondary but missing arbiter', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var electionIds = [new ObjectId(), new ObjectId()];

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      };

      // Primary server states
      var primary = [
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Boot the mock
      co(function*() {
        primaryServer = yield mock.createServer(32000, 'localhost');
        firstSecondaryServer = yield mock.createServer(32001, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        });
      });

      const spy = new ConnectionSpy();
      Connection.enableConnectionAccounting(spy);

      // Attempt to connect
      var server = new ReplSet(
        [
          { host: 'localhost', port: 32000 },
          { host: 'localhost', port: 32001 },
          { host: 'localhost', port: 32002 }
        ],
        {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        }
      );

      // Number of events
      var numberOfEvents = 0;

      // Validations
      function validations() {
        expect(server.s.replicaSetState.secondaries).to.have.length(1);
        expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');

        expect(server.s.replicaSetState.arbiters).to.have.length(0);

        expect(server.s.replicaSetState.primary).to.not.be.null;
        expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

        mock.cleanup([primaryServer, firstSecondaryServer, server], spy, () => {
          Connection.disableConnectionAccounting();
          done();
        });
      }

      // Joined
      server.on('joined', function() {
        numberOfEvents = numberOfEvents + 1;
        if (numberOfEvents === 3) validations();
      });

      server.on('failed', function() {
        numberOfEvents = numberOfEvents + 1;
        if (numberOfEvents === 3) validations();
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it('Fail to connect due to missing primary', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var firstSecondaryServer = null;
      var electionIds = [new ObjectId(), new ObjectId()];

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      };

      // Primary server states
      var firstSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Boot the mock
      co(function*() {
        firstSecondaryServer = yield mock.createServer(32001, 'localhost');

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        });
      });

      const spy = new ConnectionSpy();
      Connection.enableConnectionAccounting(spy);

      // Attempt to connect
      var server = new ReplSet(
        [
          { host: 'localhost', port: 32000 },
          { host: 'localhost', port: 32001 },
          { host: 'localhost', port: 32002 }
        ],
        {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        }
      );

      server.on('error', function() {
        mock.cleanup([server, firstSecondaryServer], spy, () => {
          Connection.disableConnectionAccounting();
          done();
        });
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it(
    'Successful connection to replicaset of 0 primary, 1 secondary and 1 arbiter with secondaryOnlyConnectionAllowed',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var ReplSet = this.configuration.mongo.ReplSet,
          ObjectId = this.configuration.mongo.BSON.ObjectId;

        // Contain mock server
        var firstSecondaryServer = null;
        var arbiterServer = null;
        var electionIds = [new ObjectId(), new ObjectId()];

        // Default message fields
        var defaultFields = {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 4,
          minWireVersion: 0,
          ok: 1,
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        };

        // Primary server states
        var firstSecondary = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function*() {
          firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          arbiterServer = yield mock.createServer(32002, 'localhost');

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(arbiter[0]);
            }
          });
        });

        const spy = new ConnectionSpy();
        Connection.enableConnectionAccounting(spy);

        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 },
            { host: 'localhost', port: 32002 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 100,
            size: 1,
            secondaryOnlyConnectionAllowed: true
          }
        );

        server.on('joined', function() {
          if (
            server.s.replicaSetState.secondaries.length === 1 &&
            server.s.replicaSetState.arbiters.length === 1
          ) {
            expect(server.s.replicaSetState.secondaries).to.have.length(1);
            expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');

            expect(server.s.replicaSetState.arbiters).to.have.length(1);
            expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');

            expect(server.s.replicaSetState.primary).to.be.null;

            mock.cleanup([firstSecondaryServer, arbiterServer, server], spy, () => {
              Connection.disableConnectionAccounting();
              done();
            });
          }
        });

        server.on('connect', function() {
          server.__connected = true;
        });

        // Gives proxies a chance to boot up
        setTimeout(function() {
          server.connect();
        }, 100);
      }
    }
  );

  it(
    'Successful connection to replicaset of 1 primary, 1 secondary and 1 arbiter with secondaryOnlyConnectionAllowed',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var ReplSet = this.configuration.mongo.ReplSet,
          ObjectId = this.configuration.mongo.BSON.ObjectId;

        // Contain mock server
        var primaryServer = null;
        var firstSecondaryServer = null;
        var arbiterServer = null;
        var electionIds = [new ObjectId(), new ObjectId()];

        // Default message fields
        var defaultFields = {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 4,
          minWireVersion: 0,
          ok: 1,
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        };

        // Primary server states
        var primary = [
          assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000',
            tags: { loc: 'ny' }
          })
        ];

        // Primary server states
        var firstSecondary = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function*() {
          primaryServer = yield mock.createServer(32000, 'localhost');
          firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          arbiterServer = yield mock.createServer(32002, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(primary[0]);
            }
          });

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(arbiter[0]);
            }
          });
        });

        const spy = new ConnectionSpy();
        Connection.enableConnectionAccounting(spy);

        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 },
            { host: 'localhost', port: 32002 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 100,
            size: 1,
            secondaryOnlyConnectionAllowed: true
          }
        );

        server.on('joined', function(_type) {
          if (_type === 'arbiter' || _type === 'secondary' || _type === 'primary') {
            if (
              server.s.replicaSetState.secondaries.length === 1 &&
              server.s.replicaSetState.arbiters.length === 1 &&
              server.s.replicaSetState.primary
            ) {
              expect(server.s.replicaSetState.secondaries).to.have.length(1);
              expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');

              expect(server.s.replicaSetState.arbiters).to.have.length(1);
              expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');

              expect(server.s.replicaSetState.primary).to.not.be.null;
              expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

              mock.cleanup(
                [primaryServer, firstSecondaryServer, arbiterServer, server],
                spy,
                () => {
                  Connection.disableConnectionAccounting();
                  done();
                }
              );
            }
          }
        });

        server.on('connect', function() {
          server.__connected = true;
        });

        // Gives proxies a chance to boot up
        setTimeout(function() {
          server.connect();
        }, 100);
      }
    }
  );

  it('Should print socketTimeout warning due to socketTimeout < haInterval', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var arbiterServer = null;
      var electionIds = [new ObjectId(), new ObjectId()];

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      };

      // Primary server states
      var primary = [
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function*() {
        primaryServer = yield mock.createServer(32000, 'localhost');
        firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          }
        });
      });

      const spy = new ConnectionSpy();
      Connection.enableConnectionAccounting(spy);

      // Attempt to connect
      var server = new ReplSet(
        [
          { host: 'localhost', port: 32000 },
          { host: 'localhost', port: 32001 },
          { host: 'localhost', port: 32002 }
        ],
        {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 2000,
          haInterval: 5000,
          size: 1
        }
      );

      server.on('error', function() {
        mock.cleanup([primaryServer, firstSecondaryServer, arbiterServer, server], spy, () => {
          Connection.disableConnectionAccounting();
          done();
        });
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it('Should connect with a replicaset with a single primary and secondary', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var electionIds = [new ObjectId(), new ObjectId()];

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      };

      // Primary server states
      var primary = [
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Boot the mock
      co(function*() {
        primaryServer = yield mock.createServer(32000, 'localhost');
        firstSecondaryServer = yield mock.createServer(32001, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        });
      });

      const spy = new ConnectionSpy();
      Connection.enableConnectionAccounting(spy);

      // Attempt to connect
      var server = new ReplSet(
        [{ host: 'localhost', port: 32000 }, { host: 'localhost', port: 32001 }],
        {
          setName: 'rs',
          connectionTimeout: 5000,
          socketTimeout: 10000,
          haInterval: 100,
          size: 1
        }
      );

      server.on('joined', function(_type) {
        if (_type === 'secondary' || _type === 'primary') {
          if (
            server.s.replicaSetState.secondaries.length === 1 &&
            server.s.replicaSetState.primary
          ) {
            expect(server.s.replicaSetState.secondaries).to.have.length(1);
            expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');

            expect(server.s.replicaSetState.primary).to.not.be.null;
            expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

            mock.cleanup([primaryServer, firstSecondaryServer, server], spy, () => {
              Connection.disableConnectionAccounting();
              done();
            });
          }
        }
      });

      server.on('connect', function() {
        server.__connected = true;
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it(
    'Successful connection to replicaset of 1 primary, 1 secondary and 1 arbiter with different seedlist names',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var ReplSet = this.configuration.mongo.ReplSet,
          ObjectId = this.configuration.mongo.BSON.ObjectId;

        // Contain mock server
        var primaryServer = null;
        var firstSecondaryServer = null;
        var arbiterServer = null;
        var electionIds = [new ObjectId(), new ObjectId()];

        // Default message fields
        var defaultFields = {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 4,
          minWireVersion: 0,
          ok: 1,
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        };

        // Primary server states
        var primary = [
          assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000',
            tags: { loc: 'ny' }
          })
        ];

        // Primary server states
        var firstSecondary = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function*() {
          primaryServer = yield mock.createServer(32000, 'localhost');
          firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          arbiterServer = yield mock.createServer(32002, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(primary[0]);
            }
          });

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(arbiter[0]);
            }
          });
        });

        const spy = new ConnectionSpy();
        Connection.enableConnectionAccounting(spy);

        // Attempt to connect
        var server = new ReplSet(
          [{ host: '127.0.0.1', port: 32002 }, { host: '127.0.0.1', port: 32001 }],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 100,
            size: 1
          }
        );

        server.on('joined', function(_type) {
          if (_type === 'arbiter' || _type === 'secondary' || _type === 'primary') {
            if (
              server.s.replicaSetState.secondaries.length === 1 &&
              server.s.replicaSetState.arbiters.length === 1 &&
              server.s.replicaSetState.primary
            ) {
              expect(server.s.replicaSetState.secondaries).to.have.length(1);
              expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');

              expect(server.s.replicaSetState.arbiters).to.have.length(1);
              expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');

              expect(server.s.replicaSetState.primary).to.not.be.null;
              expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

              mock.cleanup(
                [primaryServer, firstSecondaryServer, arbiterServer, server],
                spy,
                () => {
                  Connection.disableConnectionAccounting();
                  done();
                }
              );
            }
          }
        });

        server.on('connect', function() {
          server.__connected = true;
        });

        // Gives proxies a chance to boot up
        setTimeout(function() {
          server.connect();
        }, 100);
      }
    }
  );

  it('Successful connection to replicaset of 1 primary, 0 secondary and 1 arbiter', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var arbiterServer = null;
      var electionIds = [new ObjectId(), new ObjectId()];

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      };

      var primary = [
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      var arbiter = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function*() {
        primaryServer = yield mock.createServer(32000, 'localhost');
        arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          }
        });
      });

      const spy = new ConnectionSpy();
      Connection.enableConnectionAccounting(spy);

      // Attempt to connect
      var server = new ReplSet([{ host: 'localhost', port: 32000 }], {
        setName: 'rs',
        connectionTimeout: 3000,
        socketTimeout: 0,
        haInterval: 100,
        size: 1
      });

      server.on('joined', function(_type) {
        if (_type === 'arbiter' || _type === 'secondary' || _type === 'primary') {
          if (server.s.replicaSetState.arbiters.length === 1 && server.s.replicaSetState.primary) {
            expect(server.s.replicaSetState.arbiters).to.have.length(1);
            expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');

            expect(server.s.replicaSetState.primary).to.not.be.null;
            expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

            mock.cleanup([primaryServer, arbiterServer, server], spy, () => {
              Connection.disableConnectionAccounting();
              done();
            });
          }
        }
      });

      server.on('error', done);
      server.on('connect', function() {
        server.__connected = true;
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it(
    'Successful connection to replicaset of 1 primary, 1 secondary and 1 arbiter with single seed should emit fullsetup and all',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var ReplSet = this.configuration.mongo.ReplSet,
          ObjectId = this.configuration.mongo.BSON.ObjectId;

        // Contain mock server
        var primaryServer = null;
        var firstSecondaryServer = null;
        var arbiterServer = null;
        var electionIds = [new ObjectId(), new ObjectId()];

        // Default message fields
        var defaultFields = {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 4,
          minWireVersion: 0,
          ok: 1,
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        };

        // Primary server states
        var primary = [
          assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000',
            tags: { loc: 'ny' }
          })
        ];

        // Primary server states
        var firstSecondary = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function*() {
          primaryServer = yield mock.createServer(32000, 'localhost');
          firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          arbiterServer = yield mock.createServer(32002, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(primary[0]);
            }
          });

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(arbiter[0]);
            }
          });
        });

        const spy = new ConnectionSpy();
        Connection.enableConnectionAccounting(spy);

        // Attempt to connect
        var server = new ReplSet([{ host: 'localhost', port: 32000 }], {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        });

        server.on('fullsetup', function() {
          server.__fullsetup = true;
        });

        server.on('all', function() {
          expect(server.__connected).to.be.true;
          expect(server.__fullsetup).to.be.true;

          mock.cleanup([primaryServer, firstSecondaryServer, arbiterServer, server], spy, () => {
            Connection.disableConnectionAccounting();
            done();
          });
        });

        server.on('connect', function() {
          server.__connected = true;
        });

        // Gives proxies a chance to boot up
        setTimeout(function() {
          server.connect();
        }, 100);
      }
    }
  );

  it(
    'Correctly return lastIsMaster when connected to a secondary only for a replicaset connection',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var ReplSet = this.configuration.mongo.ReplSet,
          ObjectId = this.configuration.mongo.BSON.ObjectId;

        // Contain mock server
        var firstSecondaryServer = null;
        var arbiterServer = null;
        var electionIds = [new ObjectId(), new ObjectId()];

        // Default message fields
        var defaultFields = {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 4,
          minWireVersion: 0,
          ok: 1,
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        };

        // Primary server states
        var firstSecondary = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function*() {
          firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          arbiterServer = yield mock.createServer(32002, 'localhost');

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(arbiter[0]);
            }
          });
        });

        const spy = new ConnectionSpy();
        Connection.enableConnectionAccounting(spy);

        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 },
            { host: 'localhost', port: 32002 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 100,
            size: 1,
            secondaryOnlyConnectionAllowed: true
          }
        );

        server.on('connect', function() {
          server.__connected = true;

          var result = server.lastIsMaster();
          expect(result).to.exist;

          mock.cleanup([firstSecondaryServer, arbiterServer, server], spy, () => {
            Connection.disableConnectionAccounting();
            done();
          });
        });

        // Gives proxies a chance to boot up
        setTimeout(function() {
          server.connect();
        }, 100);
      }
    }
  );
});

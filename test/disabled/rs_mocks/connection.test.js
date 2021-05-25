'use strict';
const expect = require('chai').expect;
const co = require('co');
const mock = require('mongodb-mock-server');
const ConnectionSpy = require('../shared').ConnectionSpy;

const core = require('../../../../src/core');
const Connection = core.Connection;
const ReplSet = core.ReplSet;
const ObjectId = core.BSON.ObjectId;

let test = {};
describe('ReplSet Connection Tests (mocks)', function () {
  beforeEach(() => {
    test.spy = new ConnectionSpy();
    Connection.enableConnectionAccounting(test.spy);
  });

  afterEach(() => {
    return mock.cleanup(test.spy).then(() => {
      test.spy = undefined;
      Connection.disableConnectionAccounting();
    });
  });

  it('Successful connection to replicaset of 1 primary, 1 secondary and 1 arbiter', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var electionIds = [new ObjectId(), new ObjectId()];

      // Default message fields
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(primary[0]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(firstSecondary[0]);
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(arbiter[0]);
          }
        });

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

            size: 1
          }
        );

        server.on('joined', function (_type) {
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

              server.destroy();
              done();
            }
          }
        });

        server.connect();
      });
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

      test: function (done) {
        var electionIds = [new ObjectId(), new ObjectId()];
        var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        });

        // Primary server states
        var primary = [
          Object.assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000',
            tags: { loc: 'ny' }
          })
        ];

        // Primary server states
        var firstSecondary = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function* () {
          const primaryServer = yield mock.createServer(32000, 'localhost');
          const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          const arbiterServer = yield mock.createServer(32002, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(primary[0]);
            }
          });

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(arbiter[0]);
            }
          });

          // Attempt to connect
          var server = new ReplSet([{ host: 'localhost', port: 32002 }], {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,

            size: 1
          });

          server.on('joined', function (_type) {
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

                server.destroy();
                done();
              }
            }
          });

          server.connect();
        });
      }
    }
  );

  it('Successful connection to replicaset of 1 primary, 1 secondary but missing arbiter', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        os: '!win32' // NODE-2943: timeout on windows
      }
    },

    test: function (done) {
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(primary[0]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(firstSecondary[0]);
          }
        });

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

          server.destroy();
          done();
        }

        // Joined
        server.on('joined', function () {
          numberOfEvents = numberOfEvents + 1;
          if (numberOfEvents === 3) validations();
        });

        server.on('failed', function () {
          numberOfEvents = numberOfEvents + 1;
          if (numberOfEvents === 3) validations();
        });

        server.connect();
      });
    }
  });

  it('Fail to connect due to missing primary', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single',
        os: '!win32' // NODE-2943: timeout on windows
      }
    },

    test: function (done) {
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Boot the mock
      co(function* () {
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(firstSecondary[0]);
          }
        });

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

            size: 1
          }
        );

        server.on('error', function () {
          server.destroy();
          done();
        });

        server.connect();
      });
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

      test: function (done) {
        var electionIds = [new ObjectId(), new ObjectId()];
        var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        });

        // Primary server states
        var firstSecondary = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function* () {
          const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          const arbiterServer = yield mock.createServer(32002, 'localhost');

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(arbiter[0]);
            }
          });

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

              size: 1,
              secondaryOnlyConnectionAllowed: true
            }
          );

          server.on('joined', function () {
            if (
              server.s.replicaSetState.secondaries.length === 1 &&
              server.s.replicaSetState.arbiters.length === 1
            ) {
              expect(server.s.replicaSetState.secondaries).to.have.length(1);
              expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');

              expect(server.s.replicaSetState.arbiters).to.have.length(1);
              expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');

              expect(server.s.replicaSetState.primary).to.be.null;

              server.destroy();
              done();
            }
          });

          server.connect();
        });
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

      test: function (done) {
        var electionIds = [new ObjectId(), new ObjectId()];
        var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        });

        // Primary server states
        var primary = [
          Object.assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000',
            tags: { loc: 'ny' }
          })
        ];

        // Primary server states
        var firstSecondary = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function* () {
          const primaryServer = yield mock.createServer(32000, 'localhost');
          const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          const arbiterServer = yield mock.createServer(32002, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(primary[0]);
            }
          });

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(arbiter[0]);
            }
          });

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

              size: 1,
              secondaryOnlyConnectionAllowed: true
            }
          );

          server.on('joined', function (_type) {
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

                server.destroy();
                done();
              }
            }
          });

          server.connect();
        });
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

    test: function (done) {
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(primary[0]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(firstSecondary[0]);
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(arbiter[0]);
          }
        });

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

            size: 1
          }
        );

        server.on('error', function () {
          server.destroy();
          done();
        });

        // Gives proxies a chance to boot up
        setTimeout(function () {
          server.connect();
        }, 100);
      });
    }
  });

  it('Should connect with a replicaset with a single primary and secondary', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(primary[0]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(firstSecondary[0]);
          }
        });

        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 5000,
            socketTimeout: 10000,

            size: 1
          }
        );

        server.on('joined', function (_type) {
          if (_type === 'secondary' || _type === 'primary') {
            if (
              server.s.replicaSetState.secondaries.length === 1 &&
              server.s.replicaSetState.primary
            ) {
              expect(server.s.replicaSetState.secondaries).to.have.length(1);
              expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');

              expect(server.s.replicaSetState.primary).to.not.be.null;
              expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

              server.destroy();
              done();
            }
          }
        });

        server.connect();
      });
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

      test: function (done) {
        var electionIds = [new ObjectId(), new ObjectId()];
        var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        });

        // Primary server states
        var primary = [
          Object.assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000',
            tags: { loc: 'ny' }
          })
        ];

        // Primary server states
        var firstSecondary = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function* () {
          const primaryServer = yield mock.createServer(32000, 'localhost');
          const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          const arbiterServer = yield mock.createServer(32002, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(primary[0]);
            }
          });

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(arbiter[0]);
            }
          });

          // Attempt to connect
          var server = new ReplSet(
            [
              { host: '127.0.0.1', port: 32002 },
              { host: '127.0.0.1', port: 32001 }
            ],
            {
              setName: 'rs',
              connectionTimeout: 3000,
              socketTimeout: 0,

              size: 1
            }
          );

          server.on('joined', function (_type) {
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

                server.destroy();
                done();
              }
            }
          });

          server.connect();
        });
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

    test: function (done) {
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      var arbiter = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(primary[0]);
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(arbiter[0]);
          }
        });

        // Attempt to connect
        var server = new ReplSet([{ host: 'localhost', port: 32000 }], {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,

          size: 1
        });

        server.on('error', done);
        server.on('joined', function (_type) {
          if (_type === 'arbiter' || _type === 'secondary' || _type === 'primary') {
            if (
              server.s.replicaSetState.arbiters.length === 1 &&
              server.s.replicaSetState.primary
            ) {
              expect(server.s.replicaSetState.arbiters).to.have.length(1);
              expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');

              expect(server.s.replicaSetState.primary).to.not.be.null;
              expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

              server.destroy();
              done();
            }
          }
        });

        server.connect();
      });
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

      test: function (done) {
        var electionIds = [new ObjectId(), new ObjectId()];
        var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        });

        // Primary server states
        var primary = [
          Object.assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000',
            tags: { loc: 'ny' }
          })
        ];

        // Primary server states
        var firstSecondary = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function* () {
          const primaryServer = yield mock.createServer(32000, 'localhost');
          const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          const arbiterServer = yield mock.createServer(32002, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(primary[0]);
            }
          });

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(arbiter[0]);
            }
          });

          // Attempt to connect
          var server = new ReplSet([{ host: 'localhost', port: 32000 }], {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,

            size: 1
          });

          server.on('fullsetup', function () {
            server.__fullsetup = true;
          });

          server.on('connect', function () {
            server.__connected = true;
          });

          server.on('all', function () {
            expect(server.__connected).to.be.true;
            expect(server.__fullsetup).to.be.true;

            server.destroy();
            done();
          });

          server.connect();
        });
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

      test: function (done) {
        var electionIds = [new ObjectId(), new ObjectId()];
        var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          arbiters: ['localhost:32002']
        });

        // Primary server states
        var firstSecondary = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          })
        ];

        // Primary server states
        var arbiter = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          })
        ];

        // Boot the mock
        co(function* () {
          const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          const arbiterServer = yield mock.createServer(32002, 'localhost');

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(firstSecondary[0]);
            }
          });

          arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(arbiter[0]);
            }
          });

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

              size: 1,
              secondaryOnlyConnectionAllowed: true
            }
          );

          server.on('connect', function () {
            var result = server.lastIsMaster();
            expect(result).to.exist;

            server.destroy();
            done();
          });

          server.connect();
        });
      }
    }
  );
});

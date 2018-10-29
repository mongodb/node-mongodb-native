'use strict';
var test = require('./shared').assert;
var co = require('co');
var mock = require('mongodb-mock-server');

var extend = function(template, fields) {
  var object = {};
  for (var name in template) {
    object[name] = template[name];
  }

  for (var fieldName in fields) {
    object[fieldName] = fields[name];
  }

  return object;
};

describe.skip('Buffering Proxy', function() {
  afterEach(() => mock.cleanup());

  it('successfully handle buffering store execution for primary server', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var configuration = this.configuration,
        ObjectId = configuration.require.ObjectId,
        ReadPreference = configuration.require.ReadPreference;

      var currentIsMasterIndex = 0;
      var electionIds = [new ObjectId(0), new ObjectId(1)];

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
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        }),
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        }),
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32000',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32001',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
        })
      ];

      // Primary server states
      var secondSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
        })
      ];

      // Die
      var die = false;
      var dieSecondary = false;

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;

          if (die) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            } else if (doc.insert) {
              request.reply({ ok: 1, n: 1 });
            } else if (doc.aggregate) {
              request.reply({ ok: 1, n: 1 });
            } else if (doc.endSessions) {
              request.reply({ ok: 1 });
            }
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;

          if (die || dieSecondary) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterIndex]);
            } else if (doc.endSessions) {
              request.reply({ ok: 1 });
            }
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;

          if (die || dieSecondary) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterIndex]);
            } else if (doc.endSessions) {
              request.reply({ ok: 1 });
            }
          }
        });

        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs',
          {
            socketTimeoutMS: 2000,
            haInterval: 1000
          }
        );

        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);
          var results = [];

          setTimeout(function() {
            die = true;
            dieSecondary = true;

            setTimeout(function() {
              db.collection('test').insertOne({ a: 1 }, function(err) {
                test.equal(null, err);
                results.push('insertOne');
              });

              db.command(
                { count: 'test', query: {} },
                { readPreference: new ReadPreference(ReadPreference.SECONDARY) },
                function(err) {
                  test.equal(null, err);
                  results.push('count');
                }
              );

              db
                .collection('test')
                .aggregate([{ $match: {} }])
                .toArray(function(err) {
                  test.equal(null, err);
                  results.push('aggregate');
                });

              db
                .collection('test')
                .find({})
                .setReadPreference(new ReadPreference(ReadPreference.SECONDARY))
                .toArray(function(err) {
                  test.equal(null, err);
                  results.push('find');
                });

              setTimeout(function() {
                die = false;

                setTimeout(function() {
                  test.deepEqual(['insertOne', 'aggregate'].sort(), results.sort());

                  client.close();
                  // test.deepEqual(['insertOne', 'aggregate', 'count', 'find'], results);
                  done();
                }, 1000);
              }, 1000);
            }, 3000);
          }, 1000);
        });
      });
    }
  });

  it('successfully handle buffering store execution for secondary server', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var configuration = this.configuration,
        ObjectId = configuration.require.ObjectId,
        ReadPreference = configuration.require.ReadPreference;

      var currentIsMasterIndex = 0;
      var electionIds = [new ObjectId(0), new ObjectId(1)];

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
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        }),
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        }),
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32000',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32001',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
        })
      ];

      // Primary server states
      var secondSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
        })
      ];

      // Die
      var die = false;
      var diePrimary = false;

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;

          if (die || diePrimary) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            } else if (doc.endSessions) {
              request.reply({ ok: 1 });
            }
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;

          if (die) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterIndex]);
            } else if (doc.count) {
              request.reply({ ok: 1, n: 10 });
            } else if (doc.find) {
              request.reply({ ok: 1, n: 10 });
            } else if (doc.endSessions) {
              request.reply({ ok: 1 });
            }
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;

          if (die) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterIndex]);
            } else if (doc.count) {
              request.reply({ ok: 1, n: 10 });
            } else if (doc.find) {
              request.reply({ ok: 1, n: 10 });
            } else if (doc.endSessions) {
              request.reply({ ok: 1 });
            }
          }
        });

        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs',
          {
            socketTimeoutMS: 2000,
            haInterval: 1000
          }
        );

        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          setTimeout(function() {
            die = true;
            diePrimary = true;

            setTimeout(function() {
              var results = [];

              db.collection('test').insertOne({ a: 1 }, function(err) {
                test.equal(null, err);
                results.push('insertOne');
              });

              db.command(
                { count: 'test', query: {} },
                { readPreference: new ReadPreference(ReadPreference.SECONDARY) },
                function(err) {
                  test.equal(null, err);
                  results.push('count');
                }
              );

              db
                .collection('test')
                .aggregate([{ $match: {} }])
                .toArray(function(err) {
                  test.equal(null, err);
                  results.push('aggregate');
                });

              db
                .collection('test')
                .find({})
                .setReadPreference(new ReadPreference(ReadPreference.SECONDARY))
                .toArray(function(err) {
                  test.equal(null, err);
                  results.push('find');
                });

              setTimeout(function() {
                die = false;

                setTimeout(function() {
                  test.deepEqual(['count', 'find'].sort(), results.sort());

                  client.close();

                  // test.deepEqual(['count', 'find', 'insertOne', 'aggregate'], results);
                  done();
                }, 1500);
              }, 1000);
            }, 3000);
          }, 1000);
        });
      });
    }
  });
});

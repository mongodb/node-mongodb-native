'use strict';

var expect = require('chai').expect;

/**************************************************************************
 *
 * SERVER TESTS
 *
 *************************************************************************/
describe('Server operation example tests', function() {
  /**
   * Correctly insert a document using the Server insert method
   *
   * @example-class Server
   * @example-method insert
   * @ignore
   */
  it('simple insert into db',  {
    metadata: {
      requires: {
        topology: 'single'
      }
    },

    test: function(done) {
      var Server = this.configuration.mongo.Server,
          ReadPreference = this.configuration.mongo.ReadPreference;

      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        reconnect: true,
        reconnectInterval: 50
      });

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new Server({host: 'localhost', port: 27017});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example1', [{a: 1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(err, results) {
          expect(err).to.be.null;
          expect(results.result.n).to.equal(1);

          _server.destroy();
          done();
        });
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly update a document using the Server update method
   *
   * @example-class Server
   * @example-method update
   * @ignore
   */
  it('update using Server instance',  {
    metadata: {
      requires: {
        topology: 'single'
      }
    },

    test: function(done) {
      var Server = this.configuration.require.Server,
          ReadPreference = this.configuration.require.ReadPreference;

      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        reconnect: true,
        reconnectInterval: 50
      });

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new Server({host: 'localhost', port: 27017});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example2', [{a: 1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(err, results) {
          expect(err).to.be.null;
          expect(results.result.n).to.equal(1);

          // Execute the write
          _server.update('integration_tests.inserts_example2', [{
            q: {a: 1}, u: {'$set': {b: 1}}
          }], {
            writeConcern: {w: 1}, ordered: true
          }, function(updateErr, updateResults) {
            expect(updateErr).to.be.null;
            expect(updateResults.result.n).to.equal(1);

            _server.destroy();
            done();
          });
        });
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly remove a document using the Server remove method
   *
   * @example-class Server
   * @example-method remove
   * @ignore
   */
  it('remove using Server instance',  {
    metadata: {
      requires: {
        topology: 'single'
      }
    },

    test: function(done) {
      var Server = this.configuration.require.Server,
          ReadPreference = this.configuration.require.ReadPreference;

      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        reconnect: true,
        reconnectInterval: 50
      });

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new Server({host: 'localhost', port: 27017});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example3', [{a: 1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(err, results) {
          expect(err).to.be.null;
          expect(results.result.n).to.equal(1);

          // Execute the write
          _server.remove('integration_tests.inserts_example3', [{
            q: {a: 1}, limit: 1
          }], {
            writeConcern: {w: 1}, ordered: true
          }, function(removeErr, removeResults) {
            expect(removeErr).to.be.null;
            expect(removeResults.result.n).to.equal(1);

            _server.destroy();
            done();
          });
        });
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly find a document on the Server using the cursor
   *
   * @example-class Server
   * @example-method cursor
   * @ignore
   */
  it('cursor using Server instance',  {
    metadata: {
      requires: {
        topology: 'single'
      }
    },

    test: function(done) {
      var Server = this.configuration.require.Server,
          ReadPreference = this.configuration.require.ReadPreference;

      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        reconnect: true,
        reconnectInterval: 50
      });

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new Server({host: 'localhost', port: 27017});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example4', [{a: 1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(err, results) {
          expect(err).to.be.null;
          expect(results.result.n).to.equal(1);

          // Execute the write
          var cursor = _server.cursor('integration_tests.inserts_example4', {
            find: 'integration_tests.example4',
            query: {a: 1}
          });

          // Get the first document
          cursor.next(function(cursorErr, doc) {
            expect(cursorErr).to.be.null;
            expect(doc.a).to.equal(1);

            _server.destroy();
            done();
          });
        });
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly execute ismaster command on the Server using the cursor
   *
   * @example-class Server
   * @example-method command
   * @ignore
   */
  it('command using Server instance',  {
    metadata: {
      requires: {
        topology: 'single'
      }
    },

    test: function(done) {
      var Server = this.configuration.require.Server,
          ReadPreference = this.configuration.require.ReadPreference;

      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        reconnect: true,
        reconnectInterval: 50
      });

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new Server({host: 'localhost', port: 27017});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the command
        _server.command('system.$cmd', {ismaster: true}, function(err, result) {
          expect(err).to.be.null;
          _server.destroy();
          done();
        });
      });

      // Start connection
      server.connect();
      // END
    }
  });
});

/**************************************************************************
 *
 * REPLSET TESTS
 *
 *************************************************************************/

describe('Replset operation example tests', function() {
  /**
   * Correctly insert a document using the ReplSet insert method
   *
   * @example-class ReplSet
   * @example-method insert
   * @ignore
   */
  it('simple insert into db using ReplSet',  {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.require.ReplSet,
          ReadPreference = this.configuration.require.ReadPreference;

      var config = [{
        host: this.configuration.host,
        port: this.configuration.port
      }];

      var options = {
        setName: this.configuration.setName
      };

      // Attempt to connect
      var server = new ReplSet(config, options);

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new ReplSet([{host: 'localhost', port:31000}], {setName:'rs'});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example_replset_1', [{a:1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(err, results) {
          expect(err).to.be.null;
          expect(results.result.n).to.equal(1);

          _server.destroy();
          done();
        });
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly update a document using the Server update method
   *
   * @example-class ReplSet
   * @example-method update
   * @ignore
   */
  it('update using ReplSet instance',  {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.require.ReplSet,
          ReadPreference = this.configuration.require.ReadPreference;

      var config = [{
        host: this.configuration.host,
        port: this.configuration.port
      }];

      var options = {
        setName: this.configuration.setName
      };

      // Attempt to connect
      var server = new ReplSet(config, options);

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new ReplSet([{host: 'localhost', port:31000}], {setName:'rs'});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example_replset_2', [{a: 1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(err, results) {
          expect(err).to.be.null;
          expect(results.result.n).to.equal(1);

          // Execute the write
          _server.update('integration_tests.inserts_example_replset_2', [{
            q: {a: 1}, u: {'$set': {b: 1}}
          }], {
            writeConcern: {w: 1}, ordered: true
          }, function(updateErr, updateResults) {
            expect(updateErr).to.be.null;
            expect(updateResults.result.n).to.equal(1);

            _server.destroy();
            done();
          });
        });
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly remove a document using the ReplSet remove method
   *
   * @example-class ReplSet
   * @example-method remove
   * @ignore
   */
  it('remove using ReplSet instance',  {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.require.ReplSet,
          ReadPreference = this.configuration.require.ReadPreference;

      var config = [{
        host: this.configuration.host,
        port: this.configuration.port
      }];

      var options = {
        setName: this.configuration.setName
      };

      // Attempt to connect
      var server = new ReplSet(config, options);

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new ReplSet([{host: 'localhost', port:31000}], {setName:'rs'});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example_replset_3', [{a:1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(err, results) {
          expect(err).to.be.null;
          expect(results.result.n).to.equal(1);

          // Execute the write
          _server.remove('integration_tests.inserts_example_replset_3', [{
            q: {a: 1}, limit: 1
          }], {
            writeConcern: {w: 1}, ordered: true
          }, function(removeErr, removeResults) {
            expect(removeErr).to.be.null;
            expect(removeResults.result.n).to.equal(1);

            _server.destroy();
            done();
          });
        });
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly find a document on the ReplSet using the cursor
   *
   * @example-class ReplSet
   * @example-method cursor
   * @ignore
   */
  it('cursor using ReplSet instance',  {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.require.ReplSet,
          ReadPreference = this.configuration.require.ReadPreference;

      var config = [{
        host: this.configuration.host,
        port: this.configuration.port
      }];

      var options = {
        setName: this.configuration.setName
      };

      // Attempt to connect
      var server = new ReplSet(config, options);

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new ReplSet([{host: 'localhost', port:31000}], {setName:'rs'});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example_replset_4', [{a:1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(err, results) {
          expect(err).to.be.null;
          expect(results.result.n).to.equal(1);

          // Execute the write
          var cursor = _server.cursor('integration_tests.inserts_example_replset_4', {
            find: 'integration_tests.example4',
            query: {a: 1}
          });

          // Get the first document
          cursor.next(function(cursorErr, doc) {
            expect(cursorErr).to.be.null;
            expect(doc.a).to.equal(1);

            _server.destroy();
            done();
          });
        });
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly execute ismaster command on the ReplSet using the cursor
   *
   * @example-class ReplSet
   * @example-method command
   * @ignore
   */
  it('command using ReplSet instance',  {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.require.ReplSet,
          ReadPreference = this.configuration.require.ReadPreference;

      var config = [{
        host: this.configuration.host,
        port: this.configuration.port
      }];

      var options = {
        setName: this.configuration.setName
      };

      // Attempt to connect
      var server = new ReplSet(config, options);

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new ReplSet([{host: 'localhost', port:31000}], {setName:'rs'});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the command
        _server.command('system.$cmd', {ismaster: true}, function(err, result) {
          expect(err).to.be.null;
          server.destroy();
          done();
        });
      });

      // Start connection
      server.connect();
      // END
    }
  });
});

/**************************************************************************
 *
 * MONGOS TESTS
 *
 *************************************************************************/

describe.skip('Mongos operation example tests', function() {
  /**
   * Correctly insert a document using the Mongos insert method
   *
   * @example-class Mongos
   * @example-method insert
   * @ignore
   */
  it('simple insert into db using Mongos',  {
    metadata: {
      requires: {
        topology: 'mongos'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.require.Mongos;

      // Attempt to connect
      var server = new Mongos([{
        host: this.configuration.host,
        port: this.configuration.port
      }]);

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example_mongos_1', [{a: 1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(insertErr, insertResults) {
          expect(insertErr).to.be.null;
          expect(insertResults.result.n).to.equal(1);

          _server.destroy();
          done();
        });
      });

      // Start connection
      server.connect();
    }
  });

  /**
   * Correctly update a document using the Mongos update method
   *
   * @example-class Mongos
   * @example-method update
   * @ignore
   */
  it('update using ReplSet instance',  {
    metadata: {
      requires: {
        topology: 'mongos'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.require.Mongos;

      // Attempt to connect
      var server = new Mongos([{
        host: this.configuration.host,
        port: this.configuration.port
      }]);

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example_mongos_2', [{a: 1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(err, results) {
          expect(err).to.be.null;
          expect(results.result.n).to.equal(1);

          // Execute the write
          _server.update('integration_tests.inserts_example_mongos_2', [{
            q: {a: 1}, u: {'$set': {b: 1}}
          }], {
            writeConcern: {w: 1}, ordered: true
          }, function(updateErr, updateResults) {
            expect(updateErr).to.be.null;
            expect(updateResults.result.n).to.equal(1);

            _server.destroy();
            done();
          });
        });
      });

      // Start connection
      server.connect();
    }
  });

  /**
   * Correctly remove a document using the Mongos remove method
   *
   * @example-class Mongos
   * @example-method remove
   * @ignore
   */
  it('remove using Mongos instance',  {
    metadata: {
      requires: {
        topology: 'mongos'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.require.Mongos;

      // Attempt to connect
      var server = new Mongos([{
        host: this.configuration.host,
        port: this.configuration.port
      }]);

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example_mongos_3', [{a: 1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(err, results) {
          expect(err).to.be.null;
          expect(results.result.n).to.equal(1);

          // Execute the write
          _server.remove('integration_tests.inserts_example_mongos_3', [{
            q: {a: 1}, limit: 1
          }], {
            writeConcern: {w: 1}, ordered: true
          }, function(removeErr, removeResults) {
            expect(removeErr).to.be.null;
            expect(removeResults.result.n).to.equal(1);

            _server.destroy();
            done();
          });
        });
      });

      // Start connection
      server.connect();
    }
  });

  /**
   * Correctly find a document on the Mongos using the cursor
   *
   * @example-class Mongos
   * @example-method cursor
   * @ignore
   */
  it('cursor using Mongos instance',  {
    metadata: {
      requires: {
        topology: 'mongos'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.require.Mongos;

      // Attempt to connect
      var server = new Mongos([{
        host: this.configuration.host,
        port: this.configuration.port
      }]);

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example_mongos_4', [{a: 1}], {
          writeConcern: {w: 1}, ordered: true
        }, function(err, results) {
          expect(err).to.be.null;
          expect(results.result.n).to.equal(1);

          // Execute the write
          var cursor = _server.cursor('integration_tests.inserts_example_mongos_4', {
            find: 'integration_tests.example4',
            query: {a: 1}
          });

          // Get the first document
          cursor.next(function(cursorErr, doc) {
            expect(cursorErr).to.be.null;
            expect(doc.a).to.equal(1);

            _server.destroy();
            done();
          });
        });
      });

      // Start connection
      server.connect();
    }
  });

  /**
   * Correctly execute ismaster command on the Mongos using the cursor
   *
   * @example-class Mongos
   * @example-method command
   * @ignore
   */
  it('command using Mongos instance',  {
    metadata: {
      requires: {
        topology: 'mongos'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.require.Mongos;

      // Attempt to connect
      var server = new Mongos([{
        host: this.configuration.host,
        port: this.configuration.port
      }]);

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the command
        _server.command('system.$cmd', {ismaster: true}, function(err, result) {
          expect(err).to.be.null;
          _server.destroy();
          done();
        });
      });

      // Start connection
      server.connect();
    }
  });
});

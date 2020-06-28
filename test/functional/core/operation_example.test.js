'use strict';

const expect = require('chai').expect;
const { Topology } = require('../../../src/sdam/topology');

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
   */
  it('simple insert into db', {
    metadata: {
      requires: {
        topology: 'single'
      }
    },

    test: function(done) {
      const config = this.configuration;

      // Attempt to connect
      var server = config.newTopology(this.configuration.host, this.configuration.port, {
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
        _server.insert(
          'integration_tests.inserts_example1',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            _server.destroy();
            done();
          }
        );
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
   */
  it('update using Server instance', {
    metadata: {
      requires: {
        topology: 'single'
      }
    },

    test: function(done) {
      const config = this.configuration;

      // Attempt to connect
      var server = config.newTopology(this.configuration.host, this.configuration.port, {
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
        _server.insert(
          'integration_tests.inserts_example2',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            // Execute the write
            _server.update(
              'integration_tests.inserts_example2',
              [
                {
                  q: { a: 1 },
                  u: { $set: { b: 1 } }
                }
              ],
              {
                writeConcern: { w: 1 },
                ordered: true
              },
              function(updateErr, updateResults) {
                expect(updateErr).to.be.null;
                expect(updateResults.result.n).to.equal(1);

                _server.destroy();
                done();
              }
            );
          }
        );
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
   */
  it('remove using Server instance', {
    metadata: {
      requires: {
        topology: 'single'
      }
    },

    test: function(done) {
      const config = this.configuration;

      // Attempt to connect
      var server = config.newTopology(this.configuration.host, this.configuration.port, {
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
        _server.insert(
          'integration_tests.inserts_example3',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            // Execute the write
            _server.remove(
              'integration_tests.inserts_example3',
              [
                {
                  q: { a: 1 },
                  limit: 1
                }
              ],
              {
                writeConcern: { w: 1 },
                ordered: true
              },
              function(removeErr, removeResults) {
                expect(removeErr).to.be.null;
                expect(removeResults.result.n).to.equal(1);

                _server.destroy();
                done();
              }
            );
          }
        );
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
   */
  it('cursor using Server instance', {
    metadata: {
      requires: {
        topology: 'single'
      }
    },

    test: function(done) {
      const config = this.configuration;

      // Attempt to connect
      var server = config.newTopology(this.configuration.host, this.configuration.port, {
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
        _server.insert(
          'integration_tests.inserts_example4',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            // Execute the write
            var cursor = _server.cursor('integration_tests.inserts_example4', {
              find: 'integration_tests.example4',
              query: { a: 1 }
            });

            // Get the first document
            cursor._next(function(cursorErr, doc) {
              expect(cursorErr).to.be.null;
              expect(doc.a).to.equal(1);

              _server.destroy();
              done();
            });
          }
        );
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
   */
  it('command using Server instance', {
    metadata: {
      requires: {
        topology: 'single'
      }
    },

    test: function(done) {
      const config = this.configuration;

      // Attempt to connect
      var server = config.newTopology(this.configuration.host, this.configuration.port, {
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
        _server.command('system.$cmd', { ismaster: true }, function(err, result) {
          expect(result).to.exist;
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

describe('Topology operation example tests', function() {
  /**
   * Correctly insert a document using the Topology insert method
   *
   * @example-class Topology
   * @example-method insert
   */
  it('simple insert into db using Topology', {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var config = [
        {
          host: this.configuration.host,
          port: this.configuration.port
        }
      ];

      var options = {
        setName: this.configuration.setName
      };

      // Attempt to connect
      var server = new Topology(config, options);

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new Topology([{host: 'localhost', port:31000}], {setName:'rs'});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert(
          'integration_tests.inserts_example_replset_1',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            _server.destroy();
            done();
          }
        );
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly update a document using the Server update method
   *
   * @example-class Topology
   * @example-method update
   */
  it('update using Topology instance', {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var config = [
        {
          host: this.configuration.host,
          port: this.configuration.port
        }
      ];

      var options = {
        setName: this.configuration.setName
      };

      // Attempt to connect
      var server = new Topology(config, options);

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new Topology([{host: 'localhost', port:31000}], {setName:'rs'});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert(
          'integration_tests.inserts_example_replset_2',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            // Execute the write
            _server.update(
              'integration_tests.inserts_example_replset_2',
              [
                {
                  q: { a: 1 },
                  u: { $set: { b: 1 } }
                }
              ],
              {
                writeConcern: { w: 1 },
                ordered: true
              },
              function(updateErr, updateResults) {
                expect(updateErr).to.be.null;
                expect(updateResults.result.n).to.equal(1);

                _server.destroy();
                done();
              }
            );
          }
        );
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly remove a document using the Topology remove method
   *
   * @example-class Topology
   * @example-method remove
   */
  it('remove using Topology instance', {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var config = [
        {
          host: this.configuration.host,
          port: this.configuration.port
        }
      ];

      var options = {
        setName: this.configuration.setName
      };

      // Attempt to connect
      var server = new Topology(config, options);

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new Topology([{host: 'localhost', port:31000}], {setName:'rs'});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert(
          'integration_tests.inserts_example_replset_3',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            // Execute the write
            _server.remove(
              'integration_tests.inserts_example_replset_3',
              [
                {
                  q: { a: 1 },
                  limit: 1
                }
              ],
              {
                writeConcern: { w: 1 },
                ordered: true
              },
              function(removeErr, removeResults) {
                expect(removeErr).to.be.null;
                expect(removeResults.result.n).to.equal(1);

                _server.destroy();
                done();
              }
            );
          }
        );
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly find a document on the Topology using the cursor
   *
   * @example-class Topology
   * @example-method cursor
   */
  it('cursor using Topology instance', {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var config = [
        {
          host: this.configuration.host,
          port: this.configuration.port
        }
      ];

      var options = {
        setName: this.configuration.setName
      };

      // Attempt to connect
      var server = new Topology(config, options);

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new Topology([{host: 'localhost', port:31000}], {setName:'rs'});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert(
          'integration_tests.inserts_example_replset_4',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            // Execute the write
            var cursor = _server.cursor('integration_tests.inserts_example_replset_4', {
              find: 'integration_tests.example4',
              query: { a: 1 }
            });

            // Get the first document
            cursor._next(function(cursorErr, doc) {
              expect(cursorErr).to.be.null;
              expect(doc.a).to.equal(1);

              _server.destroy();
              done();
            });
          }
        );
      });

      // Start connection
      server.connect();
      // END
    }
  });

  /**
   * Correctly execute ismaster command on the Topology using the cursor
   *
   * @example-class Topology
   * @example-method command
   */
  it('command using Topology instance', {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var config = [
        {
          host: this.configuration.host,
          port: this.configuration.port
        }
      ];

      var options = {
        setName: this.configuration.setName
      };

      // Attempt to connect
      var server = new Topology(config, options);

      // LINE var Server = require('mongodb-core').Server,
      // LINE   test = require('assert');
      // LINE var server = new Topology([{host: 'localhost', port:31000}], {setName:'rs'});
      // REMOVE-LINE done();
      // BEGIN
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the command
        _server.command('system.$cmd', { ismaster: true }, function(err, result) {
          expect(result).to.exist;
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
   */
  it('simple insert into db using Mongos', {
    metadata: { requires: { topology: 'sharded' } },

    test: function(done) {
      // Attempt to connect
      var server = new Topology([
        {
          host: this.configuration.host,
          port: this.configuration.port
        }
      ]);

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert(
          'integration_tests.inserts_example_mongos_1',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(insertErr, insertResults) {
            expect(insertErr).to.be.null;
            expect(insertResults.result.n).to.equal(1);

            _server.destroy();
            done();
          }
        );
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
   */
  it('update using Topology instance', {
    metadata: {
      requires: {
        topology: 'mongos'
      }
    },

    test: function(done) {
      // Attempt to connect
      var server = new Topology([
        {
          host: this.configuration.host,
          port: this.configuration.port
        }
      ]);

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert(
          'integration_tests.inserts_example_mongos_2',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            // Execute the write
            _server.update(
              'integration_tests.inserts_example_mongos_2',
              [
                {
                  q: { a: 1 },
                  u: { $set: { b: 1 } }
                }
              ],
              {
                writeConcern: { w: 1 },
                ordered: true
              },
              function(updateErr, updateResults) {
                expect(updateErr).to.be.null;
                expect(updateResults.result.n).to.equal(1);

                _server.destroy();
                done();
              }
            );
          }
        );
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
   */
  it('remove using Mongos instance', {
    metadata: {
      requires: {
        topology: 'mongos'
      }
    },

    test: function(done) {
      // Attempt to connect
      var server = new Topology([
        {
          host: this.configuration.host,
          port: this.configuration.port
        }
      ]);

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert(
          'integration_tests.inserts_example_mongos_3',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            // Execute the write
            _server.remove(
              'integration_tests.inserts_example_mongos_3',
              [
                {
                  q: { a: 1 },
                  limit: 1
                }
              ],
              {
                writeConcern: { w: 1 },
                ordered: true
              },
              function(removeErr, removeResults) {
                expect(removeErr).to.be.null;
                expect(removeResults.result.n).to.equal(1);

                _server.destroy();
                done();
              }
            );
          }
        );
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
   */
  it('cursor using Mongos instance', {
    metadata: {
      requires: {
        topology: 'mongos'
      }
    },

    test: function(done) {
      // Attempt to connect
      var server = new Topology([
        {
          host: this.configuration.host,
          port: this.configuration.port
        }
      ]);

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the insert
        _server.insert(
          'integration_tests.inserts_example_mongos_4',
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            // Execute the write
            var cursor = _server.cursor('integration_tests.inserts_example_mongos_4', {
              find: 'integration_tests.example4',
              query: { a: 1 }
            });

            // Get the first document
            cursor._next(function(cursorErr, doc) {
              expect(cursorErr).to.be.null;
              expect(doc.a).to.equal(1);

              _server.destroy();
              done();
            });
          }
        );
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
   */
  it('command using Mongos instance', {
    metadata: {
      requires: {
        topology: 'mongos'
      }
    },

    test: function(done) {
      // Attempt to connect
      var server = new Topology([
        {
          host: this.configuration.host,
          port: this.configuration.port
        }
      ]);

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the command
        _server.command('system.$cmd', { ismaster: true }, function(err, result) {
          expect(result).to.exist;
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

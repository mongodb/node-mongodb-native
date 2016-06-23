"use strict";

/**************************************************************************
 *
 * SERVER TESTS
 *
 *************************************************************************/

/**
 * Correctly insert a document using the Server insert method
 *
 * @example-class Server
 * @example-method insert
 * @ignore
 */
exports['Example of simple insert into db'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , reconnectInterval: 50
    })

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new Server({host: 'localhost', port: 27017});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example1', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        _server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly update a document using the Server update method
 *
 * @example-class Server
 * @example-method update
 * @ignore
 */
exports['Example of update using Server instance'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , reconnectInterval: 50
    })

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new Server({host: 'localhost', port: 27017});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example2', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        // Execute the write
        _server.update('integration_tests.inserts_example2', [{
          q: {a: 1}, u: {'$set': {b:1}}
        }], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          test.equal(null, err);
          test.equal(1, results.result.n);

          _server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly remove a document using the Server remove method
 *
 * @example-class Server
 * @example-method remove
 * @ignore
 */
exports['Example of remove using Server instance'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , reconnectInterval: 50
    })

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new Server({host: 'localhost', port: 27017});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example3', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        // Execute the write
        _server.remove('integration_tests.inserts_example3', [{
          q: {a: 1}, limit: 1
        }], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          test.equal(null, err);
          test.equal(1, results.result.n);

          _server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly find a document on the Server using the cursor
 *
 * @example-class Server
 * @example-method cursor
 * @ignore
 */
exports['Example of cursor using Server instance'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , reconnectInterval: 50
    })

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new Server({host: 'localhost', port: 27017});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example4', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        // Execute the write
        var cursor = _server.cursor('integration_tests.inserts_example4', {
            find: 'integration_tests.example4'
          , query: {a:1}
        });

        // Get the first document
        cursor.next(function(err, doc) {
          test.equal(null, err);
          test.equal(1, doc.a);

          _server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly execute ismaster command on the Server using the cursor
 *
 * @example-class Server
 * @example-method command
 * @ignore
 */
exports['Example of command using Server instance'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , reconnectInterval: 50
    })

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new Server({host: 'localhost', port: 27017});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, function(err, result) {
        test.equal(null, err)
        _server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**************************************************************************
 *
 * REPLSET TESTS
 *
 *************************************************************************/

/**
 * Correctly insert a document using the ReplSet insert method
 *
 * @example-class ReplSet
 * @example-method insert
 * @ignore
 */
exports['Example of simple insert into db using ReplSet'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference;

    var config = [{
        host: configuration.host
      , port: configuration.port
    }];

    var options = {
      setName: configuration.setName
    };

    // Attempt to connect
    var server = new ReplSet(config, options);

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new ReplSet([{host: 'localhost', port:31000}], {setName:'rs'});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example_replset_1', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        _server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly update a document using the Server update method
 *
 * @example-class ReplSet
 * @example-method update
 * @ignore
 */
exports['Example of update using ReplSet instance'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference;

    var config = [{
        host: configuration.host
      , port: configuration.port
    }];

    var options = {
      setName: configuration.setName
    };

    // Attempt to connect
    var server = new ReplSet(config, options);

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new ReplSet([{host: 'localhost', port:31000}], {setName:'rs'});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example_replset_2', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        // Execute the write
        _server.update('integration_tests.inserts_example_replset_2', [{
          q: {a: 1}, u: {'$set': {b:1}}
        }], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          test.equal(null, err);
          test.equal(1, results.result.n);

          _server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly remove a document using the ReplSet remove method
 *
 * @example-class ReplSet
 * @example-method remove
 * @ignore
 */
exports['Example of remove using ReplSet instance'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference;

    var config = [{
        host: configuration.host
      , port: configuration.port
    }];

    var options = {
      setName: configuration.setName
    };

    // Attempt to connect
    var server = new ReplSet(config, options);

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new ReplSet([{host: 'localhost', port:31000}], {setName:'rs'});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example_replset_3', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        // Execute the write
        _server.remove('integration_tests.inserts_example_replset_3', [{
          q: {a: 1}, limit: 1
        }], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          test.equal(null, err);
          test.equal(1, results.result.n);

          _server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly find a document on the ReplSet using the cursor
 *
 * @example-class ReplSet
 * @example-method cursor
 * @ignore
 */
exports['Example of cursor using ReplSet instance'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference;

    var config = [{
        host: configuration.host
      , port: configuration.port
    }];

    var options = {
      setName: configuration.setName
    };

    // Attempt to connect
    var server = new ReplSet(config, options);

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new ReplSet([{host: 'localhost', port:31000}], {setName:'rs'});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example_replset_4', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        // Execute the write
        var cursor = _server.cursor('integration_tests.inserts_example_replset_4', {
            find: 'integration_tests.example4'
          , query: {a:1}
        });

        // Get the first document
        cursor.next(function(err, doc) {
          test.equal(null, err);
          test.equal(1, doc.a);

          _server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly execute ismaster command on the ReplSet using the cursor
 *
 * @example-class ReplSet
 * @example-method command
 * @ignore
 */
exports['Example of command using ReplSet instance'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference;

    var config = [{
        host: configuration.host
      , port: configuration.port
    }];

    var options = {
      setName: configuration.setName
    };

    // Attempt to connect
    var server = new ReplSet(config, options);

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new ReplSet([{host: 'localhost', port:31000}], {setName:'rs'});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, function(err, result) {
        test.equal(null, err)
        server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**************************************************************************
 *
 * MONGOS TESTS
 *
 *************************************************************************/

/**
 * Correctly insert a document using the Mongos insert method
 *
 * @example-class Mongos
 * @example-method insert
 * @ignore
 */
exports['Example of simple insert into db using Mongos'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos;

    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }]);

    // LINE var Mongos = configuration.require.Mongos,
    // LINE   test = require('assert');
    // LINE var server = new Mongos([{host: 'localhost', port:50000}]);
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example_mongos_1', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        _server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly update a document using the Mongos update method
 *
 * @example-class Mongos
 * @example-method update
 * @ignore
 */
exports['Example of update using ReplSet instance'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos;

    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }]);

    // LINE var Mongos = configuration.require.Mongos,
    // LINE   test = require('assert');
    // LINE var server = new Mongos([{host: 'localhost', port:50000}]);
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example_mongos_2', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        // Execute the write
        _server.update('integration_tests.inserts_example_mongos_2', [{
          q: {a: 1}, u: {'$set': {b:1}}
        }], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          test.equal(null, err);
          test.equal(1, results.result.n);

          _server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly remove a document using the Mongos remove method
 *
 * @example-class Mongos
 * @example-method remove
 * @ignore
 */
exports['Example of remove using Mongos instance'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos;

    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }]);

    // LINE var Mongos = configuration.require.Mongos,
    // LINE   test = require('assert');
    // LINE var server = new Mongos([{host: 'localhost', port:50000}]);
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example_mongos_3', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        // Execute the write
        _server.remove('integration_tests.inserts_example_mongos_3', [{
          q: {a: 1}, limit: 1
        }], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          test.equal(null, err);
          test.equal(1, results.result.n);

          _server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly find a document on the Mongos using the cursor
 *
 * @example-class Mongos
 * @example-method cursor
 * @ignore
 */
exports['Example of cursor using Mongos instance'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos;

    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }]);

    // LINE var Mongos = configuration.require.Mongos,
    // LINE   test = require('assert');
    // LINE var server = new Mongos([{host: 'localhost', port:50000}]);
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the insert
      _server.insert('integration_tests.inserts_example_mongos_4', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        // Execute the write
        var cursor = _server.cursor('integration_tests.inserts_example_mongos_4', {
            find: 'integration_tests.example4'
          , query: {a:1}
        });

        // Get the first document
        cursor.next(function(err, doc) {
          test.equal(null, err);
          test.equal(1, doc.a);

          _server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly execute ismaster command on the Mongos using the cursor
 *
 * @example-class Mongos
 * @example-method command
 * @ignore
 */
exports['Example of command using Mongos instance'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos;

    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }]);

    // LINE var Mongos = configuration.require.Mongos,
    // LINE   test = require('assert');
    // LINE var server = new Mongos([{host: 'localhost', port:50000}]);
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, function(err, result) {
        test.equal(null, err)
        _server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
    // END
  }
}

"use strict";

exports['Should correctly connect to single server'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Connection = require('../../../lib/connection/connection')
      , BSON = require('bson').BSONPure.BSON;

    // Create BSON parser
    var bson = new BSON();

    // Attempt to connect
    var connection = new Connection({
        id: 1
      , host: configuration.host
      , port: configuration.port
      , bson: bson
    })

    // Add event listeners
    connection.on('connect', function(_connection) {
      connection.destroy();
      test.done();
    })

    // Start connection
    connection.connect();
  }
}

exports['Should fail connect to single server'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Connection = require('../../../lib/connection/connection')
      , BSON = require('bson').BSONPure.BSON;

    // Create BSON parser
    var bson = new BSON();

    // Attempt to connect
    var connection = new Connection({
        id: 1
      , host: configuration.host
      , port: 23343
      , bson: bson
    })

    // Add event listeners
    connection.on('error', function(err) {
      test.ok(err instanceof configuration.require.MongoError)
      connection.destroy();
      test.done();
    })

    // Start connection
    connection.connect();
  }
}

exports['Should correctly execute ismaster on single server'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Connection = require('../../../lib/connection/connection')
      , Query = require('../../../lib/connection/commands').Query
      , BSON = require('bson').BSONPure.BSON;

    // Create BSON parser
    var bson = new BSON();

    // Attempt to connect
    var connection = new Connection({
        id: 1
      , host: configuration.host
      , port: configuration.port
      , bson: bson
      , messageHandler: function(message) {
        message.parse();
        test.equal(true, message.documents[0].ismaster);
        connection.destroy();
      }
    })

    // Add event listeners
    connection.on('connect', function(_connection) {
      // Create a query command
      var query = new Query(bson, 'admin.$cmd', {ismaster:true}, {
        numberToReturn: -1
      });

      // Write it out to the connection
      _connection.write(query.toBin());
    });

    connection.on('close', function(err) {
      test.done();
    });

    connection.on('error', function(err) {
      test.ok(0);
    });

    // Start connection
    connection.connect();
  }
}

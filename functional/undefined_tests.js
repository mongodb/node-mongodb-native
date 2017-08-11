'use strict';

var expect = require('chai').expect,
    f = require('util').format,
    ObjectId = require('bson').ObjectId;

describe('A server', function() {
  it('should correctly execute insert culling undefined', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      var self = this;
      this.configuration.newTopology(function(err, server) {
        // Add event listeners
        server.on('connect', function(_server) {
          // Drop collection
          _server.command(f('%s.$cmd', self.configuration.db), {drop: 'insert1'}, function() {
            var ns = f('%s.insert1', self.configuration.db);
            var objectId = new ObjectId();
            // Execute the write
            _server.insert(ns, [{_id: objectId, a: 1, b: undefined}], {
              writeConcern: {w: 1}, ordered: true, ignoreUndefined: true
            }, function(insertErr, results) {
              expect(insertErr).to.be.null;
              expect(results.result.n).to.eql(1);

              // Execute find
              var cursor = _server.cursor(ns, {
                find: f('%s.insert1', self.configuration.db),
                query: {_id: objectId},
                batchSize: 2
              });

              // Execute next
              cursor.next(function(nextErr, d) {
                expect(nextErr).to.be.null;
                expect(d.b).to.be.undefined;

                // Destroy the connection
                _server.destroy();
                // Finish the test
                done();
              });
            });
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly execute update culling undefined', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      var self = this;
      this.configuration.newTopology(function(err, server) {
        // Add event listeners
        server.on('connect', function(_server) {
          // Drop collection
          _server.command(f('%s.$cmd', self.configuration.db), {drop: 'update1'}, function() {
            var ns = f('%s.update1', self.configuration.db);
            var objectId = new ObjectId();
            // Execute the write
            _server.update(ns, {
              q: {_id: objectId, a: 1, b: undefined}, u: {$set: {a: 1, b: undefined}}, upsert: true
            }, {
              writeConcern: {w: 1}, ordered: true, ignoreUndefined: true
            }, function(insertErr, results) {
              expect(insertErr).to.be.null;
              expect(results.result.n).to.eql(1);

              // Execute find
              var cursor = _server.cursor(ns, {
                find: f('%s.update1', self.configuration.db),
                query: {_id: objectId},
                batchSize: 2
              });

              // Execute next
              cursor.next(function(nextErr, d) {
                expect(nextErr).to.be.null;
                expect(d.b).to.be.undefined;

                // Destroy the connection
                _server.destroy();
                // Finish the test
                done();
              });
            });
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly execute remove culling undefined', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      var self = this;
      this.configuration.newTopology(function(err, server) {
        // Add event listeners
        server.on('connect', function(_server) {
          var ns = f('%s.remove1', self.configuration.db);
          var objectId = new ObjectId();

          _server.command(f('%s.$cmd', self.configuration.db), {drop: 'remove1'}, function() {
            // Execute the write
            _server.insert(ns, [{id: objectId, a: 1, b: undefined}, {id: objectId, a: 2, b: 1}], {
              writeConcern: {w: 1}, ordered: true
            }, function(insertErr, results) {
              expect(insertErr).to.be.null;
              expect(results.result.n).to.eql(2);

              // Execute the write
              _server.remove(ns, [{
                q: {b: undefined}, limit: 0
              }], {
                writeConcern: {w: 1}, ordered: true, ignoreUndefined: true
              }, function(removeErr, removeResults) {
                expect(removeErr).to.be.null;
                expect(removeResults.result.n).to.eql(2);

                // Destroy the connection
                _server.destroy();
                // Finish the test
                done();
              });
            });
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly execute remove not culling undefined', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      var self = this;
      this.configuration.newTopology(function(err, server) {
        // Add event listeners
        server.on('connect', function(_server) {
          var ns = f('%s.remove2', self.configuration.db);
          var objectId = new ObjectId();

          _server.command(f('%s.$cmd', self.configuration.db), {drop: 'remove2'}, function() {
            // Execute the write
            _server.insert(ns, [{id: objectId, a: 1, b: undefined}, {id: objectId, a: 2, b: 1}], {
              writeConcern: {w: 1}, ordered: true
            }, function(insertErr, results) {
              expect(insertErr).to.be.null;
              expect(results.result.n).to.eql(2);

              // Execute the write
              _server.remove(ns, [{
                q: {b: null}, limit: 0
              }], {
                writeConcern: {w: 1}, ordered: true
              }, function(removeErr, removeResults) {
                expect(removeErr).to.be.null;
                expect(removeResults.result.n).to.eql(1);

                // Destroy the connection
                _server.destroy();
                // Finish the test
                done();
              });
            });
          });
        });

        // Start connection
        server.connect();
      });
    }
  });
});

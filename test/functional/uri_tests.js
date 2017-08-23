'use strict';
var expect = require('chai').expect;

describe('URI', function() {
  /**
   * @ignore
   */
  it(
    'Should correctly connect using MongoClient to a single server using connect with optional server setting',
    {
      // Add a tag that our runner can trigger on
      // in this case we are setting that node needs to be higher than 0.10.X to run
      metadata: { requires: { topology: 'single' } },

      // The actual test we wish to run
      test: function(done) {
        var self = this;
        var MongoClient = self.configuration.require.MongoClient;

        // Connect using the connection string
        MongoClient.connect(
          'mongodb://localhost:27017/integration_tests',
          {
            db: {
              native_parser: false
            },

            server: {
              socketOptions: {
                connectTimeoutMS: 500
              }
            }
          },
          function(err, client) {
            var db = client.db(self.configuration.db);
            expect(err).to.not.exist;
            expect(client.topology.connections()[0].connectionTimeout).to.equal(500);

            db
              .collection('mongoclient_test')
              .update({ a: 1 }, { b: 1 }, { upsert: true }, function(err, result) {
                expect(err).to.not.exist;
                expect(result.result.n).to.equal(1);

                client.close();
                done();
              });
          }
        );
      }
    }
  );

  /**
   * @ignore
   */
  it('should correctly allow for w:0 overriding on the connect url', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var MongoClient = self.configuration.require.MongoClient;

      // Connect using the connection string
      MongoClient.connect('mongodb://localhost:27017/integration_tests?w=0', function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(self.configuration.db);

        db
          .collection('mongoclient_test')
          .update({ a: 1 }, { b: 1 }, { upsert: true }, function(err, result) {
            expect(err).to.not.exist;

            if (result) {
              expect(result.result.ok).to.equal(1);
            } else {
              expect(result).to.be.null;
            }

            client.close();
            done();
          });
      });
    }
  });

  it('should correctly connect via domain socket', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var MongoClient = this.configuration.require.MongoClient;

      if (process.platform != 'win32') {
        MongoClient.connect('mongodb://%2Ftmp%2Fmongodb-27017.sock?safe=false', function(
          err,
          client
        ) {
          expect(err).to.not.exist;
          client.close();
          done();
        });
      } else {
        done();
      }
    }
  });

  it('should correctly connect via normal url using connect', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var mongodb = this.configuration.require;

      mongodb.connect('mongodb://localhost/?safe=false', function(err, client) {
        client.close();
        done();
      });
    }
  });

  it('should correctly connect via normal url using require', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      require('../..')('mongodb://localhost/', function(err, client) {
        client.close();
        done();
      });
    }
  });

  it('should correctly connect via normal url journal option', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var MongoClient = self.configuration.require.MongoClient;

      MongoClient.connect('mongodb://localhost/?journal=true', function(err, client) {
        var db = client.db(self.configuration.db);
        expect(db.writeConcern.j).to.be.true;
        client.close();
        done();
      });
    }
  });

  it('should correctly connect via normal url using ip', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var MongoClient = self.configuration.require.MongoClient;

      MongoClient.connect('mongodb://127.0.0.1:27017/?fsync=true', function(err, client) {
        var db = client.db(self.configuration.db);
        expect(db.writeConcern.fsync).to.be.true;
        client.close();
        done();
      });
    }
  });

  it('should correctly connect using uri encoded username and password', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var MongoClient = self.configuration.require.MongoClient;

      MongoClient.connect(
        'mongodb://localhost:27017/integration_tests',
        { native_parser: true },
        function(err, client) {
          expect(err).to.not.exist;
          var user = 'u$ser',
            pass = '$specialch@rs';
          var db = client.db(self.configuration.db);

          db.addUser(user, pass, function(err) {
            expect(err).to.not.exist;
            var uri =
              'mongodb://' +
              encodeURIComponent(user) +
              ':' +
              encodeURIComponent(pass) +
              '@localhost:27017/integration_tests';
            MongoClient.connect(uri, { native_parser: true }, function(err, aclient) {
              expect(err).to.not.exist;

              client.close();
              aclient.close();
              done();
            });
          });
        }
      );
    }
  });
});

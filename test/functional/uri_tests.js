'use strict';

const expect = require('chai').expect;

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

        // Connect using the connection string
        const client = this.configuration.newClient('mongodb://localhost:27017/integration_tests', {
          native_parser: false,
          socketOptions: {
            connectTimeoutMS: 500
          }
        });

        client.connect(function(err, client) {
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
        });
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

      // Connect using the connection string
      const client = this.configuration.newClient(
        'mongodb://localhost:27017/integration_tests?w=0'
      );

      client.connect(function(err, client) {
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
      if (process.platform === 'win32') {
        return done();
      }

      const client = this.configuration.newClient(
        'mongodb://%2Ftmp%2Fmongodb-27017.sock?safe=false'
      );

      client.connect(function(err, client) {
        expect(err).to.not.exist;
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
      const client = this.configuration.newClient('mongodb://127.0.0.1:27017/?fsync=true');
      client.connect((err, client) => {
        var db = client.db(this.configuration.db);
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
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // The unified topology does not presently support authentication
        return this.skip();
      }

      const client = configuration.newClient('mongodb://localhost:27017/integration_tests', {
        native_parser: true
      });

      client.connect(function(err, client) {
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

          const aclient = configuration.newClient(uri, { native_parser: true });
          aclient.connect(function(err, aclient) {
            expect(err).to.not.exist;

            client.close();
            aclient.close();
            done();
          });
        });
      });
    }
  });

  it('should correctly translate uri options using new parser', {
    metadata: { requires: { topology: 'replicaset' } },
    test: function(done) {
      const config = this.configuration;
      const uri = `mongodb://${config.host}:${config.port}/${config.db}?replicaSet=${
        config.replicasetName
      }`;

      const client = this.configuration.newClient(uri, { useNewUrlParser: true });
      client.connect((err, client) => {
        if (err) console.dir(err);
        expect(err).to.not.exist;
        expect(client).to.exist;
        expect(client.s.options.replicaSet).to.exist.and.equal(config.replicasetName);
        done();
      });
    }
  });
});

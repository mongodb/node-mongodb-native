'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const { Topology } = require('../../mongodb');

describe('URI', function () {
  it('should correctly allow for w:0 overriding on the connect url', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var self = this;

      const authInformation = process.env.AUTH === 'auth' ? 'bob:pwd123@' : '';
      // Connect using the connection string
      const client = this.configuration.newClient(
        `mongodb://${authInformation}localhost:27017/?w=0`
      );

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(self.configuration.db);

        db.collection('mongoclient_test').update(
          { a: 1 },
          { $set: { b: 1 } },
          { upsert: true },
          function (err, result) {
            expect(err).to.not.exist;
            expect(result).to.exist;
            expect(result).property('acknowledged').to.be.false;
            client.close(done);
          }
        );
      });
    }
  });

  it('should correctly connect via domain socket', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      if (process.platform === 'win32') {
        return done();
      }

      const client = this.configuration.newClient('mongodb://%2Ftmp%2Fmongodb-27017.sock');

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        client.close(done);
      });
    }
  });

  it('should correctly connect via normal url using ip', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      const client = this.configuration.newClient('mongodb://127.0.0.1:27017/?fsync=true');
      client.connect((err, client) => {
        var db = client.db(this.configuration.db);
        expect(db.writeConcern.fsync).to.be.true;
        client.close(done);
      });
    }
  });

  it('should correctly connect using uri encoded username and password', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var self = this;
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var user = 'u$ser',
          pass = '$specialch@rs';
        var db = client.db(self.configuration.db);

        db.addUser(user, pass, function (err) {
          expect(err).to.not.exist;
          var uri =
            'mongodb://' +
            encodeURIComponent(user) +
            ':' +
            encodeURIComponent(pass) +
            '@localhost:27017/integration_tests';

          configuration.newClient(uri).connect(function (err, c) {
            expect(err).to.not.exist;

            c.close(() => client.close(done));
          });
        });
      });
    }
  });

  it('should correctly translate uri options', {
    metadata: { requires: { topology: 'replicaset' } },
    test: function (done) {
      const config = this.configuration;
      const uri = `mongodb://${config.host}:${config.port}/${config.db}?replicaSet=${config.replicasetName}`;

      const client = this.configuration.newClient(uri);
      client.connect((err, client) => {
        expect(err).to.not.exist;
        expect(client).to.exist;
        expect(client.options.replicaSet).to.exist.and.equal(config.replicasetName);
        client.close(done);
      });
    }
  });

  it('should generate valid credentials with X509', {
    metadata: { requires: { topology: 'single' } },
    test: function (done) {
      function validateConnect(options) {
        expect(options).to.have.property('credentials');
        expect(options.credentials.mechanism).to.eql('MONGODB-X509');

        connectStub.restore();
        done();
      }

      const topologyPrototype = Topology.prototype;
      const connectStub = sinon.stub(topologyPrototype, 'connect').callsFake(validateConnect);
      const uri = 'mongodb://some-hostname/test?ssl=true&authMechanism=MONGODB-X509&replicaSet=rs0';
      const client = this.configuration.newClient(uri);
      client.connect();
    }
  });
});

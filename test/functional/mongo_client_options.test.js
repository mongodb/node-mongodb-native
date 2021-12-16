'use strict';
const sinon = require('sinon');
const { setupDatabase } = require('./shared');
const { expect } = require('chai');
const { MongoClient } = require('../../src');
const { Connection } = require('../../src/cmap/connection');
const { isHello } = require('../../src/utils');

describe('MongoClient Options', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should error on unexpected options', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      MongoClient.connect(
        configuration.url(),
        {
          maxPoolSize: 4,
          notlegal: {},
          validateOptions: true
        },
        function (err, client) {
          expect(err)
            .property('message')
            .to.match(/options notlegal, validateoptions are not supported/);
          expect(client).to.not.exist;
          done();
        }
      );
    }
  });

  it('should error on unexpected options (promise)', {
    metadata: { requires: { topology: 'single' } },

    test() {
      MongoClient.connect(this.configuration.url(), {
        maxPoolSize: 4,
        notlegal: {},
        validateOptions: true
      })
        .then(() => expect().fail())
        .catch(err => {
          expect(err)
            .property('message')
            .to.match(/options notlegal, validateoptions are not supported/);
        });
    }
  });

  it('must respect an infinite connectTimeoutMS for the streaming protocol', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 4.4' } },
    test: function (done) {
      const client = this.configuration.newClient({
        connectTimeoutMS: 0,
        heartbeatFrequencyMS: 500
      });
      client.connect(err => {
        expect(err).to.not.exist;
        const stub = sinon.stub(Connection.prototype, 'command').callsFake(function () {
          const args = Array.prototype.slice.call(arguments);
          const ns = args[0];
          const command = args[1];
          const options = args[2] || {};
          if (ns.toString() === 'admin.$cmd' && isHello(command) && options.exhaustAllowed) {
            expect(options).property('socketTimeoutMS').to.equal(0);
            stub.restore();
            client.close(done);
          }
          stub.wrappedMethod.apply(this, args);
        });
      });
    }
  });

  it('must respect a finite connectTimeoutMS for the streaming protocol', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 4.4' } },
    test: function (done) {
      const client = this.configuration.newClient({
        connectTimeoutMS: 10,
        heartbeatFrequencyMS: 500
      });
      client.connect(err => {
        expect(err).to.not.exist;
        const stub = sinon.stub(Connection.prototype, 'command').callsFake(function () {
          const args = Array.prototype.slice.call(arguments);
          const ns = args[0];
          const command = args[1];
          const options = args[2] || {};
          if (ns.toString() === 'admin.$cmd' && isHello(command) && options.exhaustAllowed) {
            expect(options).property('socketTimeoutMS').to.equal(510);
            stub.restore();
            client.close(done);
          }
          stub.wrappedMethod.apply(this, args);
        });
      });
    }
  });
});

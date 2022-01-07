'use strict';
const { setupDatabase } = require('../shared');
const { format: f } = require('util');
const { expect } = require('chai');

describe('crud - insert', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  context('promise tests', () => {
    it('Should correctly execute Collection.prototype.insertOne', {
      metadata: {
        requires: {
          topology: ['single']
        }
      },

      test: function (done) {
        var configuration = this.configuration;
        var url = configuration.url();
        url =
          url.indexOf('?') !== -1
            ? f('%s&%s', url, 'maxPoolSize=100')
            : f('%s?%s', url, 'maxPoolSize=100');

        const client = configuration.newClient(url);
        client.connect().then(function (client) {
          var db = client.db(configuration.db);

          db.collection('insertOne')
            .insertOne({ a: 1 })
            .then(function (r) {
              expect(r).property('insertedId').to.exist;
              client.close(done);
            });
        });
      }
    });

    it('Should correctly return failing Promise when no document array passed into insertMany', {
      metadata: {
        requires: {
          topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
        }
      },

      test: function (done) {
        var configuration = this.configuration;
        var url = configuration.url();
        url =
          url.indexOf('?') !== -1
            ? f('%s&%s', url, 'maxPoolSize=100')
            : f('%s?%s', url, 'maxPoolSize=100');

        const client = configuration.newClient(url);
        client.connect().then(() => {
          this.defer(() => client.close());

          const db = client.db(configuration.db);
          expect(() => {
            db.collection('insertMany_Promise_error').insertMany({ a: 1 });
          }).to.throw(/Argument "docs" must be an array of documents/);

          done();
        });
      }
    });
  });
});

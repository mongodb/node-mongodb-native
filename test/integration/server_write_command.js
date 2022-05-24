'use strict';
const { setupDatabase } = require('./shared');

class CustomPromise extends Promise {}
CustomPromise.prototype.isCustomMongo = true;

describe('Server Write Command', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly catch command error using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      const client = this.configuration.newClient({ maxPoolSize: 5 });
      client
        .db(this.configuration.db)
        .command({ nosuchcommand: true })
        .then(function () {})
        .catch(function () {
          // Execute close using promise
          client.close().then(function () {
            done();
          });
        });
    }
  });
});

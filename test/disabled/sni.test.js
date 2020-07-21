'use strict';
var test = require('./shared').assert;

describe('SNI', function () {
  it('Should correct connect to snitest1.10gen.cc', {
    metadata: { requires: { topology: 'sni', os: '!win32' } },

    test: function (done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;

      // Let's write the actual connection code
      MongoClient.connect(
        'mongodb://snitest2.mongodb.com:27777/?ssl=true',
        {
          // servername: 'snitest1.10gen.cc',
        },
        function (err, client) {
          test.equal(null, err);
          client.close(done);
        }
      );
    }
  });

  it('Should correct connect to snitest2.mongodb.com', {
    metadata: { requires: { topology: 'sni', os: '!win32' } },

    test: function (done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;

      // Let's write the actual connection code
      MongoClient.connect(
        'mongodb://snitest2.mongodb.com:27777/?ssl=true',
        {
          // servername: 'snitest2.mongodb.com',
        },
        function (err, client) {
          test.equal(null, err);
          client.close(done);
        }
      );
    }
  });
});

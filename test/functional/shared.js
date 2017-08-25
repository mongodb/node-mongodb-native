var MongoClient = require('../../').MongoClient,
  expect = require('chai').expect;

function connectToDb(url, db, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  MongoClient.connect(url, options || {}, function(err, client) {
    if (err) return callback(err);
    callback(null, client.db(db), client);
  });
}

function setupDatabase(configuration) {
  var dbName = configuration.db;
  var client = configuration.newClient(configuration.writeConcernMax(), {
    poolSize: 1
  });

  return client.connect().then(function() {
    var db = client.db(dbName);
    return db.dropDatabase();
  });
}

var assert = {
  equal: function(a, b) {
    expect(a).to.equal(b);
  },

  ok: function(a) {
    expect(a).to.be.ok;
  }
};

module.exports = {
  connectToDb: connectToDb,
  setupDatabase: setupDatabase,
  assert: assert
};

GLOBAL.DEBUG = true;

test = require("assert");

var Db = require('../lib/mongodb').Db,
  connect = require('../lib/mongodb').connect;

console.log('Connecting to ' + Db.DEFAULT_URL);
connect(Db.DEFAULT_URL, function(err, db) {
  db.dropDatabase(function(err, result) {
    db.collection('test', function(err, collection) {
      collection.insert({'a':1});
      db.close();
    });
  });
});

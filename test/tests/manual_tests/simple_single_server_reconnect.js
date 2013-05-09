var mongo = require('../../../lib/mongodb')
var uri = 'mongodb://localhost/nativetest';

mongo.connect(uri, function (err, db) {
  if (err) throw err;

  var c = db.collection('test');
  c.insert({ testing: true }, function (err) {
    if (err) return done(err);
    test()
  })

  function test () {
    c.findOne(console.log);
    setTimeout(test, 1000);
  }

  function done (err) {
    if (err) console.error(err);
    db.close();
  }
})
/**
 * @ignore
 */
exports['Should correctly connect to server using domain socket'] = function(configuration, test) {
  var db = configuration.newDbInstanceWithDomainSocket("/tmp/mongodb-27017.sock", {w:1}, {poolSize: 1});
  db.open(function(err, db) {
    test.equal(null, err);

    db.collection("domainSocketCollection").insert({a:1}, {w:1}, function(err, item) {
      test.equal(null, err);

      db.collection("domainSocketCollection").find({a:1}).toArray(function(err, items) {
        test.equal(null, err);
        test.equal(1, items.length);

        db.close();
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should connect to server using domain socket with undefined port'] = function(configuration, test) {
  var db = configuration.newDbInstanceWithDomainSocketAndPort("/tmp/mongodb-27017.sock", undefined, {w:1}, {poolSize: 1});
  db.open(function(err, db) {
    test.equal(null, err);

    db.collection("domainSocketCollection").insert({x:1}, {w:1}, function(err, item) {
      test.equal(null, err);

      db.collection("domainSocketCollection").find({x:1}).toArray(function(err, items) {
        test.equal(null, err);
        test.equal(1, items.length);

        db.close();
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should fail to connect using non-domain socket with undefined port'] = function(configuration, test) {
  var db = configuration.newDbInstanceWithDomainSocketAndPort("localhost", undefined, {w:1}, {poolSize: 1});

  var error;
  try {
    db.open(function(){});
  } catch (err){
    error = err;
  }

  test.ok(error instanceof Error);
  test.ok(/port must be specified/.test(error));
  test.done();
}

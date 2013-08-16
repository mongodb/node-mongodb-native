/**
 * @ignore
 */
exports['Should correctly apply collection level read Preference to count'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReadPreference = mongo.ReadPreference;

  configuration.newDbInstance({w:1}, {poolSize:1}).open(function(err, db) {
    test.equal(null, err);
    // Set read preference
    var collection = db.collection('read_pref_1', {readPreference:ReadPreference.SECONDARY_PREFERRED});
    // Save checkout function
    var checkout = db.serverConfig.checkoutReader;
    // Set up our checker method
    db.serverConfig.checkoutReader = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      test.equal(ReadPreference.SECONDARY_PREFERRED, args[0]);
      return checkout.apply(db.serverConfig, args);
    }

    // Execute count
    collection.count(function(err, count) {
      db.serverConfig.checkoutReader = checkout;

      db.close();
      test.done();
    });
  });  
}

/**
 * @ignore
 */
exports['Should correctly apply collection level read Preference to group'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReadPreference = mongo.ReadPreference;

  configuration.newDbInstance({w:1}, {poolSize:1}).open(function(err, db) {
    test.equal(null, err);
    // Set read preference
    var collection = db.collection('read_pref_1', {readPreference:ReadPreference.SECONDARY_PREFERRED});
    // Save checkout function
    var checkout = db.serverConfig.checkoutReader;
    // Set up our checker method
    db.serverConfig.checkoutReader = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      test.equal(ReadPreference.SECONDARY_PREFERRED, args[0]);
      return checkout.apply(db.serverConfig, args);
    }

    // Execute count
    collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", function(err, results) {
      db.serverConfig.checkoutReader = checkout;

      db.close();
      test.done();
    });
  });  
}

/**
 * @ignore
 */
exports['Should correctly apply collection level read Preference to geoNear'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReadPreference = mongo.ReadPreference;

  configuration.newDbInstance({w:1}, {poolSize:1}).open(function(err, db) {
    test.equal(null, err);
    // Set read preference
    var collection = db.collection('read_pref_1', {readPreference:ReadPreference.SECONDARY_PREFERRED});
    // Save checkout function
    var checkout = db.serverConfig.checkoutReader;
    // Set up our checker method
    db.serverConfig.checkoutReader = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      test.equal(ReadPreference.SECONDARY_PREFERRED, args[0]);
      return checkout.apply(db.serverConfig, args);
    }

    // Execute count
    collection.geoNear(50, 50, {query:{a:1}, num:1}, function(err, docs) {
      db.serverConfig.checkoutReader = checkout;

      db.close();
      test.done();
    });
  });  
}

/**
 * @ignore
 */
exports['Should correctly apply collection level read Preference to geoHaystackSearch'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReadPreference = mongo.ReadPreference;

  configuration.newDbInstance({w:1}, {poolSize:1}).open(function(err, db) {
    test.equal(null, err);
    // Set read preference
    var collection = db.collection('read_pref_1', {readPreference:ReadPreference.SECONDARY_PREFERRED});
    // Save checkout function
    var checkout = db.serverConfig.checkoutReader;
    // Set up our checker method
    db.serverConfig.checkoutReader = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      test.equal(ReadPreference.SECONDARY_PREFERRED, args[0]);
      return checkout.apply(db.serverConfig, args);
    }

    // Execute count
    collection.geoHaystackSearch(50, 50, {search:{a:1}, limit:1, maxDistance:100}, function(err, docs) {
      db.serverConfig.checkoutReader = checkout;

      db.close();
      test.done();
    });
  });  
}

/**
 * @ignore
 */
exports['Should correctly apply collection level read Preference to mapReduce'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReadPreference = mongo.ReadPreference;

  configuration.newDbInstance({w:1}, {poolSize:1}).open(function(err, db) {
    test.equal(null, err);
    // Set read preference
    var collection = db.collection('read_pref_1', {readPreference:ReadPreference.SECONDARY_PREFERRED});
    // Save checkout function
    var checkout = db.serverConfig.checkoutReader;
    // Set up our checker method
    db.serverConfig.checkoutReader = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      test.equal(ReadPreference.SECONDARY_PREFERRED, args[0]);
      return checkout.apply(db.serverConfig, args);
    }

    // Map function
    var map = function() { emit(this.user_id, 1); };
    // Reduce function
    var reduce = function(k,vals) { return 1; };

    // Peform the map reduce
    collection.mapReduce(map, reduce, {out: {inline:1}}, function(err, collection) {
      db.serverConfig.checkoutReader = checkout;

      db.close();
      test.done();
    });
  });  
}

/**
 * @ignore
 */
exports['Should correctly apply collection level read Preference to mapReduce backward compatibility'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReadPreference = mongo.ReadPreference;

  configuration.newDbInstance({w:1}, {poolSize:1}).open(function(err, db) {
    test.equal(null, err);
    // Set read preference
    var collection = db.collection('read_pref_1', {readPreference:ReadPreference.SECONDARY_PREFERRED});
    // Save checkout function
    var checkout = db.serverConfig.checkoutReader;
    // Set up our checker method
    db.serverConfig.checkoutReader = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      test.equal(ReadPreference.SECONDARY_PREFERRED, args[0]);
      return checkout.apply(db.serverConfig, args);
    }

    // Map function
    var map = function() { emit(this.user_id, 1); };
    // Reduce function
    var reduce = function(k,vals) { return 1; };

    // Peform the map reduce
    collection.mapReduce(map, reduce, {out: 'inline'}, function(err, collection) {
      db.serverConfig.checkoutReader = checkout;

      db.close();
      test.done();
    });
  });  
}

/**
 * @ignore
 */
exports['Should fail due to not using mapreduce inline with read preference'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReadPreference = mongo.ReadPreference;

  configuration.newDbInstance({w:1}, {poolSize:1}).open(function(err, db) {
    test.equal(null, err);
    // Set read preference
    var collection = db.collection('read_pref_1', {readPreference:ReadPreference.SECONDARY_PREFERRED});
    // Map function
    var map = function() { emit(this.user_id, 1); };
    // Reduce function
    var reduce = function(k,vals) { return 1; };

    try {
      // Peform the map reduce
      collection.mapReduce(map, reduce, {out: {append: "test"}}, function(err, collection) {});      
      test.fail();
    } catch(err) {
      db.close();
      test.done();      
    }
  });  
}

/**
 * @ignore
 */
exports['Should correctly apply collection level read Preference to aggregate'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReadPreference = mongo.ReadPreference;

  configuration.newDbInstance({w:1}, {poolSize:1}).open(function(err, db) {
    test.equal(null, err);
    // Set read preference
    var collection = db.collection('read_pref_1', {readPreference:ReadPreference.SECONDARY_PREFERRED});
    // Save checkout function
    var checkout = db.serverConfig.checkoutReader;
    // Set up our checker method
    db.serverConfig.checkoutReader = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      test.equal(ReadPreference.SECONDARY_PREFERRED, args[0]);
      return checkout.apply(db.serverConfig, args);
    }

    // Map function
    var map = function() { emit(this.user_id, 1); };
    // Reduce function
    var reduce = function(k,vals) { return 1; };

    // Peform the map reduce
    collection.aggregate([
        { $project : {
          author : 1,
          tags : 1
        }},
        { $unwind : "$tags" },
        { $group : {
          _id : {tags : "$tags"},
          authors : { $addToSet : "$author" }
        }}
      ], function(err, result) {
      db.serverConfig.checkoutReader = checkout;

      db.close();
      test.done();
    });
  });  
}
      
/**
 * @ignore
 */
exports['Should correctly apply collection level read Preference to stats'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReadPreference = mongo.ReadPreference;

  configuration.newDbInstance({w:1}, {poolSize:1}).open(function(err, db) {
    test.equal(null, err);
    // Set read preference
    var collection = db.collection('read_pref_1', {readPreference:ReadPreference.SECONDARY_PREFERRED});
    // Save checkout function
    var checkout = db.serverConfig.checkoutReader;
    // Set up our checker method
    db.serverConfig.checkoutReader = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      test.equal(ReadPreference.SECONDARY_PREFERRED, args[0]);
      return checkout.apply(db.serverConfig, args);
    }

    // Map function
    var map = function() { emit(this.user_id, 1); };
    // Reduce function
    var reduce = function(k,vals) { return 1; };

    // Peform the map reduce
    collection.stats(function(err, collection) {
      db.serverConfig.checkoutReader = checkout;

      db.close();
      test.done();
    });
  });  
}

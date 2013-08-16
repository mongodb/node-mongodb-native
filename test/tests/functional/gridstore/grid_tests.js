/**
 * A simple example showing the usage of the put method.
 *
 * @_class grid
 * @_function put
 * @ignore
 */
exports.shouldPutFileCorrectlyToGridUsingObjectId = function(configuration, test) {
  var Grid = configuration.getMongoPackage().Grid
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {
    // Create a new grid instance
    var grid = new Grid(db, 'fs');
    // Some data to write
    var originalData = new Buffer('Hello world');
    // Write data to grid
    grid.put(originalData, {}, function(err, result) {
      // Fetch the content
      grid.get(result._id, function(err, data) {
        test.deepEqual(originalData.toString('base64'), data.toString('base64'));

        db.close();
        test.done();
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the usage of the put method.
 *
 * @_class grid
 * @_function put
 * @ignore
 */
exports.shouldPutFileCorrectlyToGridUsingIntId = function(configuration, test) {
  var Grid = configuration.getMongoPackage().Grid
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {
    // Create a new grid instance
    var grid = new Grid(db, 'fs');
    // Some data to write
    var originalData = new Buffer('Hello world');
    // Write data to grid
    var id = 123;
    grid.put(originalData, {_id: id}, function(err, result) {
      // Fetch the content
      grid.get(id, function(err, data) {
        test.deepEqual(originalData.toString('base64'), data.toString('base64'));

        db.close();
        test.done();
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the usage of the put method.
 *
 * @_class grid
 * @_function put
 * @ignore
 */
exports.shouldPutFileCorrectlyToGridUsingStringId = function(configuration, test) {
  var Grid = configuration.getMongoPackage().Grid
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {
    // Create a new grid instance
    var grid = new Grid(db, 'fs');
    // Some data to write
    var originalData = new Buffer('Hello world');
    // Write data to grid
    var id = 'test';
    grid.put(originalData, {_id: id}, function(err, result) {
      test.equal(result._id, id);

      // Fetch the content
      grid.get(id, function(err, data) {
        test.deepEqual(originalData.toString('base64'), data.toString('base64'));

        db.close();
        test.done();
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the usage of the get method.
 *
 * @_class grid
 * @_function get
 * @ignore
 */
exports.shouldPutAndGetFileCorrectlyToGridUsingObjectId = function(configuration, test) {
  var Grid = configuration.getMongoPackage().Grid
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {
    // Create a new grid instance
    var grid = new Grid(db, 'fs');
    // Some data to write
    var originalData = new Buffer('Hello world');
    // Write data to grid
    grid.put(originalData, {}, function(err, result) {
      // Fetch the content
      grid.get(result._id, function(err, data) {
        test.deepEqual(originalData.toString('base64'), data.toString('base64'));

        // Should fail due to illegal objectID
        grid.get('not an id', function(err, result) {
          test.ok(err != null);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * @ignore
 */
exports.shouldFailToPutFileDueToDataObjectNotBeingBuffer = function(configuration, test) {
  var Grid = configuration.getMongoPackage().Grid
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    var grid = new Grid(db, 'fs');
    var originalData = 'Hello world';
    // Write data to grid
    grid.put(originalData, {}, function(err, result) {
      test.ok(err != null);
      db.close();
      test.done();
    });
  });
}

/**
 * A simple example showing the usage of the delete method.
 *
 * @_class grid
 * @_function delete
 * @ignore
 */
exports.shouldCorrectlyWriteFileAndThenDeleteIt = function(configuration, test) {
  var Grid = configuration.getMongoPackage().Grid
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {
    // Create a new grid instance
    var grid = new Grid(db, 'fs');
    // Some data to write
    var originalData = new Buffer('Hello world');
    // Write data to grid
    grid.put(originalData, {}, function(err, result) {

      // Delete file
      grid.delete(result._id, function(err, result2) {
        test.equal(null, err);
        test.equal(true, result2);

        // Fetch the content, showing that the file is gone
        grid.get(result._id, function(err, data) {
          test.ok(err != null);
          test.equal(null, data);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}
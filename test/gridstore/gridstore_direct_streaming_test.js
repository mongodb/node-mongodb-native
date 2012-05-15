var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('nodeunit').testCase,
	fs = require('fs'),
  gleak = require('../../dev/tools/gleak'),
  ObjectID = mongodb.ObjectID,
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Long = mongodb.Long,
  Collection = mongodb.Collection,
  GridStore = mongodb.GridStore,
  Chunk = mongodb.Chunk,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4}), {native_parser: (process.env['TEST_NATIVE'] != null)});
var useSSL = process.env['USE_SSL'] != null ? true : false;
var native_parser = (process.env['TEST_NATIVE'] != null);

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;  
  client.open(function(err, db_p) {
    if(numberOfTestsRun == (Object.keys(self).length)) {
      // If first test drop the db
      client.dropDatabase(function(err, done) {
        callback();
      });
    } else {
      return callback();
    }
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  var self = this;
  numberOfTestsRun = numberOfTestsRun - 1;
  // Close connection
  client.close();
  callback();
}
    
/**
 * @ignore
 */
exports.shouldCorrectlyStreamWriteToGridStoreObject = function(test) {
	// Set up gridStore
  var gridStore = new GridStore(client, "test_stream_write", "w");
  // Create a file reader stream to an object
  var fileStream = fs.createReadStream("./test/gridstore/test_gs_working_field_read.pdf");
	gridStore.on("close", function(err) {
		// Just read the content and compare to the raw binary
		GridStore.read(client, "test_stream_write", function(err, gridData) {
			var fileData = fs.readFileSync("./test/gridstore/test_gs_working_field_read.pdf");
			test.deepEqual(fileData, gridData);
			test.done();
		})
	});

	// Pipe it through to the gridStore
	fileStream.pipe(gridStore);
}

/**
 * @ignore
 */
exports.shouldCorrectlyStreamReadFromGridStoreObject = function(test) {
	// Set up gridStore
  var gridStore = new GridStore(client, "test_stream_write_2", "w");
	gridStore.writeFile("./test/gridstore/test_gs_working_field_read.pdf", function(err, result) {		
		// Open a readable gridStore
		gridStore = new GridStore(client, "test_stream_write_2", "r");		
    // Create a file write stream
    var fileStream = fs.createWriteStream("./test_stream_write_2.tmp");
		fileStream.on("close", function(err) {			
			// Read the temp file and compare
			var compareData = fs.readFileSync("./test_stream_write_2.tmp");
			var originalData = fs.readFileSync("./test/gridstore/test_gs_working_field_read.pdf");
			test.deepEqual(originalData, compareData);			
			test.done();			
		})
    // Pipe out the data
    gridStore.pipe(fileStream);
	});
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;

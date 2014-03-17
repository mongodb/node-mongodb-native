// var m = require('mongodb');
var m = require('../../../lib/mongodb');
var Db = m.Db;
var GridStore = m.GridStore;
var Server = m.Server;
var ObjectID = m.ObjectID;
var assert = require('assert');

var chunkSize = 256*1024;  // Standard 256KB chunks

var db = new Db('test', new Server('127.0.0.1', 27017));
// Establish connection to db
db.open(function(err, db) {
  assert.equal(err, null);
  // Our file ID
  var fileId = new ObjectID();

  // Open a new file
  var gridStore = new GridStore(db, fileId, 'w', { chunkSize: chunkSize });

  // Open the new file
  gridStore.open(function(err, gridStore) {

    // Create a chunkSize Buffer
    var buffer = new Buffer(chunkSize); 

    // Write the buffer
    gridStore.write(buffer, function(err, gridStore) {

      // Close the file
      gridStore.close(function(err, result) {

        // Open the same file, this time for appending data
        // No need to specify chunkSize...
        gridStore = new GridStore(db, fileId, 'w+');

        // Open the file again
        gridStore.open(function(err, gridStore) {

          // Write the buffer again
          gridStore.write(buffer, function(err, gridStore) {

          // Close the file again
          gridStore.close(function(err, result) {

            db.close();

          });
        });
      });
    });
  });
});
},{},{ w: 1 });

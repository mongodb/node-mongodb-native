var Db = require('../lib/mongodb').Db,
  Server = require('../lib/mongodb').Server,
  ObjectID = require('../lib/mongodb').ObjectID,
  GridStore = require('../lib/mongodb').GridStore;

var Mongolian = require('mongolian');
var COUNT = 1000;
var currentWritingIndex = 0;
var server = new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize:1, native_parser:true});

// Read in the test file
var fileData = require('fs').readFileSync("./test/gridstore/iya_logo_final_bw.jpg");

// ------------------------------------------------------------------------------
// TEST MONGODB NATIVE
// ------------------------------------------------------------------------------
// Open a db for the file
new Db('gridfs_benchmark', server, {}).open(function(err, new_client) {
  new_client.dropDatabase(function(err, result) {
    new_client.close();

    new Db('gridfs_benchmark', server, {}).open(function(err, client) {
      // Start Time
      var startTime = new Date().getTime();
      
      // Iterate COUNT times writing file to gridfs
      for(var i = 0; i < COUNT; i++) {
        var gridStore = new GridStore(client, "foobar" + i, "w");
        gridStore.open(function(err, gridStore) {
          gridStore.writeBuffer(fileData, true, function(err, gridStore) {
            // Update current write index
            currentWritingIndex = currentWritingIndex + 1;
          
            // finish up
            if(currentWritingIndex >= COUNT) {
              // Start Time
              var endTime = new Date().getTime();
              var totalTime = (endTime - startTime);
              var msPerOperation = totalTime/COUNT;
              var operationsPrSecond = 1000/msPerOperation;
              var bytesPrSecond = Math.floor(fileData.length * operationsPrSecond);
              var mbsPrSecond = (bytesPrSecond/1024)/1024 ;
                            
              console.log("-------------------------------------------------- DONE NATIVE")
              console.log("total time ms :: " + totalTime);
              console.log("ms pr operation :: " + msPerOperation);
              console.log("operations pr second :: " + operationsPrSecond);
              console.log("bytes pr second :: " + bytesPrSecond);
              console.log("MB pr second :: " + mbsPrSecond);
              // Close db
              client.close();
              // Execute mongolian test
              executeMongolianTest();
            }
          })
        });
      }
    });    
  })  
});

// ------------------------------------------------------------------------------
// TEST MONGODB NATIVE
// ------------------------------------------------------------------------------
var executeMongolianTest = function() {
  var db = new Mongolian('mongo://localhost/mongolian_test', { log:false })
  var gridfs = db.gridfs('testfs')
  
  // Number of executed operations
  var currentWritingIndexM = 0;
  // Start Time
  var startTime = new Date().getTime();

  // Execute Mongolian Count times writing data
  for(var i = 0; i < COUNT; i++) {
    var stream = gridfs.create('foo' + i).writeStream();
    stream.on('close', function() {
      currentWritingIndexM = currentWritingIndexM + 1;
      
      if(currentWritingIndexM >= COUNT) {        
        // Start Time
        var endTime = new Date().getTime();
        var totalTime = (endTime - startTime);
        var msPerOperation = totalTime/COUNT;
        var operationsPrSecond = 1000/msPerOperation;
        var bytesPrSecond = Math.floor(fileData.length * operationsPrSecond);
        var mbsPrSecond = (bytesPrSecond/1024)/1024 ;
                      
        console.log("-------------------------------------------------- DONE MONGOLIAN")
        console.log("total time ms :: " + totalTime);
        console.log("ms pr operation :: " + msPerOperation);
        console.log("operations pr second :: " + operationsPrSecond);
        console.log("bytes pr second :: " + bytesPrSecond);
        console.log("MB pr second :: " + mbsPrSecond);
        
        // Close connection
        db.server.close()
      }
    });

    // Write file
    stream.end(fileData);
  }  
}

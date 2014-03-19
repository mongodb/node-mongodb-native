  var m = require('../../../lib/mongodb');

  var GridStore = m.GridStore
    , ObjectID = m.ObjectID
    , MongoClient = m.MongoClient
    , ReadPreference = m.ReadPreference
    , fs = require('fs')
  // var client = configuration.db();

MongoClient.connect("mongodb://localhost:30010,localhost:30011/t?replicaSet=replica-set-foo", function(err, client) {
  console.dir(client.serverConfig)

  client.dropDatabase(function() {
    var gridStore = new GridStore(client, null, 'w', {w:'majority', wtimeout: 10000});

    // Force multiple chunks to be stored
    gridStore.chunkSize = 5000;
    var fileSize = fs.statSync('./test/tests/functional/gridstore/test_gs_weird_bug.png').size;
    var data = fs.readFileSync('./test/tests/functional/gridstore/test_gs_weird_bug.png');

    // console.log("++++++++++++++++++++++++++++ GRIDSTORE")
    // console.log("++++++++++++++++++++++++++++ GRIDSTORE")
    // console.log("++++++++++++++++++++++++++++ GRIDSTORE")

    gridStore.open(function(err, gridStore) {
      // test.equal(null, err);
    // console.log("++++++++++++++++++++++++++++ GRIDSTORE 1")
    // console.log("++++++++++++++++++++++++++++ GRIDSTORE 1")
    // console.log("++++++++++++++++++++++++++++ GRIDSTORE 1")
    //     console.log("-0----------------------")
    //     console.dir(err)

      // Write the file using write
      gridStore.write(data, function(err, doc) {
        // test.equal(null, err);
    
        gridStore.close(function(err, doc) {
          // test.equal(null, err);

          // Save checkout function
          var checkout = client.serverConfig.checkoutReader;
          
          // Set up our checker method
          client.serverConfig.checkoutReader = function() {
            var args = Array.prototype.slice.call(arguments, 0);
            // test.equal(ReadPreference.SECONDARY, args[0]);
            return checkout.apply(client.serverConfig, args);
          }

          // Read the file using readBuffer
          new GridStore(client, doc._id, 'r', {readPreference:ReadPreference.SECONDARY}).open(function(err, gridStore) {
            gridStore.read(function(err, data2) {
              // test.equal(null, err);
              // test.equal(data.toString('base64'), data2.toString('base64'));
              client.serverConfig.checkoutReader = checkout;
              client.close();
              // console.log("------------- 0")
              // test.done();
            })
          });
        });
      })
    });
  });
});

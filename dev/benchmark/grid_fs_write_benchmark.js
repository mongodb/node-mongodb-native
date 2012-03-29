var Db = require('../../lib/mongodb').Db,
  Server = require('../../lib/mongodb').Server,
  ObjectID = require('../../lib/mongodb').ObjectID,
  GridStore = require('../../lib/mongodb').GridStore;

var simulated_buffer = new Buffer(1024*1000*10).toString();

new Db('grid_fs_write_benchmark', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {}).open(function(err, new_client) {
  new_client.dropDatabase(function(err, result) {
    new_client.close();

    for(var i = 0; i < 1; i++) {
      new Db('grid_fs_write_benchmark', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {}).open(function(err, client) {
        var gridStore = new GridStore(client, "foobar" + i, "w");
        gridStore.open(function(err, gridStore) {    
          gridStore.write(simulated_buffer.toString(), function(err, gridStore) {
            gridStore.close(function(err, result) {
              client.close();
            });
          });
        });    
      });    
    }
  })  
});

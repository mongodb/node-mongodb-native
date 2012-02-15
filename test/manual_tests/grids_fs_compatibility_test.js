var Server = require("../../lib/mongodb").Server,
  Db = require("../../lib/mongodb").Db,
  ObjectID = require("../../lib/mongodb").ObjectID,
  GridStore = require("../../lib/mongodb").GridStore;

var options = {
  auto_reconnect: true,
  poolSize: 1,
  socketOptions: { timeout:8000 }
};

var db = new Db("data", new Server( 'localhost', 27017, options));
db.open(function(err, client){
  var id = new ObjectID();
  // Write a file into gridfs and then verify that it's readable
  var gridStore = new GridStore(client, 'manual_test.jpg', "w");
  gridStore.writeFile('/Users/christiankvalheim/coding/projects/node-mongodb-native/test/gridstore/iya_logo_final_bw.jpg', function(err, result) {
    db.close();
  })  
});
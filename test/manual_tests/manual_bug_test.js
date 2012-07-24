var mongodb = require('../../lib/mongodb').pure();
var Db = mongodb.Db;
var Server = mongodb.Server ;
var Collection = mongodb.Collection;
var ReplSetServers = mongodb.ReplSetServers;

var useSSL = false;
var host = "ip-10-248-145-104";
var port = 27017;
var databasename = 'nodedb';
var username = 'user';
var password = 'pass';

var replSet = new ReplSetServers([
  new Server( 'localhost', 30000, { auto_reconnect: false } ),
  new Server( 'localhost', 30001, { auto_reconnect: false } )
], {rs_name:'replica-set-foo'});

var client = new Db(databasename, replSet, {native_parser: false});
client.open(function(err, db_p) {
  console.log("================================================ 0")

  if (err){
    console.log('ERR:'+err);
    console.log('DB:'+db_p);
  }

  client.authenticate(username, password, function(err, replies) {
    console.log("================================================ 1")
    console.dir(err)

    if (err){
      console.log('ERR AUTH:'+err);
      console.log('replies:'+replies);
    }

    client.collection('userconfirm', function( err, result ){
      console.log("================================================ 2")
      if (err){
        console.log('Collection ERR:'+err);
      }

      var userconfirm = result;
      var ensureIndexOptions = { unique: true, safe: false, background: true };

      userconfirm.ensureIndex({ 'confirmcode':1 }, ensureIndexOptions, function(err, item){

        if (err){
          console.log('Userconfirm ensure index failed:'+err);
        }

        client.collection('session', function( err, result ){
          console.log("================================================ 3")
          if (err){
            console.log('Collection SESSION ERR:'+err);
          }

          var session = result;

          session.ensureIndex({ 'sid': 1 }, ensureIndexOptions, function(err, res){
            console.log("================================================ 4")
            if(err){
              console.log('Session ensure index failed'+err);
            }

            client.close();
          });
        });
      });
    });
  });
});
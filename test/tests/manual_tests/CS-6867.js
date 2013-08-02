// var x = new ReplSetTest({"useHostName":"false", "nodes" : {node0 : {}, node1 : {}, arbiter : {}}})
// var x = new ReplSetTest({"useHostName":"false", "nodes" : {node0 : {}, node1 : {}, node2 : {}, arbiter : {}}})
// var x = new ReplSetTest({"useHostName":"false", "nodes" : {node0 : {}, node1 : {}, node2 : {}}})
// x.startSet();
// var config = x.getReplSetConfig()
// config.members[0].priority = 10
// x.initiate(config);
// // once running, start the node script
// x.stopMaster(); // shut down master
// x.start(0); // restart the master


var assert = require('assert')
var uri = 'mongodb://localhost:31000,localhost:31001,localhost:31002';
var mongo = require('../../../lib/mongodb')
var Server = mongo.Server;
var ReplSetServers = mongo.ReplSet;
var Db = mongo.Db;



var log_hostname = 'localhost localhost localhost'.split(' ');
var log_port = '31000 31001 31002'.split(' ');
var replica_servers = [];
for (var i=0; i<log_hostname.length; i++) {
replica_servers[i] = new Server(log_hostname[i], log_port[i], {auto_reconnect: true, poolSize: 5});
}
var rsname = 'testReplSet';
log_server = new ReplSetServers(replica_servers, {rs_name:rsname, poolSize:100});

var db = new Db('test', log_server, {safe:true});
db.open(function(err, p_db) {
  if (err) throw err;

  console.log('connected');

  var c = db.collection('test');

  function test () {
    var date = new Date;
    c.insert({ x: date }, { w: 1 }, function (err) {
      if (err) console.error(err);
      c.findOne({ x: date }, function (err, doc) {
        if (err) console.error(err);
        console.log('found', doc);
        setTimeout(test, 1000);
      })
    })
  }

  test();

  function done (err) {
    if (err) console.error(err);
    db.close();
  }
})




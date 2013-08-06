// require('nodetime').profile()
// var memwatch = require('memwatch');
// memwatch.on('leak', function(info) {
//   // look at info to find out about what might be leaking
//   console.dir(info)
// });

var http            = require('http'),
    os              = require('os'),
    mongodb         = require('../../../lib/mongodb'),
    Server          = mongodb.Server,
    ReadPreference = mongodb.ReadPreference,
    ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager,
    ReplSetServers  = mongodb.ReplSetServers,
    Db              = mongodb.Db,
    MongoClient     = mongodb.MongoClient;

console.log('launching simple mongo application...');

//open replicaset
var replSet = new ReplSetServers([
        new Server('127.0.0.1', 30000, { auto_reconnect: true }),
        new Server('127.0.0.1', 30001, { auto_reconnect: true }),
        new Server('127.0.0.1', 30002, { auto_reconnect: true })
    ], {
      rs_name: 'testappset',
      readPreference: ReadPreference.SECONDARY_ONLY,
      strategy: 'ping'
      // ha:true
    }
);

// RS = new ReplicaSetManager({name:"testappset", retries:120, secondary_count:2, passive_count:0, arbiter_count:0, auth:true});
// RS.startSet(true, function(err, result) {
//   process.exit(0)
//   if(err != null) throw err;

  // setInterval(function() {
  //   console.log("================================= heap snapshot");
  //   console.dir(hd)
  // }, 30000)

  //opens the database
  // var db = new Db('testapp', replSet);
  // db.open(function(err) {
  MongoClient.connect("mongodb://a:a@localhost:30000,localhost:30001,localhost:30002/foo?authSource=admin&readPreference=primary", {
    replSet: {
      socketOptions: {connectTimeoutMS: 1000, socketTimeoutMS: 1000}      
    },
    server: {
      socketOptions: {connectTimeoutMS: 1000, socketTimeoutMS: 1000}      
    }
  }, function(err, db) {
      if (err) return console.log('database open error %o', err);
      console.log('database opened');

      db.collection('stats', function(statsErr, stats) {
          if (statsErr) return console.log('error opening stats %o', err);
          stats.remove({}, {w:1}, function(err, result) {
            console.log("================================================================")
            console.dir(err)

            stats.insert({name:'reqcount', value:0}, {w:1}, function(err, result) {
              console.log("================================================================")
              console.dir(err)
              //create server
              http.createServer(function (req, res) {
                  if (req.url !== '/') {
                      res.end();
                      return console.log('invalid request performed');
                  }
                  // var hd = new memwatch.HeapDiff();

                  //get amount of requests done
                  stats.findOne({name: 'reqcount'}, function(err, reqstat) {
                      if(err) {
                        res.writeHead(200, {'Content-Type': 'text/plain'});
                        res.end('Hello World, from server node: ' + os.hostname() + '...\nError #' + err + ', reqstat ' + reqstat
                          + ", secondaries.length " + db.serverConfig.secondaries.length
                          // + ", passives.length " + db.serverConfig.passives.length
                          // + ", arbiters.length " + db.serverConfig.arbiters.length
                          + ", primary " + (db.serverConfig.primary == null ? false : true)
                        );
                        return console.log('reqstat is null!');
                      }
                      var reqcount = reqstat.value;

                      //write to client
                      res.writeHead(200, {'Content-Type': 'text/plain'});
                      res.end('Hello World, from server node: ' + os.hostname() + '...\nThis is visit #' + reqcount
                        + ", secondaries.length " + db.serverConfig.secondaries.length
                        // + ", passives.length " + db.serverConfig.passives.length
                        // + ", arbiters.length " + db.serverConfig.arbiters.length
                        + ", primary " + (db.serverConfig.primary == null ? false : true)
                      );
                  });

                  //increment amount of requests
                  console.log('incrementing request by 1!');
                  stats.update({name: 'reqcount'}, {'$inc': {value: 1}}, {upsert: true, w:0});
                  // var diff = hd.end();
                  // console.log("======================================= DIFF")
                  // console.dir(diff.change)
              }).listen(8000);
            });
          });

          console.log('Server running at port 8000');
      });
  });
// });


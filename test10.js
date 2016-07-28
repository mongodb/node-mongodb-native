var MongoClient = require('./').MongoClient;
var Logger = require('./').Logger;
// Logger.setLevel('debug');

var url = 'mongodb://candidate.63.mongolayer.com:10649,candidate.64.mongolayer.com:10491/app-staging?replicaSet=set-56be39f36887897ebf0007db';

MongoClient.connect(url, function(err, db) {
  console.dir(err)
  if (err) throw err;

  db.topology.on('serverDescriptionChanged', function(event) {
    console.log('received serverDescriptionChanged');
    console.log(JSON.stringify(event, null, 2));
  });

  db.topology.on('serverHeartbeatStarted', function(event) {
    console.log('received serverHeartbeatStarted');
    console.log(JSON.stringify(event, null, 2));
  });

  db.topology.on('serverHeartbeatSucceeded', function(event) {
    console.log('received serverHeartbeatSucceeded');
    console.log(JSON.stringify(event, null, 2));
  });

  db.topology.on('serverHeartbeatFailed', function(event) {
    console.log('received serverHeartbeatFailed');
    console.log(JSON.stringify(event, null, 2));
  });

  db.topology.on('serverOpening', function(event) {
    console.log('received serverOpening');
    console.log(JSON.stringify(event, null, 2));
  });

  db.topology.on('serverClosed', function(event) {
    console.log('received serverClosed');
    console.log(JSON.stringify(event, null, 2));
  });

  db.topology.on('topologyOpening', function(event) {
    console.log('received topologyOpening');
    console.log(JSON.stringify(event, null, 2));
  });

  db.topology.on('topologyClosed', function(event) {
    console.log('received topologyClosed');
    console.log(JSON.stringify(event, null, 2));
  });

  db.topology.on('topologyDescriptionChanged', function(event) {
    console.log('received topologyDescriptionChanged');
    console.log(JSON.stringify(event, null, 2));
  });
});

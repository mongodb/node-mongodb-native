var MongoClient = require('./').MongoClient;

MongoClient.connect('mongodb://localhost:27017/test', { poolSize: 10, autoReconnect: true, connectTimeoutMS: 500, socketTimeoutMS: 1000 }, function(err, db) {
  if (err) {
    console.log(new Error('Cannot connect to Mongo -> stop'));
    process.exit(-1);
  } else {
    console.log("Connected to test database");

    db.on('close', function() {
      console.log('Connection lost to database');
      dbOk = false;
    });

    db.on('reconnect', function() {
      console.log('Reconnecting to database');
      dbOk = true;
    });

    entries = db.collection('entries');
    dbOk = true;
  }
});


const MongoClient = require('./').MongoClient;

var i=0;

// return MongoClient.connect('mongodb://login:pw@full.hostname.net:27017/dbName',
return MongoClient.connect('mongodb://admin:admin@10.211.55.6:27017/admin', {
    db: {bufferMaxEntries: 0, autoReconnect: true },
    server: {reconnectTries: 5000, reconnectInterval:5000,
      socketOptions: {
        socketTimeoutMS: 10000,
        connectTimeoutMS: 3000,
        autoReconnect : true
      }
    }
  }, function(err, db) {
    var _db = db.db('test');

    if (err) {
      return console.error('Err:', err);
    }

    setInterval(function() {
      i++;
      console.log('Interval: #' + i);

      return _db.collection('tests').insertOne({test:i}, function(err, result) {
          if (err) {
              console.log('Err #' + i + ': ' + err.message);
          } else {
              console.log('OK / Inserted #' + result.ops[0].test);
          }
      });
    }, 5000);
});

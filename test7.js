const MongoClient = require('./').MongoClient;
var i=0;
return MongoClient.connect('mongodb://test982jN:bi7Fv43@jello.modulusmongo.net:27017/em8edadA', {
    db: {bufferMaxEntries: 0, autoReconnect: true },
    server: {reconnectTries: 5000, reconnectInterval:5000,
      socketOptions: {
        socketTimeoutMS: 10000,
        autoReconnect : true
      }
    }
  }, function(err, db) {
    if (err) {
      return console.error('Err:', err);
    }

    setInterval(function() {
      i++;
      console.log('Interval: #' + i);
      return db.collection('tests').insertOne({test:i}, function(err, result) {
        if (err) {
          console.log('Err #' + i + ': ' + err.message);
        } else {
          console.log('OK / Inserted #' + result.ops[0].test);
        }
      });
    }, 5000);
});

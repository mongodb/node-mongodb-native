var MongoClient = require('./').MongoClient;

MongoClient.connect('mongodb://localhost:27017/test?connectTimeoutMS=999999&socketTimeoutMS=9999999', {
  server: {
    monitoring: true,
    haInterval: 1000
  }
}, function(err, db) {
  // console.log(db.serverConfig.connections()[0])
  // db.close();
});

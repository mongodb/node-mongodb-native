var MongoClient = require('./').MongoClient;

MongoClient.connect('mongodb://localhost:31000,localhost:31001/test?replSet=rs&connectionTimeoutMS=5000', {
  server: {
    monitoring: true,
    haInterval: 1000,
    connectTimeoutMS: 5000
  }
}, function(err, db) {
  console.dir(err)
  // console.log(db.serverConfig.connections()[0])
  // db.close();
});

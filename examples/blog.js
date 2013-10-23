var MongoClient = require('../lib/mongodb').MongoClient
  , format = require('util').format;

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : 27017;

var LINE_SIZE = 120;

console.log("Connecting to " + host + ":" + port);
MongoClient.connect(format("mongodb://%s:%s/node-mongo-blog?w=1", host, port), function(err, db) {
  db.dropDatabase(function(err, result) {
    console.log("===================================================================================");
    console.log(">> Adding Authors");
    var collection = db.collection('authors');
    collection.createIndex(["meta", ['_id', 1], ['name', 1], ['age', 1]], function(err, indexName) {
      console.log("===================================================================================");        
      var authors = {};
      
      // Insert authors
      collection.insert([{'name':'William Shakespeare', 'email':'william@shakespeare.com', 'age':587},
        {'name':'Jorge Luis Borges', 'email':'jorge@borges.com', 'age':123}], function(err, docs) {
          docs.forEach(function(doc) {
            console.dir(doc);
            authors[doc.name] = doc;
          });
      });

      console.log("===================================================================================");        
      console.log(">> Authors ordered by age ascending");        
      console.log("===================================================================================");        
      collection.find({}, {'sort':[['age', 1]]}).each(function(err, author) {
        if(author != null) {
          console.log("[" + author.name + "]:[" + author.email + "]:[" + author.age + "]");
        } else {
          console.log("===================================================================================");        
          console.log(">> Adding users");        
          console.log("===================================================================================");                        
          var userCollection = db.collection('users');
          var users = {};
          
          userCollection.insert([{'login':'jdoe', 'name':'John Doe', 'email':'john@doe.com'}, 
            {'login':'lsmith', 'name':'Lucy Smith', 'email':'lucy@smith.com'}], function(err, docs) {
              docs.forEach(function(doc) {
                console.dir(doc);
                users[doc.login] = doc;
              });              
          });
  
          console.log("===================================================================================");        
          console.log(">> Users ordered by login ascending");        
          console.log("===================================================================================");        
          userCollection.find({}, {'sort':[['login', 1]]}).each(function(err, user) {
            if(user != null) {
              console.log("[" + user.login + "]:[" + user.name + "]:[" + user.email + "]");
            } else {
              console.log("===================================================================================");        
              console.log(">> Adding articles");        
              console.log("===================================================================================");
              var articlesCollection = db.collection('articles');
              articlesCollection.insert([
                { 'title':'Caminando por Buenos Aires', 
                  'body':'Las callecitas de Buenos Aires tienen ese no se que...', 
                  'author_id':authors['Jorge Luis Borges']._id},
                { 'title':'I must have seen thy face before', 
                  'body':'Thine eyes call me in a new way', 
                  'author_id':authors['William Shakespeare']._id, 
                  'comments':[{'user_id':users['jdoe']._id, 'body':"great article!"}]
                }
              ], function(err, docs) {
                docs.forEach(function(doc) {
                  console.dir(doc);
                });              
              })
              
              console.log("===================================================================================");        
              console.log(">> Articles ordered by title ascending");        
              console.log("===================================================================================");        
              articlesCollection.find({}, {'sort':[['title', 1]]}).each(function(err, article) {
                if(article != null) {
                  console.log("[" + article.title + "]:[" + article.body + "]:[" + article.author_id.toHexString() + "]");
                  console.log(">> Closing connection");
                }
                db.close();
              });
            }
          });
        }
      });
    });
  });
});
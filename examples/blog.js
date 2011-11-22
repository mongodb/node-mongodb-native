GLOBAL.DEBUG = true;

test = require("assert");

var Db = require('../lib/mongodb').Db,
  Connection = require('../lib/mongodb').Connection,
  Server = require('../lib/mongodb').Server;

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : Connection.DEFAULT_PORT;

var LINE_SIZE = 120;

console.log("Connecting to " + host + ":" + port);
var db = new Db('node-mongo-blog', new Server(host, port, {}), {native_parser:true});
db.open(function(err, db) {
  db.dropDatabase(function(err, result) {
    console.log("===================================================================================");
    console.log(">> Adding Authors");
    db.collection('authors', function(err, collection) {
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
        collection.find({}, {'sort':[['age', 1]]}, function(err, cursor) {
          cursor.each(function(err, author) {
            if(author != null) {
              console.log("[" + author.name + "]:[" + author.email + "]:[" + author.age + "]");
            } else {
              console.log("===================================================================================");        
              console.log(">> Adding users");        
              console.log("===================================================================================");                        
              db.collection('users', function(err, userCollection) {
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
                userCollection.find({}, {'sort':[['login', 1]]}, function(err, cursor) {
                  cursor.each(function(err, user) {
                    if(user != null) {
                      console.log("[" + user.login + "]:[" + user.name + "]:[" + user.email + "]");
                    } else {
                      console.log("===================================================================================");        
                      console.log(">> Adding articles");        
                      console.log("===================================================================================");                                              
                      db.collection('articles', function(err, articlesCollection) {
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
                        articlesCollection.find({}, {'sort':[['title', 1]]}, function(err, cursor) {
                          cursor.each(function(err, article) {
                            if(article != null) {
                              console.log("[" + article.title + "]:[" + article.body + "]:[" + article.author_id.toHexString() + "]");
                              console.log(">> Closing connection");
                              db.close();
                            }
                          });
                        });
                      });
                    }
                  });
                });
              });              
            }
          });
        });
      });
    });
  });
});
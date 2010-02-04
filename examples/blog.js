require.paths.unshift("../lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");

var mongo = require('mongodb/db');
process.mixin(mongo, require('mongodb/connection'));
process.mixin(mongo, require('mongodb/bson/bson'));

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : mongo.Connection.DEFAULT_PORT;

var LINE_SIZE = 120;

sys.puts("Connecting to " + host + ":" + port);
var db = new mongo.Db('node-mongo-blog', new mongo.Server(host, port, {}), {});
db.open(function(db) {
  db.dropDatabase(function() {
    sys.puts("===================================================================================");
    sys.puts(">> Adding Authors");
    db.collection(function(collection) {
      collection.createIndex(function(indexName) {
        sys.puts("===================================================================================");        
        var authors = {};
        
        // Insert authors
        collection.insert([{'name':'William Shakespeare', 'email':'william@shakespeare.com', 'age':587},
          {'name':'Jorge Luis Borges', 'email':'jorge@borges.com', 'age':123}], function(docs) {
            docs.forEach(function(doc) {
              sys.puts(sys.inspect(doc.unorderedHash()));
              authors[doc.get('name')] = doc;
            });
        });

        sys.puts("===================================================================================");        
        sys.puts(">> Authors ordered by age ascending");        
        sys.puts("===================================================================================");        
        collection.find(function(cursor) {
          cursor.each(function(author) {
            if(author != null) {
              sys.puts("[" + author.get('name') + "]:[" + author.get('email') + "]:[" + author.get('age') + "]");
            } else {
              sys.puts("===================================================================================");        
              sys.puts(">> Adding users");        
              sys.puts("===================================================================================");                        
              db.collection(function(userCollection) {
                var users = {};
                
                userCollection.insert([{'login':'jdoe', 'name':'John Doe', 'email':'john@doe.com'}, 
                  {'login':'lsmith', 'name':'Lucy Smith', 'email':'lucy@smith.com'}], function(docs) {
                    docs.forEach(function(doc) {
                      sys.puts(sys.inspect(doc.unorderedHash()));
                      users[doc.get('login')] = doc;
                    });              
                });

                sys.puts("===================================================================================");        
                sys.puts(">> Users ordered by login ascending");        
                sys.puts("===================================================================================");        
                userCollection.find(function(cursor) {
                  cursor.each(function(user) {
                    if(user != null) {
                      sys.puts("[" + user.get('login') + "]:[" + user.get('name') + "]:[" + user.get('email') + "]");
                    } else {
                      sys.puts("===================================================================================");        
                      sys.puts(">> Adding articles");        
                      sys.puts("===================================================================================");                                              
                      db.collection(function(articlesCollection) {
                        articlesCollection.insert([
                          { 'title':'Caminando por Buenos Aires', 
                            'body':'Las callecitas de Buenos Aires tienen ese no se que...', 
                            'author_id':authors['Jorge Luis Borges'].get('_id')},
                          { 'title':'I must have seen thy face before', 
                            'body':'Thine eyes call me in a new way', 
                            'author_id':authors['William Shakespeare'].get('_id'), 
                            'comments':[{'user_id':users['jdoe'].get('_id'), 'body':"great article!"}]
                          }
                        ], function(docs) {
                          docs.forEach(function(doc) {
                            sys.puts(sys.inspect(doc.unorderedHash()));
                          });              
                        })
                        
                        sys.puts("===================================================================================");        
                        sys.puts(">> Articles ordered by title ascending");        
                        sys.puts("===================================================================================");        
                        articlesCollection.find(function(cursor) {
                          cursor.each(function(article) {
                            if(article != null) {
                              sys.puts("[" + article.get('title') + "]:[" + article.get('body') + "]:[" + article.get('author_id').toHexString() + "]");
                              sys.puts(">> Closing connection");
                              db.close();
                            }
                          });
                        }, {}, {'sort':[['title', 1]]});                        
                      }, 'articles');
                    }
                  });
                }, {}, {'sort':[['login', 1]]});
              }, 'users');              
            }
          });
        }, {}, {'sort':[['age', 1]]});
      }, ["meta", ['_id', 1], ['name', 1], ['age', 1]]);

    }, 'authors');
  });
});
# API Changes
We removed the following API methods.
- Db.prototype.authenticate
- Db.prototype.logout
- Db.prototype.open
- Db.prototype.db
- Admin.prototype.authenticate
- Admin.prototype.logout
- Admin.prototype.profilingLevel
- Admin.prototype.setProfilingLevel
- Admin.prototype.profilingInfo

We've added the following API methods.
- MongoClient.prototype.logout
- MongoClient.prototype.isConnected
- MongoClient.prototype.db
- MongoClient.prototype.close
- MongoClient.prototype.connect
- Db.prototype.profilingLevel
- Db.prototype.setProfilingLevel
- Db.prototype.profilingInfo

Core is we have removed the possibility of authenticating multiple credentials against the same connection pool. This is to avoid problems with MongoDB 3.6 or higher where all users will recide in the admin database and thus db level authentication is no longer supported.

The legacy construct

```js
var db = var Db('test', new Server('localhost', 27017));
db.open((err, db) => {
  // Authenticate
  db.admin().authenticate('root', 'root', (err, success) => {
    ....
  });
});
```

is replaced with

```js
new MongoClient(new Server('localhost', 27017), { 
    user: 'root'
  , password: 'root'
  , authSource: 'adming'}).connect((err, client) => {
    ....
  })
```

`MongoClient.connect` works as expected but it returns the MongoClient instance instead of a database object.

The legacy operation

```js
MongoClient.connect('mongodb://localhost:27017/test', (err, db) => {  
});
```

is replaced with

```js
MongoClient.connect('mongodb://localhost:27017/test', (err, client) => {
  var db = client.db('test');
});
```
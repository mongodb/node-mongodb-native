# Candidates
Additional auth related candidates for removal are the db level addUser/removeUser as there will
no longer be any users at the db level for 3.6 or higher.
- Db.prototype.addUser
- Db.prototyoe.removeUser

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
- Cursor.prototype.nextObject

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

## Connection String Changes
Following [changes to the MongoDB connection string specification](https://github.com/mongodb/specifications/commit/4631ccd4f825fb1a3aba204510023f9b4d193a05), authentication and hostname details in connection strings must now be URL-encoded. These changes reduce ambiguity in connection strings.

For example, whereas before `mongodb://u$ername:pa$$w{}rd@/tmp/mongodb-27017.sock/test` would have been a valid connection string (with username `u$ername`, password `pa$$w{}rd`, host `/tmp/mongodb-27017.sock` and auth database `test`), the connection string for those details would now have to be provided to MongoClient as `mongodb://u%24ername:pa%24%24w%7B%7Drd@%2Ftmp%2Fmongodb-27017.sock/test`.

For more information about connection strings, read the [connection string specification](https://github.com/mongodb/specifications/blob/master/source/connection-string/connection-string-spec.rst).

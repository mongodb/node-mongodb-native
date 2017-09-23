'use strict';

var MongoClient = require('../../').MongoClient,
  ServerManager = require('mongodb-topology-manager').Server,
  co = require('co'),
  f = require('util').format,
  bson = require('../../');

// Stand up a single mongodb instance
function globalSetup() {
  return new Promise(function(resolve, reject) {
    co(function*() {
      var manager = new ServerManager('mongod', {
        bind_ip: 'localhost',
        port: 27017,
        dbpath: f('%s/../db/27017', __dirname),
        storageEngine: 'inMemory',
        quiet: null
      });

      // Purge the directory
      yield manager.purge();
      // Start the server
      yield manager.start();
      // Ready
      resolve(manager);
    }).catch(reject);
  });
}

// Connect to MongoDB
function getDb(db, poolSize) {
  return new Promise(function(resolve, reject) {
    co(function*() {
      resolve(
        yield MongoClient.connect(f('mongodb://localhost:27017/%s?maxPoolSize=%s', db, poolSize))
      );
    }).catch(reject);
  });
}

function type(value) {
  if (value && value._bsontype) return value._bsontype;
  return /\[object (\w+)\]/.exec(Object.prototype.toString.call(value))[1];
}

function isObject(value) {
  return type(value) === 'Object';
}

// Map the extended json to type
var map = {
  $oid: function(data) {
    return bson.ObjectID(data.$oid.toString());
  },
  $binary: function(val) {
    return bson.Binary(new Buffer(val.$binary, 'base64'));
  },
  $ref: function(val) {
    return bson.DBRef(val.$ref, val.$id);
  },
  $timestamp: function(val) {
    return bson.Timestamp(val.$timestamp.$t, val.$timestamp.$i);
  },
  $numberLong: function(val) {
    return bson.Long.fromString(val.$numberLong.toString());
  },
  $maxKey: function() {
    return bson.MaxKey();
  },
  $minKey: function() {
    return bson.MinKey();
  },
  $date: function(val) {
    var d = new Date();

    // Kernel bug.  See #2 http://git.io/AEbmFg
    if (isNaN(d.setTime(val.$date))) {
      d = new Date(val.$date);
    }
    return d;
  },
  $regex: function(val) {
    return new RegExp(val.$regex, val.$options);
  },
  $undefined: function() {
    return undefined;
  }
};

function deflate(data) {
  if (Array.isArray(data)) return data.map(deflate);
  if (!isObject(data)) return data;

  var keys = Object.keys(data);
  if (keys.length === 0) return data;

  var caster = map[keys[0]];
  if (!caster) {
    return keys.reduce(function(schema, key) {
      schema[key] = deflate(data[key]);
      return schema;
    }, {});
  }

  return caster(data);
}

module.exports = {
  globalSetup: globalSetup,
  getDb: getDb,
  deflate: deflate
};

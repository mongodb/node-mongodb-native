var Db = require('./db').Db;

/**
 * Create a new MongoClient instance.
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority'} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1 or w = 'majority' acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning
 *  - **journal**, (Boolean, default:false) write waits for journal sync before returning
 *  - **readPreference** {String}, the prefered read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *  - **native_parser** {Boolean, default:false}, use c++ bson parser.
 *  - **forceServerObjectId** {Boolean, default:false}, force server to create _id fields instead of client.
 *  - **pkFactory** {Object}, object overriding the basic ObjectID primary key generation.
 *  - **serializeFunctions** {Boolean, default:false}, serialize functions.
 *  - **raw** {Boolean, default:false}, peform operations using raw bson buffers.
 *  - **recordQueryStats** {Boolean, default:false}, record query statistics during execution.
 *  - **retryMiliSeconds** {Number, default:5000}, number of miliseconds between retries.
 *  - **numberOfRetries** {Number, default:5}, number of retries off connection.
 * 
 * Deprecated Options 
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *
 * @class Represents a MongoClient
 * @param {Object} serverConfig server config object.
 * @param {Object} [options] additional options for the collection.
 */
function MongoClient(serverConfig, options) {
  options = options == null ? {} : options;
  // If no write concern is set set the default to w:1
  if(options != null && !options.safe && !options.journal && !options.w && !options.fsync) {    
    options.w = 1;
  }

  // The internal db instance we are wrapping
  var _db = new Db('test', serverConfig, options);
  // Self reference
  var self = this;

  /**
   * Initialize the database connection.
   *
   * @param {Function} callback returns index information.
   * @return {null}
   * @api public
   */
  MongoClient.prototype.open = function(callback) {  
    _db.open(function(err, db) {
      if(err) return callback(err, null);
      callback(null, self);
    })
  }

  /**
   * Close the current db connection, including all the child db instances. Emits close event if no callback is provided.
   *
   * @param {Function} [callback] returns the results.
   * @return {null}
   * @api public
   */
  MongoClient.prototype.close = function(callback) {  
    _db.close(callback);
  }

  /**
   * Create a new Db instance sharing the current socket connections.
   *
   * @param {String} dbName the name of the database we want to use.
   * @return {Db} a db instance using the new database.
   * @api public
   */
  MongoClient.prototype.db = function(dbName) {  
    return _db.db(dbName);
  }
}

/**
 * Connect to MongoDB using a url as documented at
 *
 *  www.mongodb.org/display/DOCS/Connections
 *
 * Options
 *  - **uri_decode_auth** {Boolean, default:false} uri decode the user name and password for authentication
 *
 * @param {String} url connection url for MongoDB.
 * @param {Object} [options] optional options for insert command
 * @param {Function} callback callback returns the initialized db.
 * @return {null}
 * @api public
 */
MongoClient.connect = function(url, options, callback) {  
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }

  Db.connect(url, options, function(err, db) {
    if(err) return callback(err, null);
    // If no write concern is set set the default to w:1
    if(db.options != null && !db.options.safe && !db.options.journal && !db.options.w && !db.options.fsync) {    
      db.options.w = 1;
    }
    // Return the db
    callback(null, db);
  });
}

exports.MongoClient = MongoClient;
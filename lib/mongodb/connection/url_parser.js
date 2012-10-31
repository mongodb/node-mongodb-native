var fs = require('fs'),
  ReadPreference = require('./read_preference').ReadPreference;

exports.parse = function(url, options) {
  // Ensure we have a default options object if none set
  options = options || {};
  // Match the url format
  var urlRE = new RegExp('^mongo(?:db)?://(?:|([^@/]*)@)([^@/]*)(?:|/([^?]*)(?:|\\?([^?]*)))$');
  var match = (url || Db.DEFAULT_URL).match(urlRE);

  // If we don't have a valid url throw an expection
  if(!match) throw Error("URL must be in the format mongodb://user:pass@host:port/dbname");

  // Result object
  var object = {};

  // Pick apart the authentication part of the string
  var authPart = match[1] || '';
  var auth = authPart.split(':', 2);
  if(options['uri_decode_auth']){
    auth[0] = decodeURIComponent(auth[0]);
    if(auth[1]){
      auth[1] = decodeURIComponent(auth[1]);
    }
  }

  // Add auth to final object if we have 2 elements
  if(auth.length == 2) object.auth = {user: auth[0], password: auth[1]};

  // Variables used for temporary storage
  var hostPart;
  var urlOptions;
  var servers;
  var serverOptions = {socketOptions: {}};
  var dbOptions = {read_preference_tags: []};
  var replSetServersOptions = {socketOptions: {}};
  // Add server options to final object
  object.server_options = serverOptions;
  object.db_options = dbOptions;
  object.rs_options = replSetServersOptions;

  // Let's check if we are using a domain socket
  if(url.match(/\.sock/)) {
    // Split out the socket part
    var domainSocket = url.substring(
        url.indexOf("mongodb://") + "mongodb://".length
      , url.lastIndexOf(".sock") + ".sock".length);
    // Just replace and match
    var _temp = url.replace(domainSocket, 'localhost');
    match = (_temp || Db.DEFAULT_URL).match(urlRE);
    // Clean out any auth stuff if any
    if(domainSocket.indexOf("@") != -1) domainSocket = domainSocket.split("@")[1];
    servers = [{domain_socket: domainSocket}];
  } else {
    // Split up the db
    hostPart = match[2];
    // Parse all server results
    servers = hostPart.split(',').map(function(h) {
      var hostPort = h.split(':', 2);
      var _host = hostPort[0] || 'localhost';
      var _port = hostPort[1] != null ? parseInt(hostPort[1], 10) : 27017;
      // Return the mapped object
      return {host: _host, port: _port};
    });
  }

  // Get the db name
  object.dbName = match[3] || 'default';    
  // Split up all the options
  urlOptions = (match[4] || '').split(/[&;]/);    

  // Ugh, we have to figure out which options go to which constructor manually.
  urlOptions.forEach(function(opt) {
    if(!opt) return;
    var splitOpt = opt.split('='), name = splitOpt[0], value = splitOpt[1];

 // * Options
 // *  - **readPreference** {String, default:null}, set's the read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST)
 // *  - **ssl** {Boolean, default:false}, use ssl connection (needs to have a mongod server with ssl support)
 // *  - **slaveOk** {Boolean, default:false}, legacy option allowing reads from secondary, use **readPrefrence** instead.
 // *  - **poolSize** {Number, default:1}, number of connections in the connection pool, set to 1 as default for legacy reasons.
 // *  - **socketOptions** {Object, default:null}, an object containing socket options to use (noDelay:(boolean), keepAlive:(number), connectTimeoutMS:(number), socketTimeoutMS:(number))
 // *  - **logger** {Object, default:null}, an object representing a logger that you want to use, needs to support functions debug, log, error **({error:function(message, object) {}, log:function(message, object) {}, debug:function(message, object) {}})**.
 // *  - **auto_reconnect** {Boolean, default:false}, reconnect on error.
 // *  - **disableDriverBSONSizeCheck** {Boolean, default:false}, force the server to error if the BSON message is to big

    // Options implementations
    switch(name) {
      case 'slaveOk':
      case 'slave_ok':
        serverOptions.slave_ok = (value == 'true');
        break;
      case 'fireAndForget':
        dbOptions.fireAndForget = (value == 'true');
        break;
      case 'maxPoolSize':
      case 'poolSize':
        serverOptions.poolSize = parseInt(value, 10);
        replSetServersOptions.poolSize = parseInt(value, 10);
        break;
      case 'autoReconnect':
      case 'auto_reconnect':
        serverOptions.auto_reconnect = (value == 'true');
        break;
      case 'minPoolSize':
        throw new Error("minPoolSize not supported");
      case 'maxIdleTimeMS':
        throw new Error("maxIdleTimeMS not supported");
      case 'waitQueueMultiple':
        throw new Error("waitQueueMultiple not supported");
      case 'waitQueueTimeoutMS':
        throw new Error("waitQueueTimeoutMS not supported");
      case 'uuidRepresentation':
        throw new Error("uuidRepresentation not supported");
      case 'ssl':
        if(value == 'prefer') {
          serverOptions.socketOptions.ssl = value;
          replSetServersOptions.socketOptions.ssl = value;
          break;
        }
        serverOptions.socketOptions.ssl = (value == 'true');
        replSetServersOptions.socketOptions.ssl = (value == 'true');
        break;
      case 'replicaSet':
      case 'replicaSet':
      case 'rs_name':
        replSetServersOptions.rs_name = value;
        break;
      case 'reconnectWait':
        replSetServersOptions.reconnectWait = parseInt(value, 10);
        break;
      case 'retries':
        replSetServersOptions.retries = parseInt(value, 10);
        break;
      case 'readSecondary':
      case 'read_secondary':
        replSetServersOptions.retries = parseInt(value, 10);
        break;
      case 'fsync':
        dbOptions.fsync = (value == 'true');
        break;
      case 'journal':
        dbOptions.journal = (value == 'true');
        break;
      case 'safe':
        dbOptions.safe = (value == 'true');
        break;
      case 'nativeParser':
      case 'native_parser':
        dbOptions.native_parser = (value == 'true');
        break;
      case 'safe':
        dbOptions.safe = (value == 'true');
        break;
      case 'connectTimeoutMS':
        serverOptions.socketOptions.connectTimeoutMS = parseInt(value, 10);
        replSetServersOptions.socketOptions.connectTimeoutMS = parseInt(value, 10);
        break;
      case 'socketTimeoutMS':
        serverOptions.socketOptions.socketTimeoutMS = parseInt(value, 10);
        replSetServersOptions.socketOptions.socketTimeoutMS = parseInt(value, 10);
        break;
      case 'w':
        dbOptions.w = parseInt(value, 10);
        break;
      case 'wtimeoutMS':
        dbOptions.wtimeoutMS = parseInt(value, 10);
        break;
      case 'readPreference':
        if(!ReadPreference.isValid(value)) throw new Error("readPreference must be either primary/primaryPreferred/secondary/secondaryPreferred/nearest");
        dbOptions.read_preference = value;
        break;
      case 'readPreferenceTag':
        // Contains the tag object
        var tagObject = {};
        if(value == null || value == '') {
          dbOptions.read_preference_tags.push(tagObject);
          break;
        }

        // Split up the tags
        var tags = value.split(/\,/);
        for(var i = 0; i < tags.length; i++) {
          var parts = tags[i].trim().split(/\:/);
          tagObject[parts[0]] = parts[1];
        }

        // Set the preferences tags
        dbOptions.read_preference_tags.push(tagObject);
        break;
      default:
        break;
    }
  });

  // Validate if there are an invalid write concern combinations
  if(dbOptions.fireAndForget == true && (dbOptions.w > 0 
      || dbOptions.journal == true
      || dbOptions.fsync == true
      || dbOptions.safe == true
      || dbOptions.w)) throw new Error("fireAndForget set to false cannot be combined with safe/w/journal/fsync")

  // If no read preference set it to primary
  if(!dbOptions.read_preference) dbOptions.read_preference = 'primary';

  // Add servers to result
  object.servers = servers;

  // Returned parsed object
  return object;
}
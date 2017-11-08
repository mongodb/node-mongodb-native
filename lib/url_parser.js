'use strict';

var ReadPreference = require('./read_preference'),
  parser = require('url'),
  f = require('util').format,
  assign = require('./utils').assign,
  Logger = require('mongodb-core').Logger,
  dns = require('dns');

module.exports = function(url, options, callback) {
  var result = parser.parse(url, true);
  if (result.protocol !== 'mongodb:') {
    // TODO fix this
    if (result.protocol !== 'mongodb+srv:') {
      throw new Error('invalid schema, expected mongodb or mongodb+srv');
    }
  }

  if (result.protocol === 'mongodb+srv:') {
    if (result.port) {
      return callback(new Error('Cannot have port in srv address...'));
    }
    const srvAddress = `_mongodb._tcp.${result.host}`;
    dns.resolveSrv(srvAddress, function(err, addresses) {
      if (err) return callback(err);

      if (addresses.length === 0) {
        return callback(new Error('No addresses found at host'));
      }

      // If there are addresses, fetch any txt records
      dns.resolveTxt(result.host, function(err, records) {
        if (err && err.code !== 'ENODATA') return callback(err);
        if (err && err.code === 'ENODATA') records = null;

        let connectionStrings = addresses.map(function(address, i) {
          if (i === 0) return `mongodb://${address.name}:${address.port}`;
          else return `${address.name}:${address.port}`;
        });

        let connectionString = connectionStrings.join(',');
        if (records) connectionString += '/?' + records.join('&');

        parseHandler(connectionString, options, callback);
      });
    });
  } else {
    parseHandler(url, options, callback);
  }
};

function parseHandler(address, options, callback) {
  try {
    const result = parseConnectionString(address, options);
    return callback(null, result);
  } catch (err) {
    return callback(err);
  }
}

function parseConnectionString(url, options) {
  // Variables
  var connection_part = '';
  var auth_part = '';
  var query_string_part = '';
  var dbName = 'admin';

  // Url parser result
  var result = parser.parse(url, true);

  if ((result.hostname == null || result.hostname === '') && url.indexOf('.sock') === -1) {
    throw new Error('no hostname or hostnames provided in connection string');
  }

  if (result.port === '0') {
    throw new Error('invalid port (zero) with hostname');
  }

  if (!isNaN(parseInt(result.port, 10)) && parseInt(result.port, 10) > 65535) {
    throw new Error('invalid port (larger than 65535) with hostname');
  }

  if (
    result.path &&
    result.path.length > 0 &&
    result.path[0] !== '/' &&
    url.indexOf('.sock') === -1
  ) {
    throw new Error('missing delimiting slash between hosts and options');
  }

  if (result.query) {
    for (var name in result.query) {
      if (name.indexOf('::') !== -1) {
        throw new Error('double colon in host identifier');
      }

      if (result.query[name] === '') {
        throw new Error('query parameter ' + name + ' is an incomplete value pair');
      }
    }
  }

  if (result.auth) {
    var parts = result.auth.split(':');
    if (url.indexOf(result.auth) !== -1 && parts.length > 2) {
      throw new Error('Username with password containing an unescaped colon');
    }

    if (url.indexOf(result.auth) !== -1 && result.auth.indexOf('@') !== -1) {
      throw new Error('Username containing an unescaped at-sign');
    }
  }

  // Remove query
  var clean = url.split('?').shift();

  // Extract the list of hosts
  var strings = clean.split(',');
  var hosts = [];

  for (var i = 0; i < strings.length; i++) {
    var hostString = strings[i];

    if (hostString.indexOf('mongodb') !== -1) {
      if (hostString.indexOf('@') !== -1) {
        hosts.push(hostString.split('@').pop());
      } else {
        hosts.push(hostString.substr('mongodb://'.length));
      }
    } else if (hostString.indexOf('/') !== -1) {
      hosts.push(hostString.split('/').shift());
    } else if (hostString.indexOf('/') === -1) {
      hosts.push(hostString.trim());
    }
  }

  for (i = 0; i < hosts.length; i++) {
    var r = parser.parse(f('mongodb://%s', hosts[i].trim()));
    if (r.path && r.path.indexOf(':') !== -1) {
      throw new Error('double colon in host identifier');
    }
  }

  // If we have a ? mark cut the query elements off
  if (url.indexOf('?') !== -1) {
    query_string_part = url.substr(url.indexOf('?') + 1);
    connection_part = url.substring('mongodb://'.length, url.indexOf('?'));
  } else {
    connection_part = url.substring('mongodb://'.length);
  }

  // Check if we have auth params
  if (connection_part.indexOf('@') !== -1) {
    auth_part = connection_part.split('@')[0];
    connection_part = connection_part.split('@')[1];
  }

  // Check there is not more than one unescaped slash
  if (connection_part.split('/').length > 2) {
    throw new Error(
      "Unsupported host '" +
        connection_part.split('?')[0] +
        "'. Hosts must be URL encoded and contain at most one unencoded slash."
    );
  }

  // Check if the connection string has a db
  if (connection_part.indexOf('.sock') !== -1) {
    if (connection_part.indexOf('.sock/') !== -1) {
      dbName = connection_part.split('.sock/')[1];
      // Check if multiple database names provided, or just an illegal trailing backslash
      if (dbName.indexOf('/') !== -1) {
        if (dbName.split('/').length === 2 && dbName.split('/')[1].length === 0) {
          throw new Error('Illegal trailing backslash after database name');
        }
        throw new Error('More than 1 database name in URL');
      }
      connection_part = connection_part.split(
        '/',
        connection_part.indexOf('.sock') + '.sock'.length
      );
    }
  } else if (connection_part.indexOf('/') !== -1) {
    // Check if multiple database names provided, or just an illegal trailing backslash
    if (connection_part.split('/').length > 2) {
      if (connection_part.split('/')[2].length === 0) {
        throw new Error('Illegal trailing backslash after database name');
      }
      throw new Error('More than 1 database name in URL');
    }
    dbName = connection_part.split('/')[1];
    connection_part = connection_part.split('/')[0];
  }

  // URI decode the host information
  connection_part = decodeURIComponent(connection_part);

  // Result object
  var object = {};

  // Pick apart the authentication part of the string
  var authPart = auth_part || '';
  var auth = authPart.split(':', 2);

  // Decode the authentication URI components and verify integrity
  var user = decodeURIComponent(auth[0]);
  if (auth[0] !== encodeURIComponent(user)) {
    throw new Error('Username contains an illegal unescaped character');
  }
  auth[0] = user;

  if (auth[1]) {
    var pass = decodeURIComponent(auth[1]);
    if (auth[1] !== encodeURIComponent(pass)) {
      throw new Error('Password contains an illegal unescaped character');
    }
    auth[1] = pass;
  }

  // Add auth to final object if we have 2 elements
  if (auth.length === 2) object.auth = { user: auth[0], password: auth[1] };
  // if user provided auth options, use that
  if (options && options.auth != null) object.auth = options.auth;

  // Variables used for temporary storage
  var hostPart;
  var urlOptions;
  var servers;
  var compression;
  var serverOptions = { socketOptions: {} };
  var dbOptions = { read_preference_tags: [] };
  var replSetServersOptions = { socketOptions: {} };
  var mongosOptions = { socketOptions: {} };
  // Add server options to final object
  object.server_options = serverOptions;
  object.db_options = dbOptions;
  object.rs_options = replSetServersOptions;
  object.mongos_options = mongosOptions;

  // Let's check if we are using a domain socket
  if (url.match(/\.sock/)) {
    // Split out the socket part
    var domainSocket = url.substring(
      url.indexOf('mongodb://') + 'mongodb://'.length,
      url.lastIndexOf('.sock') + '.sock'.length
    );
    // Clean out any auth stuff if any
    if (domainSocket.indexOf('@') !== -1) domainSocket = domainSocket.split('@')[1];
    domainSocket = decodeURIComponent(domainSocket);
    servers = [{ domain_socket: domainSocket }];
  } else {
    // Split up the db
    hostPart = connection_part;
    // Deduplicate servers
    var deduplicatedServers = {};

    // Parse all server results
    servers = hostPart
      .split(',')
      .map(function(h) {
        var _host, _port, ipv6match;
        //check if it matches [IPv6]:port, where the port number is optional
        if ((ipv6match = /\[([^\]]+)\](?::(.+))?/.exec(h))) {
          _host = ipv6match[1];
          _port = parseInt(ipv6match[2], 10) || 27017;
        } else {
          //otherwise assume it's IPv4, or plain hostname
          var hostPort = h.split(':', 2);
          _host = hostPort[0] || 'localhost';
          _port = hostPort[1] != null ? parseInt(hostPort[1], 10) : 27017;
          // Check for localhost?safe=true style case
          if (_host.indexOf('?') !== -1) _host = _host.split(/\?/)[0];
        }

        // No entry returned for duplicate servr
        if (deduplicatedServers[_host + '_' + _port]) return null;
        deduplicatedServers[_host + '_' + _port] = 1;

        // Return the mapped object
        return { host: _host, port: _port };
      })
      .filter(function(x) {
        return x != null;
      });
  }

  // Get the db name
  object.dbName = dbName || 'admin';
  // Split up all the options
  urlOptions = (query_string_part || '').split(/[&;]/);
  // Ugh, we have to figure out which options go to which constructor manually.
  urlOptions.forEach(function(opt) {
    if (!opt) return;
    var splitOpt = opt.split('='),
      name = splitOpt[0],
      value = splitOpt[1];
    // Options implementations
    switch (name) {
      case 'slaveOk':
      case 'slave_ok':
        serverOptions.slave_ok = value === 'true';
        dbOptions.slaveOk = value === 'true';
        break;
      case 'maxPoolSize':
      case 'poolSize':
        serverOptions.poolSize = parseInt(value, 10);
        replSetServersOptions.poolSize = parseInt(value, 10);
        break;
      case 'appname':
        object.appname = decodeURIComponent(value);
        break;
      case 'autoReconnect':
      case 'auto_reconnect':
        serverOptions.auto_reconnect = value === 'true';
        break;
      case 'ssl':
        if (value === 'prefer') {
          serverOptions.ssl = value;
          replSetServersOptions.ssl = value;
          mongosOptions.ssl = value;
          break;
        }
        serverOptions.ssl = value === 'true';
        replSetServersOptions.ssl = value === 'true';
        mongosOptions.ssl = value === 'true';
        break;
      case 'sslValidate':
        serverOptions.sslValidate = value === 'true';
        replSetServersOptions.sslValidate = value === 'true';
        mongosOptions.sslValidate = value === 'true';
        break;
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
        replSetServersOptions.read_secondary = value === 'true';
        break;
      case 'fsync':
        dbOptions.fsync = value === 'true';
        break;
      case 'journal':
        dbOptions.j = value === 'true';
        break;
      case 'safe':
        dbOptions.safe = value === 'true';
        break;
      case 'nativeParser':
      case 'native_parser':
        dbOptions.native_parser = value === 'true';
        break;
      case 'readConcernLevel':
        dbOptions.readConcern = { level: value };
        break;
      case 'connectTimeoutMS':
        serverOptions.socketOptions.connectTimeoutMS = parseInt(value, 10);
        replSetServersOptions.socketOptions.connectTimeoutMS = parseInt(value, 10);
        mongosOptions.socketOptions.connectTimeoutMS = parseInt(value, 10);
        break;
      case 'socketTimeoutMS':
        serverOptions.socketOptions.socketTimeoutMS = parseInt(value, 10);
        replSetServersOptions.socketOptions.socketTimeoutMS = parseInt(value, 10);
        mongosOptions.socketOptions.socketTimeoutMS = parseInt(value, 10);
        break;
      case 'w':
        dbOptions.w = parseInt(value, 10);
        if (isNaN(dbOptions.w)) dbOptions.w = value;
        break;
      case 'authSource':
        dbOptions.authSource = value;
        break;
      case 'gssapiServiceName':
        dbOptions.gssapiServiceName = value;
        break;
      case 'authMechanism':
        if (value === 'GSSAPI') {
          // If no password provided decode only the principal
          if (object.auth == null) {
            var urlDecodeAuthPart = decodeURIComponent(authPart);
            if (urlDecodeAuthPart.indexOf('@') === -1)
              throw new Error('GSSAPI requires a provided principal');
            object.auth = { user: urlDecodeAuthPart, password: null };
          } else {
            object.auth.user = decodeURIComponent(object.auth.user);
          }
        } else if (value === 'MONGODB-X509') {
          object.auth = { user: decodeURIComponent(authPart) };
        }

        // Only support GSSAPI or MONGODB-CR for now
        if (
          value !== 'GSSAPI' &&
          value !== 'MONGODB-X509' &&
          value !== 'MONGODB-CR' &&
          value !== 'DEFAULT' &&
          value !== 'SCRAM-SHA-1' &&
          value !== 'PLAIN'
        )
          throw new Error(
            'only DEFAULT, GSSAPI, PLAIN, MONGODB-X509, SCRAM-SHA-1 or MONGODB-CR is supported by authMechanism'
          );

        // Authentication mechanism
        dbOptions.authMechanism = value;
        break;
      case 'authMechanismProperties':
        // Split up into key, value pairs
        var values = value.split(',');
        var o = {};
        // For each value split into key, value
        values.forEach(function(x) {
          var v = x.split(':');
          o[v[0]] = v[1];
        });

        // Set all authMechanismProperties
        dbOptions.authMechanismProperties = o;
        // Set the service name value
        if (typeof o.SERVICE_NAME === 'string') dbOptions.gssapiServiceName = o.SERVICE_NAME;
        if (typeof o.SERVICE_REALM === 'string') dbOptions.gssapiServiceRealm = o.SERVICE_REALM;
        if (typeof o.CANONICALIZE_HOST_NAME === 'string')
          dbOptions.gssapiCanonicalizeHostName = o.CANONICALIZE_HOST_NAME === 'true' ? true : false;
        break;
      case 'wtimeoutMS':
        dbOptions.wtimeout = parseInt(value, 10);
        break;
      case 'readPreference':
        if (!ReadPreference.isValid(value))
          throw new Error(
            'readPreference must be either primary/primaryPreferred/secondary/secondaryPreferred/nearest'
          );
        dbOptions.readPreference = value;
        break;
      case 'maxStalenessSeconds':
        dbOptions.maxStalenessSeconds = parseInt(value, 10);
        break;
      case 'readPreferenceTags':
        // Decode the value
        value = decodeURIComponent(value);
        // Contains the tag object
        var tagObject = {};
        if (value == null || value === '') {
          dbOptions.read_preference_tags.push(tagObject);
          break;
        }

        // Split up the tags
        var tags = value.split(/,/);
        for (var i = 0; i < tags.length; i++) {
          var parts = tags[i].trim().split(/:/);
          tagObject[parts[0]] = parts[1];
        }

        // Set the preferences tags
        dbOptions.read_preference_tags.push(tagObject);
        break;
      case 'compressors':
        compression = serverOptions.compression || {};
        var compressors = value.split(',');
        if (
          !compressors.every(function(compressor) {
            return compressor === 'snappy' || compressor === 'zlib';
          })
        ) {
          throw new Error('compressors must be at least one of snappy or zlib');
        }

        compression.compressors = compressors;
        serverOptions.compression = compression;
        break;
      case 'zlibCompressionLevel':
        compression = serverOptions.compression || {};
        var zlibCompressionLevel = parseInt(value, 10);
        if (zlibCompressionLevel < -1 || zlibCompressionLevel > 9) {
          throw new Error('zlibCompressionLevel must be an integer between -1 and 9');
        }

        compression.zlibCompressionLevel = zlibCompressionLevel;
        serverOptions.compression = compression;
        break;
      default:
        var logger = Logger('URL Parser');
        logger.warn(`${name} is not supported as a connection string option`);
        break;
    }
  });

  // No tags: should be null (not [])
  if (dbOptions.read_preference_tags.length === 0) {
    dbOptions.read_preference_tags = null;
  }

  // Validate if there are an invalid write concern combinations
  if (
    (dbOptions.w === -1 || dbOptions.w === 0) &&
    (dbOptions.journal === true || dbOptions.fsync === true || dbOptions.safe === true)
  )
    throw new Error('w set to -1 or 0 cannot be combined with safe/w/journal/fsync');

  // If no read preference set it to primary
  if (!dbOptions.readPreference) {
    dbOptions.readPreference = 'primary';
  }

  // make sure that user-provided options are applied with priority
  dbOptions = assign(dbOptions, options);

  // Add servers to result
  object.servers = servers;

  // Returned parsed object
  return object;
}

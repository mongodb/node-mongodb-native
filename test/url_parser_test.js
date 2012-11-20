/*!
 * Module dependencies.
 */
var parse = require('../lib/mongodb/connection/url_parser').parse;

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  callback();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  callback();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://localhost");
  test.equal(1, object.servers.length);
  test.equal('localhost', object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal('default', object.dbName);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost:27017'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://localhost:27017");
  test.equal(1, object.servers.length);
  test.equal('localhost', object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal('default', object.dbName);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost?safe=true&readPreference=secondary'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://localhost?safe=true&readPreference=secondary");
  // var object = parse("mongodb://localhost?safe");
  test.equal(1, object.servers.length);
  test.equal('localhost', object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal('default', object.dbName);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost:28101'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://localhost:28101");
  test.equal(1, object.servers.length);
  test.equal('localhost', object.servers[0].host);
  test.equal('28101', object.servers[0].port);
  test.equal('default', object.dbName);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://fred:foobar@localhost/baz'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://fred:foobar@localhost/baz");
  test.equal(1, object.servers.length);
  test.equal('localhost', object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal('baz', object.dbName);
  test.equal('fred', object.auth.user);
  test.equal('foobar', object.auth.password);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://fred:foo%20bar@localhost/baz'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://fred:foo%20bar@localhost/baz", {uri_decode_auth:true});
  test.equal(1, object.servers.length);
  test.equal('localhost', object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal('baz', object.dbName);
  test.equal('fred', object.auth.user);
  test.equal('foo bar', object.auth.password);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb:///tmp/mongodb-27017.sock'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb:///tmp/mongodb-27017.sock", {uri_decode_auth:true});
  test.equal(1, object.servers.length);
  test.equal('/tmp/mongodb-27017.sock', object.servers[0].domain_socket);
  test.equal('default', object.dbName);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://fred:foo@/tmp/mongodb-27017.sock'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://fred:foo@/tmp/mongodb-27017.sock", {uri_decode_auth:true});
  test.equal(1, object.servers.length);
  test.equal('/tmp/mongodb-27017.sock', object.servers[0].domain_socket);
  test.equal('default', object.dbName);
  test.equal('fred', object.auth.user);
  test.equal('foo', object.auth.password);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://fred:foo@/tmp/mongodb-27017.sock/somedb'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://fred:foo@/tmp/mongodb-27017.sock/somedb");
  test.equal(1, object.servers.length);
  test.equal('/tmp/mongodb-27017.sock', object.servers[0].domain_socket);
  test.equal('somedb', object.dbName);
  test.equal('fred', object.auth.user);
  test.equal('foo', object.auth.password);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://fred:foo@/tmp/mongodb-27017.sock/somedb?safe=true'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://fred:foo@/tmp/mongodb-27017.sock/somedb?safe=true");
  test.equal(1, object.servers.length);
  test.equal('/tmp/mongodb-27017.sock', object.servers[0].domain_socket);
  test.equal('somedb', object.dbName);
  test.equal('fred', object.auth.user);
  test.equal('foo', object.auth.password);
  test.equal(true, object.db_options.safe);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://example1.com:27017,example2.com:27018'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://example1.com:27017,example2.com:27018");
  test.equal(2, object.servers.length);
  test.equal("example1.com", object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal("example2.com", object.servers[1].host);
  test.equal('27018', object.servers[1].port);
  test.equal('default', object.dbName);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost,localhost:27018,localhost:27019'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://localhost,localhost:27018,localhost:27019");
  test.equal(3, object.servers.length);
  test.equal("localhost", object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal("localhost", object.servers[1].host);
  test.equal('27018', object.servers[1].port);
  test.equal("localhost", object.servers[2].host);
  test.equal('27019', object.servers[2].port);
  test.equal('default', object.dbName);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://host1,host2,host3/?slaveOk=true'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://host1,host2,host3/?slaveOk=true");
  test.equal(3, object.servers.length);
  test.equal("host1", object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal("host2", object.servers[1].host);
  test.equal('27017', object.servers[1].port);
  test.equal("host3", object.servers[2].host);
  test.equal('27017', object.servers[2].port);
  test.equal('default', object.dbName);
  test.equal(true, object.server_options.slave_ok);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost/?safe=true'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://localhost/?safe=true");
  test.equal(1, object.servers.length);
  test.equal("localhost", object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal('default', object.dbName);
  test.equal(true, object.db_options.safe);
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://host1,host2,host3/?safe=true;w=2;wtimeoutMS=2000'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://host1,host2,host3/?safe=true;w=2;wtimeoutMS=2000");
  test.equal(3, object.servers.length);
  test.equal("host1", object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal("host2", object.servers[1].host);
  test.equal('27017', object.servers[1].port);
  test.equal("host3", object.servers[2].host);
  test.equal('27017', object.servers[2].port);
  test.equal('default', object.dbName);
  test.equal(true, object.db_options.safe);
  test.equal(2, object.db_options.w);
  test.equal(2000, object.db_options.wtimeoutMS);
  test.done();
}

/**
 * @ignore
 */
exports['Parse mongodb://localhost/db?replicaSet=hello&ssl=prefer&connectTimeoutMS=1000&socketTimeoutMS=2000'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://localhost/db?replicaSet=hello&ssl=prefer&connectTimeoutMS=1000&socketTimeoutMS=2000");
  test.equal(1, object.servers.length);
  test.equal("localhost", object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal('db', object.dbName);
  test.equal("hello", object.rs_options.rs_name);
  test.equal(1000, object.server_options.socketOptions.connectTimeoutMS);
  test.equal(2000, object.server_options.socketOptions.socketTimeoutMS);
  test.equal(1000, object.rs_options.socketOptions.connectTimeoutMS);
  test.equal(2000, object.rs_options.socketOptions.socketTimeoutMS);
  test.equal('prefer', object.rs_options.socketOptions.ssl);
  test.equal('prefer', object.server_options.socketOptions.ssl);
  test.done();
}

/**
 * @ignore
 */
exports['Parse mongodb://localhost/db?ssl=true'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://localhost/db?ssl=true");
  test.equal(1, object.servers.length);
  test.equal("localhost", object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal('db', object.dbName);
  test.equal(true, object.rs_options.socketOptions.ssl);
  test.equal(true, object.server_options.socketOptions.ssl);
  test.done();
}

/**
 * @ignore
 */
exports['Parse mongodb://localhost/db?maxPoolSize=100'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://localhost/db?maxPoolSize=100");
  test.equal(1, object.servers.length);
  test.equal("localhost", object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal('db', object.dbName);
  test.equal(100, object.rs_options.poolSize);
  test.equal(100, object.server_options.poolSize);
  test.done();
}

/**
 * @ignore
 */
exports['Parse mongodb://localhost/db?w=-1'] = function(test) {
  // console.dir(parse)
  var object = parse("mongodb://localhost/db?w=-1");
  test.equal(1, object.servers.length);
  test.equal("localhost", object.servers[0].host);
  test.equal('27017', object.servers[0].port);
  test.equal('db', object.dbName);
  test.equal(-1, object.db_options.w);
  test.done();
}

/**
 * @ignore
 */
exports['Throw on unsuported options'] = function(test) {
  // console.dir(parse)
  test.throws(function() { parse("mongodb://localhost/db?minPoolSize=100") }, "minPoolSize not supported");
  test.throws(function() { parse("mongodb://localhost/db?maxIdleTimeMS=100") }, "maxIdleTimeMS not supported");
  test.throws(function() { parse("mongodb://localhost/db?waitQueueMultiple=100") }, "waitQueueMultiple not supported");
  test.throws(function() { parse("mongodb://localhost/db?waitQueueTimeoutMS=100") }, "waitQueueTimeoutMS not supported");
  test.throws(function() { parse("mongodb://localhost/db?uuidRepresentation=1") }, "uuidRepresentation not supported");
  test.done();
}

/**
 * @ignore
 */
exports['Write concerns parsing'] = function(test) {
  var object = parse("mongodb://localhost/db?safe=true&w=1");
  test.equal(true, object.db_options.safe);

  object = parse("mongodb://localhost/db?safe=false&w=1");
  test.equal(false, object.db_options.safe);

  // should throw as fireAndForget is set aswell as safe or any other write concerns
  test.throws(function() {parse("mongodb://localhost/db?safe=true&w=0"), "w set to -1 or 0 cannot be combined with safe/w/journal/fsync"});
  test.throws(function() {parse("mongodb://localhost/db?fsync=true&w=-1"), "w set to -1 or 0 cannot be combined with safe/w/journal/fsync"});
  test.done();
}

/**
 * @ignore
 */
exports['Read preferences parsing'] = function(test) {
  var object = parse("mongodb://localhost/db?slaveOk=true");
  test.equal(true, object.server_options.slave_ok);

  object = parse("mongodb://localhost/db?readPreference=primary");
  test.equal("primary", object.db_options.read_preference);

  object = parse("mongodb://localhost/db?readPreference=primaryPreferred");
  test.equal("primaryPreferred", object.db_options.read_preference);

  object = parse("mongodb://localhost/db?readPreference=secondary");
  test.equal("secondary", object.db_options.read_preference);

  object = parse("mongodb://localhost/db?readPreference=secondaryPreferred");
  test.equal("secondaryPreferred", object.db_options.read_preference);

  object = parse("mongodb://localhost/db?readPreference=nearest");
  test.equal("nearest", object.db_options.read_preference);

  object = parse("mongodb://localhost/db");
  test.equal("primary", object.db_options.read_preference);

  test.throws(function() {parse("mongodb://localhost/db?readPreference=blah"), "readPreference must be either primary/primaryPreferred/secondary/secondaryPreferred/nearest"});
  test.done();
}

/**
 * @ignore
 */
exports['Read preferences tag parsing'] = function(test) {
  var object = parse("mongodb://localhost/db");
  test.equal(null, object.db_options.read_preference_tags);

  var object = parse("mongodb://localhost/db?readPreferenceTags=dc:ny");
  test.deepEqual([{dc:"ny"}], object.db_options.read_preference_tags);

  var object = parse("mongodb://localhost/db?readPreferenceTags=dc:ny,rack:1");
  test.deepEqual([{dc:"ny", rack:"1"}], object.db_options.read_preference_tags);

  var object = parse("mongodb://localhost/db?readPreferenceTags=dc:ny,rack:1&readPreferenceTags=dc:sf,rack:2");
  test.deepEqual([{dc:"ny", rack:"1"}, {dc:"sf", rack:"2"}], object.db_options.read_preference_tags);

  var object = parse("mongodb://localhost/db?readPreferenceTags=dc:ny,rack:1&readPreferenceTags=dc:sf,rack:2&readPreferenceTags=");
  test.deepEqual([{dc:"ny", rack:"1"}, {dc:"sf", rack:"2"}, {}], object.db_options.read_preference_tags);
  test.done();
}

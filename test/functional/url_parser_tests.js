"use strict";

/*!
 * Module dependencies.
 */
var parse = require('../../lib/url_parser');

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://localhost");
    test.equal(1, object.servers.length);
    test.equal('localhost', object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal('admin', object.dbName);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost:27017'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://localhost:27017");
    test.equal(1, object.servers.length);
    test.equal('localhost', object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal('admin', object.dbName);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost?safe=true&readPreference=secondary'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://localhost?safe=true&readPreference=secondary");
    // var object = parse("mongodb://localhost?safe");
    test.equal(1, object.servers.length);
    test.equal('localhost', object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal('admin', object.dbName);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost:28101'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://localhost:28101");
    test.equal(1, object.servers.length);
    test.equal('localhost', object.servers[0].host);
    test.equal('28101', object.servers[0].port);
    test.equal('admin', object.dbName);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://fred:foobar@localhost/baz'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
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
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://fred:foo%20bar@localhost/baz'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
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
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb:///tmp/mongodb-27017.sock'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb:///tmp/mongodb-27017.sock", {uri_decode_auth:true});
    test.equal(1, object.servers.length);
    test.equal('/tmp/mongodb-27017.sock', object.servers[0].domain_socket);
    test.equal('admin', object.dbName);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://fred:foo@/tmp/mongodb-27017.sock'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://fred:foo@/tmp/mongodb-27017.sock", {uri_decode_auth:true});
    test.equal(1, object.servers.length);
    test.equal('/tmp/mongodb-27017.sock', object.servers[0].domain_socket);
    test.equal('admin', object.dbName);
    test.equal('fred', object.auth.user);
    test.equal('foo', object.auth.password);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://fred:foo@/tmp/mongodb-27017.sock/somedb'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://fred:foo@/tmp/mongodb-27017.sock/somedb");
    test.equal(1, object.servers.length);
    test.equal('/tmp/mongodb-27017.sock', object.servers[0].domain_socket);
    test.equal('somedb', object.dbName);
    test.equal('fred', object.auth.user);
    test.equal('foo', object.auth.password);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://fred:foo@/tmp/mongodb-27017.sock/somedb?safe=true'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
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
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://example1.com:27017,example2.com:27018'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://example1.com:27017,example2.com:27018");
    test.equal(2, object.servers.length);
    test.equal("example1.com", object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal("example2.com", object.servers[1].host);
    test.equal('27018', object.servers[1].port);
    test.equal('admin', object.dbName);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost,localhost:27018,localhost:27019'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://localhost,localhost:27018,localhost:27019");
    test.equal(3, object.servers.length);
    test.equal("localhost", object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal("localhost", object.servers[1].host);
    test.equal('27018', object.servers[1].port);
    test.equal("localhost", object.servers[2].host);
    test.equal('27019', object.servers[2].port);
    test.equal('admin', object.dbName);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://host1,host2,host3/?slaveOk=true'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://host1,host2,host3/?slaveOk=true");
    test.equal(3, object.servers.length);
    test.equal("host1", object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal("host2", object.servers[1].host);
    test.equal('27017', object.servers[1].port);
    test.equal("host3", object.servers[2].host);
    test.equal('27017', object.servers[2].port);
    test.equal('admin', object.dbName);
    test.equal(true, object.server_options.slave_ok);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://host1,host2,host3,host1/?slaveOk=true and de-duplicate names'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://host1,host2,host3,host1/?slaveOk=true");
    test.equal(3, object.servers.length);
    test.equal("host1", object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal("host2", object.servers[1].host);
    test.equal('27017', object.servers[1].port);
    test.equal("host3", object.servers[2].host);
    test.equal('27017', object.servers[2].port);
    test.equal('admin', object.dbName);
    test.equal(true, object.server_options.slave_ok);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost/?safe=true'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://localhost/?safe=true");
    test.equal(1, object.servers.length);
    test.equal("localhost", object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal('admin', object.dbName);
    test.equal(true, object.db_options.safe);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://host1,host2,host3/?safe=true;w=2;wtimeoutMS=2000'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://host1,host2,host3/?safe=true;w=2;wtimeoutMS=2000");
    test.equal(3, object.servers.length);
    test.equal("host1", object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal("host2", object.servers[1].host);
    test.equal('27017', object.servers[1].port);
    test.equal("host3", object.servers[2].host);
    test.equal('27017', object.servers[2].port);
    test.equal('admin', object.dbName);
    test.equal(true, object.db_options.safe);
    test.equal(2, object.db_options.w);
    test.equal(2000, object.db_options.wtimeout);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Parse mongodb://localhost/db?replicaSet=hello&ssl=prefer&connectTimeoutMS=1000&socketTimeoutMS=2000'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
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
    test.equal('prefer', object.rs_options.ssl);
    test.equal('prefer', object.server_options.ssl);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Parse mongodb://localhost/db?ssl=true'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://localhost/db?ssl=true");
    test.equal(1, object.servers.length);
    test.equal("localhost", object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal('db', object.dbName);
    test.equal(true, object.rs_options.ssl);
    test.equal(true, object.server_options.ssl);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Parse mongodb://localhost/db?maxPoolSize=100'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
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
}

/**
 * @ignore
 */
exports['Parse mongodb://localhost/db?w=-1'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://localhost/db?w=-1");
    test.equal(1, object.servers.length);
    test.equal("localhost", object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal('db', object.dbName);
    test.equal(-1, object.db_options.w);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Throw on unsuported options'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    test.throws(function() { parse("mongodb://localhost/db?minPoolSize=100") }, "minPoolSize not supported");
    test.throws(function() { parse("mongodb://localhost/db?maxIdleTimeMS=100") }, "maxIdleTimeMS not supported");
    test.throws(function() { parse("mongodb://localhost/db?waitQueueMultiple=100") }, "waitQueueMultiple not supported");
    test.throws(function() { parse("mongodb://localhost/db?waitQueueTimeoutMS=100") }, "waitQueueTimeoutMS not supported");
    test.throws(function() { parse("mongodb://localhost/db?uuidRepresentation=1") }, "uuidRepresentation not supported");
    test.done();
  }
}

/**
 * @ignore
 */
exports['Write concerns parsing'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    var object = parse("mongodb://localhost/db?safe=true&w=1");
    test.equal(true, object.db_options.safe);

    object = parse("mongodb://localhost/db?safe=false&w=1");
    test.equal(false, object.db_options.safe);

    // should throw as fireAndForget is set aswell as safe or any other write concerns
    test.throws(function() {parse("mongodb://localhost/db?safe=true&w=0"), "w set to -1 or 0 cannot be combined with safe/w/journal/fsync"});
    test.throws(function() {parse("mongodb://localhost/db?fsync=true&w=-1"), "w set to -1 or 0 cannot be combined with safe/w/journal/fsync"});
    test.done();
  }
}

/**
 * @ignore
 */
exports['GSSAPI parsing'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    var object = parse("mongodb://dev1%4010GEN.ME@kdc.10gen.com/test?authMechanism=GSSAPI");
    test.deepEqual({user:'dev1@10GEN.ME', password:null}, object.auth);
    test.deepEqual("GSSAPI", object.db_options.authMechanism);

    // Should throw due to missing principal
    try {
      parse("mongodb://kdc.10gen.com/test?authMechanism=GSSAPI");
    } catch(err) {
      test.equal("GSSAPI requires a provided principal", err.message);
    }

    // Should throw due to unsupported mechanism
    try {
      parse("mongodb://kdc.10gen.com/test?authMechanism=NONE");
    } catch(err) {
      test.equal("only GSSAPI, PLAIN, MONGODB-X509, SCRAM-SHA-1 or MONGODB-CR is supported by authMechanism", err.message);
    }

    object = parse("mongodb://dev1%4010GEN.ME:test@kdc.10gen.com/test?authMechanism=GSSAPI");
    test.deepEqual({user:'dev1@10GEN.ME', password:'test'}, object.auth);
    test.deepEqual("GSSAPI", object.db_options.authMechanism);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Read preferences parsing'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
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
}

/**
 * @ignore
 */
exports['Read preferences tag parsing'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
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
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://[::1]:1234'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://[::1]:1234");
    test.equal(1, object.servers.length);
    test.equal('::1', object.servers[0].host);
    test.equal('1234', object.servers[0].port);
    test.equal('admin', object.dbName);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://[::1]'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://[::1]");
    test.equal(1, object.servers.length);
    test.equal('::1', object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal('admin', object.dbName);
    test.done();
  }
}

/**
 * @ignore
 */
exports['Should correctly parse mongodb://localhost,[::1]:27018,[2607:f0d0:1002:51::41]'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    // console.dir(parse)
    var object = parse("mongodb://localhost,[::1]:27018,[2607:f0d0:1002:51::41]");
    test.equal(3, object.servers.length);
    test.equal("localhost", object.servers[0].host);
    test.equal('27017', object.servers[0].port);
    test.equal("::1", object.servers[1].host);
    test.equal('27018', object.servers[1].port);
    test.equal("2607:f0d0:1002:51::41", object.servers[2].host);
    test.equal('27017', object.servers[2].port);
    test.equal('admin', object.dbName);
    test.done();
  }
}

var mockupdb = require('../')
  , co = require('co')
  , assert = require('assert');

// Simple ismaster exhange
co(function*() {
  // Create a server
  var server = yield mockupdb.createServer(27017, 'localhost');
  // Wait for the request
  var request = yield server.receive()
  console.log("===================================== 0")
  console.dir(request.document)

  //
  // 3.0.4 shell workaround
  //
  // Only for the shell reply with { "you" : "127.0.0.1:63686", "ok" : 1 }
  request.reply({ "you" : "127.0.0.1:63686", "ok" : 1 }, {});
  // Wait for request
  request = yield server.receive()
  console.dir(request.document)
  request.reply({ "totalLinesWritten" : 0, "log" : [ ], "ok" : 1 });
  request = yield server.receive()
  console.dir(request.document)
  request.reply({ "ok" : 0, "errmsg" : "not running with --replSet", "code" : 76 });

  var request = yield server.receive()
  console.dir(request.document)
  request.reply({ "ismaster" : true,
  	"maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
  	"maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 3,
  	"minWireVersion" : 0, "ok" : 1
  });

  // var request = yield server.receive()
  // console.dir(request.document)

  // // Assert we received an op_query message
  // // assert.equal('op_query', request.type);
  // console.log("===================================== 1")
  // // Assert we received the ismaster
  // // assert.deepEqual({isMaster:1}, request.document);
  // console.log("===================================== 2")
  // // Return the ismaster result
  // // request.reply({ok:1}, {});
  // console.log("===================================== 3")
  // var request = yield server.receive()
  // console.dir(request.document)
  // console.log("===================================== 4")
});


var mongodb = process.env['TEST_NATIVE']
  ? require('../../lib/mongodb').native()
  : require('../../lib/mongodb').pure();

var
  gleak = require('../../dev/tools/gleak'),
  ReplSet = mongodb.ReplSet,
  Server = mongodb.Server;

exports['ReplSet honors connectTimeoutMS option'] =function (test) {
  var set = new ReplSet([
      new Server('localhost', 27107, { auto_reconnect: true } ),
      new Server('localhost', 27018, { auto_reconnect: true } ),
      new Server('localhost', 27019, { auto_reconnect: true } )
    ],
    {socketOptions: {connectTimeoutMS: 200} }
  );

  test.equal(200, set.socketOptions.connectTimeoutMS)
  test.equal(200, set._connectTimeoutMS)
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}

var http = require('http'),
  mongodb = require('../../lib/mongodb'),
  mongoClient = new mongodb.Db('music', new mongodb.Server('localhost', mongodb.Connection.DEFAULT_PORT, {}), {});

http.createServer(function(request, response) {
  var band = 'testfile';
  
  mongoClient.open(function(err, db) {
    var gs = new mongodb.GridStore(db, band+'.mp3', "r");
    gs.open(function(err, gs) {
      console.log("streaming...");
      response.writeHeader(200, {
        'Content-type': 'audio/mpeg, audio/x-mpeg, audio/x-mpeg-3, audio/mpeg3',
        'content-disposition': 'attachment; filename=' + band + '.mp3',
        'X-Pad': 'avoid browser bug',
        'Cache-Control': 'no-cache',
        'Content-Length': gs.length
      });

      gs.stream(true).pipe(response);
    });
  });
}).listen(8080);
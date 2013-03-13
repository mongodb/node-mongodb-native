#!/usr/bin/env node
var mongo = require("../../lib/mongodb");
var express = require("express");
var ObjectID = mongo.ObjectID;
var DBRef = mongo.DBRef;
var util = require("util");

var app = express.createServer();

app.configure(function() {
  app.set('dbconnection', {
    "port": 27017,
    "host": "localhost"
  });
});

app.renderResponse = function(res, err, data, allCount) {
  res.header('Content-Type', 'application/json');
  
  if(err == null) {
    if(typeof allCount == "undefined") {
      res.send({data: data, success: true});
    } else {
      res.send({allCount: allCount, data: data, success: true});
    }
  } else {
    util.log(util.inspect(err));
    console.log(err.stack);
    res.send({success: false, error:err.message});
  }
};

app.use(express.bodyParser());
app.use(app.router);
app.use(express.logger());
app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));

var isISO8601 = function(dString) {
    var regexp = /(\d\d\d\d)(-)?(\d\d)(-)?(\d\d)(T)?(\d\d)(:)?(\d\d)(:)?(\d\d)(\.\d+)?(Z|([+-])(\d\d)(:)?(\d\d))?/;
    if (dString.toString().match(new RegExp(regexp))) {
      return true;
    }
    else
    {
      return false;
    }
};


var decodeField = function(value) {
  if(value == null)
    return null;
    
  if(typeof value == "object" && value['namespace'] && value['oid']) {
    if(/^[0-9a-fA-F]{24}$/.test(value['oid']))
        return new DBRef(value['namespace'], new ObjectID(value['oid']));
    else
        return new DBRef(value['namespace'], value['oid']);
  }
  
  if(isISO8601(value))
     return new Date(value);
     
  return value;
};

var deepDecode = function(obj) {
    for(var i in obj)
    {
       if(obj[i] == null) {
          // do nothing
       }
       else if(i == "_id" && /^[0-9a-fA-F]{24}$/.test(obj[i])) {
         obj[i] = new ObjectID(obj[i]);
       }
       else if(typeof obj[i] == "object" && typeof obj[i]['namespace'] == "undefined" && typeof obj[i]['oid'] == "undefined") {
         deepDecode(obj[i]);
       }
       else {
         obj[i] = decodeField(obj[i]);
       }
    }
};

db = null;
var openConnection = function(dbname, config, callback) {
  if(db) {
    callback(null, db);
  }
  else {
    var target;
    target = new mongo.Server(config.host, config.port, {'auto_reconnect':true, 'poolSize':4});
    db = new mongo.Db(dbname, target, {native_parser:false});
    db.open(callback);
  }
}

var listCommand = function (target, spec, options, next){
  deepDecode(spec);
  openConnection(target.db, target.connection, function(err,db) {
    if(err) { next(err); return; }
    // open collection
    db.collection(target.collection, function(err, collection) {

      if(spec._id) {
        collection.findOne(spec, options, function(err, doc){
          next(err, doc);
        });
      }
      else
      {
        // console.dir(options)
        options['limit'] = 10;
        
        collection.find(spec, options, function(err, cursor)
        {			    
			
          cursor.toArray(function(err, docs)
          {
            next(err, docs);
            //db.close();
          });
        });
      }
    });
  });
}

app.get('/:db/:collection/:id?', function(req, res, next)
{
  var spec = req.query.query? JSON.parse(req.query.query) : {};
  spec = req.query.spec? JSON.parse(req.query.spec) : spec;

  if(req.params.id)
    spec._id = req.params.id;

  // JSON decode options
  var options = req.query.options?JSON.parse(req.query.options) : {};

  listCommand({
      connection: app.set("dbconnection"),
      db: req.params.db,
      collection: req.params.collection
    },
    spec,
    options,
    function(err, docs, allCount) {
      app.renderResponse(res, err, docs, allCount);
    });
});

app.listen(9999, '127.0.0.1');
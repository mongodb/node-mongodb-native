var fs = require('fs')
	, stream = require('stream');

exports['Should correctly perform a simple pipe aggregation command and get'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.1"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('fluent_api');

      // Insert a couple of docs
      var docs_1 = [];
      for(var i = 0; i < 100; i++) docs_1.push({agg_pipe: i});

      // Simple insert
      col.insert(docs_1, {w:1}, function(err, result) {
        test.equal(null, err);

        // Execute the aggregation
        col.pipe().find({agg_pipe: {$gt: 5}}).get(function(err, results) {
        	test.equal(null, err);
        	test.equal(94, results.length);
          db.close();
    	    test.done();
        });
      });
    });
  }
}

exports['Should correctly perform a simple pipe aggregation command and getOne'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.1"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('fluent_api');

      // Insert a couple of docs
      var docs = [];
      for(var i = 0; i < 10; i++) docs.push({agg_pipe2: i});

      // Simple insert
      col.insert(docs, function(err, result) {
        test.equal(null, err);

        // Execute the aggregation
        col.pipe().find({agg_pipe2: {$gt: 5}}).getOne(function(err, result) {
        	test.equal(null, err);
        	test.equal(6, result.agg_pipe2);
          db.close();
    	    test.done();
        });
      });
    });
  }
}

exports['Should correctly perform a complete pipe aggregation command and get'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.1"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('fluent_api');

      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Simple insert
      col.insert(docs, function(err, result) {
        test.equal(null, err);

        // Execute the aggregation
        col.pipe()
        	 .project({author:1, tags:1})
        	 .unwind("$tags")
        	 .group({
        	 		_id: {tags: "$tags"}
        	 	,	authors: { $addToSet: "$author" }
        	 })
        	 .limit(1)
        	 .skip(0)
        	 .withReadPreference('secondary')
        	 .get(function(err, results) {
    	    	 test.equal(null, err);
    	    	 test.deepEqual([ { _id: { tags: 'good' }, authors: [ 'bob' ] } ], results);
             db.close();
    		     test.done();
        	 });
      });
    });
  }
}

exports['Should correctly perform a simple pipe aggregation command and explain'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('fluent_api');

      // Insert a couple of docs
      var docs = [];
      for(var i = 0; i < 10; i++) docs.push({agg_pipe3: i});

      // Simple insert
      col.insert(docs, function(err, result) {
        test.equal(null, err);

        // Execute the aggregation
        col.pipe().find({agg_pipe3: {$gt: 5}}).explain(function(err, result) {
        	test.equal(null, err);
        	test.ok(result[0]['$cursor'] != null);
          db.close();
    	    test.done();
        });
      });
    });
  }
}

exports['Should correctly perform a simple pipe aggregation command and each'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.1"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('fluent_api');

      // Insert a couple of docs
      var docs = [];
      var counter = 0;
      for(var i = 0; i < 10; i++) docs.push({agg_pipe5: i});

      // Simple insert
      col.insert(docs, function(err, result) {
        test.equal(null, err);

        // Execute the aggregation
        col.pipe().find({agg_pipe5: {$gt: 5}}).each(function(err, result) {
          test.equal(null, err);

          if(!result) {
            test.equal(4, counter);
            db.close();
            test.done();
          } else {
            counter += 1;
          }
        });
      });
    });
  }
}

exports['Should correctly perform a simple pipe aggregation command and next'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.1"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('fluent_api');

      // Insert a couple of docs
      var docs = [];
      var counter = 0;
      for(var i = 0; i < 10; i++) docs.push({agg_pipe6: i});

      // Simple insert
      col.insert(docs, function(err, result) {
        test.equal(null, err);

        // Execute the aggregation
        var cursor = col.pipe().find({agg_pipe6: {$gt: 5}});
        cursor.next(function(err, result) {
          test.equal(null, err);
          test.equal(6, result.agg_pipe6);

          cursor.next(function(err, result) {
            test.equal(null, err);
            test.equal(7, result.agg_pipe6);
            test.done();
          });
        });
      });
    });
  }
}

exports['Should correctly perform a simple pipe aggregation command and print as stream'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.1"},
  requires: {node: ">0.10.0"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('fluent_api');
    	var liner = new stream.Transform( { objectMode: true } )

    	// Add tranformer
    	liner._transform = function(object, encoding, done) {
    		this.push(JSON.stringify(object));
    		done();
    	}

      // Insert a couple of docs
      var docs = [];
      for(var i = 0; i < 10; i++) docs.push({agg_pipe4: i});

      // Simple insert
      col.insert(docs, function(err, result) {
        test.equal(null, err);
        // process.exit(0)

        // Execute the aggregation
        var agg_stream = col.pipe().find({agg_pipe4: {$gt: 0}});
        var file_stream = fs.createWriteStream(process.cwd() + '/agg.tmp');
        liner.pipe(file_stream);
        agg_stream.pipe(liner);

        // Wait for the file to close
        file_stream.on('close', function() {
        	// Get all the results
    	    col.pipe().find({agg_pipe4: {$gt: 0}}).get(function(err, items) {
    	    	test.equal(null, err);
    	    	var str = '';

    	    	for(var i = 0; i < items.length; i++) {
    	    		str += JSON.stringify(items[i]);
    	    	}

    	    	var str2 = fs.readFileSync(process.cwd() + '/agg.tmp', 'utf8');
    	    	test.equal(str2, str);
            db.close();
    	    	test.done();
    	    });
        });
      });
    });
  }
}

exports['Should correctly perform a simple pipe aggregation command, next, close and correctly fail'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.1"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('fluent_api');

      // Insert a couple of docs
      var docs = [];
      var counter = 0;
      for(var i = 0; i < 10; i++) docs.push({agg_pipe10: i});

      // Simple insert
      col.insert(docs, function(err, result) {
        test.equal(null, err);

        // Execute the aggregation
        var cursor = col.pipe().find({agg_pipe10: {$gt: 5}});
        cursor.next(function(err, result) {
          test.equal(null, err);
          test.equal(6, result.agg_pipe10);

          // Close the cursor
          cursor.close(function() {

            // Peform next should fail
            cursor.next(function(err, result) {
              test.ok(err != null);
              test.equal(null, result);
              db.close();
              test.done();
            });
          });
        });
      });      
    })
  }
}


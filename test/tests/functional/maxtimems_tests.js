exports['Should Correctly respect the maxtimeMs property on count'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.2"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('max_time_ms');

      // Insert a couple of docs
      var docs_1 = [{agg_pipe:1}];

      // Simple insert
      col.insert(docs_1, {w:1}, function(err, result) {
        test.equal(null, err);

        // Execute a find command
        col.find({"$where": "sleep(100) || true"})
        	.maxTimeMS(50)
        	.count(function(err, count) {
        		test.ok(err != null);
	        	db.close();
	        	test.done();
        });
      });
    });
  }
}

exports['Should Correctly respect the maxtimeMs property on toArray'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.2"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('max_time_ms_2');

      // Insert a couple of docs
      var docs_1 = [{agg_pipe:1}];

      // Simple insert
      col.insert(docs_1, {w:1}, function(err, result) {
        test.equal(null, err);

        // Execute a find command
        col.find({"$where": "sleep(100) || true"})
        	.maxTimeMS(50)
        	.toArray(function(err, items) {
        		test.ok(err != null);
	        	db.close();
	        	test.done();
        });
      });
    });
  }
}

exports['Should Correctly respect the maxtimeMs property on aggregation cursor'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('max_time_ms_3');

      // Insert a couple of docs
      var docs_1 = [{agg_pipe:10}];

      // Simple insert
      col.insert(docs_1, {w:1}, function(err, result) {
        test.equal(null, err);

        db.admin().command({configureFailPoint: "maxTimeAlwaysTimeOut", mode: "alwaysOn"}, function(err, result) {
        	test.equal(true, result.documents[0].ok);

	        // Execute the aggregation
	        col
	        	.pipe()
	        	.find({agg_pipe: {$gt: 5}})
	        	.maxTimeMS(10)
	        	.get(function(err, results) {
		        	test.ok(err != null);

			        db.admin().command({configureFailPoint: "maxTimeAlwaysTimeOut", mode: "off"}, function(err, result) {
			          db.close();
			    	    test.done();
			    	  });
	        });
        });
      });
    });
  }
}

exports['Should Correctly respect the maxtimeMs property on sleep command'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('max_time_ms_3');

      // Insert a couple of docs
      var docs_1 = [{agg_pipe:10}];

      // Simple insert
      col.insert(docs_1, {w:1}, function(err, result) {
        test.equal(null, err);

        db.db('admin')        	
        	.command({sleep:1, milis:3, maxTimeMS:1}, function(err, result) {
        		test.ok(err != null)
	          db.close();
	    	    test.done();
      	});
    	});
    });
  }
}

exports['Should Correctly fail with maxTimeMS error'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('max_time_ms_5');

      // Insert a couple of docs
      var docs_1 = [{agg_pipe:10}];

      // Simple insert
      col.insert(docs_1, {w:1}, function(err, result) {
        test.equal(null, err);

        db.admin().command({configureFailPoint: "maxTimeAlwaysTimeOut", mode: "alwaysOn"}, function(err, result) {
        	test.equal(true, result.documents[0].ok);

        	col.find({}).maxTimeMS(10).toArray(function(err, docs) {
        		test.ok(err != null);

		        db.admin().command({configureFailPoint: "maxTimeAlwaysTimeOut", mode: "off"}, function(err, result) {
              test.equal(true, result.documents[0].ok);
		          db.close();
		    	    test.done();
		    	  });
        	});
        });
    	});
    });
  }
}

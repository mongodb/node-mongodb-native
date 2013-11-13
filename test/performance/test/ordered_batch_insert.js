var mongodb = require('../../../lib/mongodb')
  , Db = mongodb.Db
  , Server = mongodb.Server
  , ObjectID = mongodb.ObjectID
  , MongoClient = mongodb.MongoClient;

exports['ordered simple 1000 document batch insert'] = function(connection_string) {
  return function() {
    return {
      db: null,
      collection: null,
      docs: [],

      // Setup function, called once before tests are run
      setup: function(callback) {
        var self = this;

        MongoClient.connect(connection_string, function(err, db) {
          if(err) return callback(err);
          self.db = db;
          self.collection = db.collection('write_test_1');

          // Finish up
          self.collection.drop(function() {
	          callback(null, null);          	
          });
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
      	this.docs = [];
        // Generate a bunch of insert docs
        for(var i = 0; i < 1000; i++) {
        	this.docs.push({a:i, hello: "world"})
        }

        // Execute the batch
        var batch = this.collection.initializeOrderedBulkOp();
        // Add the insert documents
        batch.insert(this.docs);
        // Execute the batch
        batch.execute(callback);
      }
    }
  }
}

exports['ordered simple bigger 1000 document batch insert'] = function(connection_string) {
  return function() {
    return {
      db: null,
      collection: null,
      docs: [],

      // Setup function, called once before tests are run
      setup: function(callback) {
        var self = this;

        MongoClient.connect(connection_string, function(err, db) {
          if(err) return callback(err);
          self.db = db;
          self.collection = db.collection('write_test_2');

          // Generate a bunch of insert docs
          for(var i = 0; i < 10000; i++) {
          	self.docs.push({a:i, hello: "world", bin: new Buffer(256)})
          }

          // Finish up
          self.collection.drop(function() {
	          callback(null, null);          	
          });
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
        var batch = this.collection.initializeOrderedBulkOp();
        // Add the insert documents
        batch.insert(this.docs);
        // Execute the batch
        batch.execute(callback);
      }
    }
  }
}

exports['ordered old style 1000 document batch insert'] = function(connection_string) {
  return function() {
    return {
      db: null,
      collection: null,
      docs: [],

      // Setup function, called once before tests are run
      setup: function(callback) {
        var self = this;

        MongoClient.connect(connection_string, function(err, db) {
          if(err) return callback(err);
          self.db = db;
          self.collection = db.collection('write_test_3');

          // Finish up
          self.collection.drop(function() {
	          callback(null, null);          	
          });
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
      	this.docs = [];
        // Generate a bunch of insert docs
        for(var i = 0; i < 1000; i++) {
        	this.docs.push({a:i, hello: "world"})
        }

        // Execute inserts
      	this.collection.insert(this.docs, {continueOnError:false}, callback);
      }
    }
  }
}

exports['ordered 1000 document updates using batch api'] = function(connection_string) {
  return function() {
    return {
      db: null,
      collection: null,
      docs: [],

      // Setup function, called once before tests are run
      setup: function(callback) {
        var self = this;

        MongoClient.connect(connection_string, {
        	db: {
        		native_parser:false
        	}
        }, function(err, db) {
          if(err) return callback(err);
          self.db = db;
          self.collection = db.collection('write_test_4');
  
          // Finish up
          self.collection.drop(function() {
	          self.collection.ensureIndex({i:1}, function(err, r) {
	          	callback(null, null);
	          });
          });
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
        var batch = this.collection.initializeOrderedBulkOp();
        
        // Generate a bunch of upsert
        for(var i = 0; i < 1000; i++) {
        	batch.find({i: i}).upsert().update({$set: {a:1}})
        }

        // Execute the batch
        batch.execute(callback);
      }
    }
  }
}
var mongodb = require('../../../lib/mongodb')
  , Db = mongodb.Db
  , Server = mongodb.Server
  // , Binary = mongodb.Binary
  , MongoClient = mongodb.MongoClient;

exports['simple_1000_document_batch_insert'] = function(connection_string) {
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
          self.collection = db.collection('write test');

          // Generate a bunch of insert docs
          for(var i = 0; i < 1000; i++) {
          	self.docs.push({a:i, hello: "world"})
          }

          // Finish up
          callback(null, null);
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
        var batch = this.collection.initializeBulkOp();
        // Add the insert documents
        batch.insert(this.docs);
        // Execute the batch
        batch.execute(callback);
      }
    }
  }
}

exports['simple_bigger_1000_document_batch_insert'] = function(connection_string) {
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
          self.collection = db.collection('write test');

          // Generate a bunch of insert docs
          for(var i = 0; i < 10000; i++) {
          	self.docs.push({a:i, hello: "world", bin: new Buffer(256)})
          }

          // Finish up
          callback(null, null);
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
        var batch = this.collection.initializeBulkOp();
        // Add the insert documents
        batch.insert(this.docs);
        // Execute the batch
        batch.execute(callback);
      }
    }
  }
}

exports['old_style_1000_document_batch_insert'] = function(connection_string) {
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
          self.collection = db.collection('write test');

          // Generate a bunch of insert docs
          for(var i = 0; i < 1000; i++) {
          	self.docs.push({a:i, hello: "world"})
          }

          // Finish up
          callback(null, null);
        });
      },

      // Setup function, called once after test are run
      teardown: function(callback) {
        if(this.db != null) this.db.close(callback);
      },

      // Actual operation we are measuring
      test: function(callback) {
      	this.collection.insert(this.docs, {continueOnError:true}, callback);
      }
    }
  }
}

exports['1000 document updates using batch api'] = function(connection_string) {
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
          self.collection = db.collection('write test');
          self.collection.ensureIndex({i:1}, function(err, r) {
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
        var batch = this.collection.initializeBulkOp();
        
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
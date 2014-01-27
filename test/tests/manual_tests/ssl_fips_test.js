var MongoClient = require('../../../lib/mongodb').MongoClient
	, assert = require('assert');

MongoClient.connect("mongodb://ec2-107-22-145-69.compute-1.amazonaws.com:27018/test?ssl=true", function(err, db) {
	assert.equal(null, err);
	assert(db != null);
	db.close();
});
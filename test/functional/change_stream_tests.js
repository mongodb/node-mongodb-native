var assert = require('assert');

exports['Should create a Change Stream cursor on a database'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    console.log('Starting Change Stream test')

    var MongoClient = configuration.require.MongoClient;

    var client = new MongoClient(configuration.url());
    console.log('config url', configuration.url())

    client.connect(function(err, client) {
      assert.equal(null, err);

      let theDatabase = client.db('integration_tests')

      // Define the pipeline processing changes
      const pipeline = [{
        $addFields: { "addedField": "This is a field added using $addFields" }
      }, {
        $project: {documentKey: false}
      }, {
        $addFields: { "comment": "The documentKey field has been projected out of this document." }
      }]

      var thisChangeStream = theDatabase.changes(pipeline)

      // Attach event listener
      thisChangeStream.once('data', function(changeNotification) {
        assert.equal(changeNotification.operationType, 'insert')
        assert.equal(changeNotification.newDocument.a, 1)
        assert.ok(!(changeNotification.documentKey))
        assert.equal(changeNotification.comment, 'The documentKey field has been projected out of this document.')
        test.done()
      })

      theDatabase.collection('docs').insert({a:1})

    })


  }
}

'use strict';
const { expect } = require('chai');
const { assert: test, setupDatabase } = require('../../shared');

describe('Promote Buffers', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it(
    'should correctly honor promoteBuffers when creating an instance using Db',
    {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        promoteBuffers: true
      });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.collection('shouldCorrectlyHonorPromoteBuffer1').insert(
          {
            doc: Buffer.alloc(256)
          },
          function (err) {
            expect(err).to.not.exist;
            db.collection('shouldCorrectlyHonorPromoteBuffer1').findOne(function (err, doc) {
              expect(err).to.not.exist;
              test.ok(doc.doc instanceof Buffer);
              client.close(done);
            });
          }
        );
      });
    }
  );

  it(
    'should correctly honor promoteBuffers when creating an instance using MongoClient',
    {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient({}, { promoteBuffers: true });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.collection('shouldCorrectlyHonorPromoteBuffer2').insert(
          {
            doc: Buffer.alloc(256)
          },
          function (err) {
            expect(err).to.not.exist;
            db.collection('shouldCorrectlyHonorPromoteBuffer2').findOne(function (err, doc) {
              expect(err).to.not.exist;
              test.ok(doc.doc instanceof Buffer);
              client.close(done);
            });
          }
        );
      });
    }
  );

  it(
    'should correctly honor promoteBuffers at cursor level',
    {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient({}, { promoteBuffers: true });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.collection('shouldCorrectlyHonorPromoteBuffer3').insert(
          {
            doc: Buffer.alloc(256)
          },
          function (err) {
            expect(err).to.not.exist;
            db.collection('shouldCorrectlyHonorPromoteBuffer3')
              .find()
              .next(function (err, doc) {
                expect(err).to.not.exist;
                test.ok(doc.doc instanceof Buffer);
                client.close(done);
              });
          }
        );
      });
    }
  );

  it(
    'should correctly honor promoteBuffers at cursor find level',
    {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient();
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.collection('shouldCorrectlyHonorPromoteBuffer4').insert(
          {
            doc: Buffer.alloc(256)
          },
          function (err) {
            expect(err).to.not.exist;
            db.collection('shouldCorrectlyHonorPromoteBuffer4')
              .find({}, { promoteBuffers: true })
              .next(function (err, doc) {
                expect(err).to.not.exist;
                test.ok(doc.doc instanceof Buffer);
                client.close(done);
              });
          }
        );
      });
    }
  );

  it(
    'should correctly honor promoteBuffers at aggregate level',
    {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        mongodb: '>=2.4.0'
      }
    },
    function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient();
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.collection('shouldCorrectlyHonorPromoteBuffer5').insert(
          {
            doc: Buffer.alloc(256)
          },
          function (err) {
            expect(err).to.not.exist;
            db.collection('shouldCorrectlyHonorPromoteBuffer5')
              .aggregate([{ $match: {} }], { promoteBuffers: true })
              .next(function (err, doc) {
                expect(err).to.not.exist;
                test.ok(doc.doc instanceof Buffer);
                client.close(done);
              });
          }
        );
      });
    }
  );
});

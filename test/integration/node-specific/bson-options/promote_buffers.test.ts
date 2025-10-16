import { expect } from 'chai';

import { assert as test, setupDatabase } from '../../shared';

describe('Promote Buffers', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should correctly honor promoteBuffers when creating an instance using Db', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        promoteBuffers: true
      });

      client.connect(function (err, client) {
        const db = client.db(configuration.db);
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
  });

  it('should correctly honor promoteBuffers when creating an instance using MongoClient', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const configuration = this.configuration;

      const client = configuration.newClient({}, { promoteBuffers: true });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);

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
  });

  it('should correctly honor promoteBuffers at cursor level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const configuration = this.configuration;

      const client = configuration.newClient({}, { promoteBuffers: true });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);

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
  });

  it('should correctly honor promoteBuffers at cursor find level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const configuration = this.configuration;

      const client = configuration.newClient();
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
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
  });

  it('should correctly honor promoteBuffers at aggregate level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      const configuration = this.configuration;

      const client = configuration.newClient();
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
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
  });
});

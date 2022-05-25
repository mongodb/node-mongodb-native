import { Long, Timestamp } from 'bson';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { ChangeStreamCursor } from '../../src/change_stream';
import { MongoClient } from '../../src/mongo_client';
import { MongoDBNamespace } from '../../src/utils';

describe('class ChangeStreamCursor', function () {
  afterEach(() => sinon.restore());
  describe('get resumeOptions()', function () {
    context('non-resume related options', function () {
      it('copies all options from the original cursor', function () {
        const cursor = new ChangeStreamCursor(
          new MongoClient('mongodb://localhost:27027'),
          new MongoDBNamespace('db', 'collection'),
          [],
          { promoteBuffers: true, promoteLongs: false, maxAwaitTimeMS: 5000 }
        );

        expect(cursor.resumeOptions).to.deep.equal({
          promoteBuffers: true,
          promoteLongs: false,
          maxAwaitTimeMS: 5000
        });
      });
    });
    context('when there is a cached resumeToken', function () {
      context('when startAfter is set', function () {
        let cursor: ChangeStreamCursor;
        beforeEach(function () {
          cursor = new ChangeStreamCursor(
            new MongoClient('mongodb://localhost:27027'),
            new MongoDBNamespace('db', 'collection'),
            [],
            { startAfter: 'start after' }
          );
          cursor.resumeToken = 'resume token';
        });
        it('sets the startAfter option to the cached resumeToken', function () {
          expect(cursor.resumeOptions).to.haveOwnProperty('startAfter', 'resume token');
        });
        it('does NOT set the resumeAfter option', function () {
          expect(cursor.resumeOptions).not.to.haveOwnProperty('resumeAfter');
        });

        context('when the startAtOperationTime option is NOT set', function () {
          it('does not set the startAtOperationTime option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
          });
        });

        context('when the startAtOperationTime option is set', function () {
          it('does not set the startAtOperationTime option', function () {
            const cursor = new ChangeStreamCursor(
              new MongoClient('mongodb://localhost:27027'),
              new MongoDBNamespace('db', 'collection'),
              [],
              { startAfter: 'start after', startAtOperationTime: new Timestamp(Long.ZERO) }
            );
            cursor.resumeToken = 'resume token';

            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
          });
        });
      });

      context('when resumeAfter is set', function () {
        let cursor: ChangeStreamCursor;
        beforeEach(function () {
          cursor = new ChangeStreamCursor(
            new MongoClient('mongodb://localhost:27027'),
            new MongoDBNamespace('db', 'collection'),
            [],
            { resumeAfter: 'resume after' }
          );
          cursor.resumeToken = 'resume token';
        });
        it('sets the resumeAfter option to the cached resumeToken', function () {
          expect(cursor.resumeOptions).to.haveOwnProperty('resumeAfter', 'resume token');
        });

        it('does NOT set the startAfter option', function () {
          expect(cursor.resumeOptions).not.to.haveOwnProperty('startAfter');
        });

        context(
          'when the startAtOperationTime option is NOT set on the aggregation pipeline',
          function () {
            it('does not set the startAtOperationTime option', function () {
              expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
            });
          }
        );

        context(
          'when the startAtOperationTime option is set on the aggregation pipeline',
          function () {
            it('does not set the startAtOperationTime option', function () {
              const cursor = new ChangeStreamCursor(
                new MongoClient('mongodb://localhost:27027'),
                new MongoDBNamespace('db', 'collection'),
                [],
                { resumeAfter: 'resume after', startAtOperationTime: new Timestamp(Long.ZERO) }
              );
              cursor.resumeToken = 'resume token';

              expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
            });
          }
        );
      });
    });

    context('when there is no cached resumeToken', function () {
      context('when the cursor has a saved operation time', function () {
        context('when the maxWireVersion >= 7', function () {
          let cursor: ChangeStreamCursor;

          beforeEach(function () {
            cursor = new ChangeStreamCursor(
              new MongoClient('mongodb://localhost:27027'),
              new MongoDBNamespace('db', 'collection'),
              [],
              {
                startAfter: 'start after',
                resumeAfter: 'resume after',
                startAtOperationTime: new Timestamp(Long.ZERO)
              }
            );

            cursor.resumeToken = null;

            sinon.stub(cursor, 'server').get(() => ({ hello: { maxWireVersion: 7 } }));
          });
          it('does NOT set the resumeAfter option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('resumeAfter');
          });
          it('does NOT set the startAfter option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAfter');
          });
          it('does set the startAtOperationTime option', function () {
            expect(cursor.resumeOptions).to.haveOwnProperty('startAtOperationTime');
          });
        });

        context('when the maxWireVersion < 7', function () {
          let cursor: ChangeStreamCursor;

          beforeEach(function () {
            cursor = new ChangeStreamCursor(
              new MongoClient('mongodb://localhost:27027'),
              new MongoDBNamespace('db', 'collection'),
              [],
              {
                startAfter: 'start after',
                resumeAfter: 'resume after',
                startAtOperationTime: new Timestamp(Long.ZERO)
              }
            );

            cursor.resumeToken = null;

            sinon.stub(cursor, 'server').get(() => ({ hello: { maxWireVersion: 6 } }));
          });
          it('does NOT set the resumeAfter option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('resumeAfter');
          });
          it('does NOT set the startAfter option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAfter');
          });
          it('does NOT set the startAtOperationTime option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
          });
        });
      });

      context('when the cursor does not have a saved operation time', function () {
        context('when the maxWireVersion >= 7', function () {
          let cursor: ChangeStreamCursor;

          beforeEach(function () {
            cursor = new ChangeStreamCursor(
              new MongoClient('mongodb://localhost:27027'),
              new MongoDBNamespace('db', 'collection'),
              [],
              {
                startAfter: 'start after',
                resumeAfter: 'resume after'
              }
            );

            cursor.resumeToken = null;

            sinon.stub(cursor, 'server').get(() => ({ hello: { maxWireVersion: 7 } }));
          });
          it('does NOT set the resumeAfter option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('resumeAfter');
          });
          it('does NOT set the startAfter option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAfter');
          });
          it('does NOT set the startAtOperationTime option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
          });
        });

        context('when the maxWireVersion < 7', function () {
          let cursor: ChangeStreamCursor;

          beforeEach(function () {
            cursor = new ChangeStreamCursor(
              new MongoClient('mongodb://localhost:27027'),
              new MongoDBNamespace('db', 'collection'),
              [],
              {
                startAfter: 'start after',
                resumeAfter: 'resume after',
                startAtOperationTime: new Timestamp(Long.ZERO)
              }
            );

            cursor.resumeToken = null;

            sinon.stub(cursor, 'server').get(() => ({ hello: { maxWireVersion: 6 } }));
          });
          it('does NOT set the resumeAfter option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('resumeAfter');
          });
          it('does NOT set the startAfter option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAfter');
          });
          it('does NOT set the startAtOperationTime option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
          });
        });
      });
    });
  });
});

import { Long, Timestamp } from 'bson';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { ChangeStreamCursor, MongoClient, MongoDBNamespace } from '../mongodb';

describe('ChangeStreamCursor', function () {
  afterEach(function () {
    sinon.restore();
  });

  describe('get resumeOptions()', function () {
    context('when there is a cached resumeToken', function () {
      it('copies all non-resume related options from the original cursor', function () {
        const cursor = new ChangeStreamCursor(
          new MongoClient('mongodb://localhost:27027'),
          new MongoDBNamespace('db', 'collection'),
          [],
          { promoteBuffers: true, promoteLongs: false, maxAwaitTimeMS: 5000 }
        );
        cursor.resumeToken = 'resume token';

        const options = cursor.resumeOptions;
        expect(options).to.haveOwnProperty('promoteBuffers', true);
        expect(options).to.haveOwnProperty('promoteLongs', false);
        expect(options).to.haveOwnProperty('maxAwaitTimeMS', 5000);
      });

      context('when the cursor was started with startAfter', function () {
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

        context('when the cursor has not yet returned a document', function () {
          beforeEach(function () {
            cursor.hasReceived = false;
          });

          it('sets the startAfter option to the cached resumeToken', function () {
            expect(cursor.resumeOptions).to.haveOwnProperty('startAfter', 'resume token');
          });

          it('does NOT set the resumeAfter option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('resumeAfter');
          });

          context('when the startAtOperationTime option is NOT set', function () {
            it('does NOT set the startAtOperationTime option', function () {
              expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
            });
          });

          context('when the startAtOperationTime option is set', function () {
            it('does NOT set the startAtOperationTime option', function () {
              cursor.startAtOperationTime = new Timestamp(Long.ZERO);
              expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
            });
          });
        });

        context('when the cursor has returned a document', function () {
          beforeEach(function () {
            cursor.hasReceived = true;
          });

          it('does NOT set the startAfter option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAfter');
          });

          it('sets the resumeAFter option to the cached resumeToken', function () {
            expect(cursor.resumeOptions).to.haveOwnProperty('resumeAfter', 'resume token');
          });

          context('when the startAtOperationTime option is NOT set', function () {
            it('does NOT set the startAtOperationTime option', function () {
              expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
            });
          });

          context('when the startAtOperationTime option is set', function () {
            it('does NOT set the startAtOperationTime option', function () {
              cursor.startAtOperationTime = new Timestamp(Long.ZERO);
              expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
            });
          });
        });
      });

      context('when the cursor was not initialized with startAfter set', function () {
        let cursor: ChangeStreamCursor;
        beforeEach(function () {
          cursor = new ChangeStreamCursor(
            new MongoClient('mongodb://localhost:27027'),
            new MongoDBNamespace('db', 'collection'),
            [],
            {}
          );
          cursor.resumeToken = 'resume token';
        });

        it('sets the resumeAfter option to the cached resumeToken', function () {
          expect(cursor.resumeOptions).to.haveOwnProperty('resumeAfter', 'resume token');
        });

        it('does NOT set the startAfter option', function () {
          expect(cursor.resumeOptions).not.to.haveOwnProperty('startAfter');
        });

        context('when the startAtOperationTime option is NOT set', function () {
          it('does NOT set the startAtOperationTime option', function () {
            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
          });
        });

        context('when the startAtOperationTime option is set', function () {
          it('does NOT set the startAtOperationTime option', function () {
            cursor.startAtOperationTime = new Timestamp(Long.ZERO);
            cursor.resumeToken = 'resume token';

            expect(cursor.resumeOptions).not.to.haveOwnProperty('startAtOperationTime');
          });
        });
      });
    });

    context('when there is no cached resumeToken', function () {
      context('when the cursor has a saved operation time', function () {
        it('copies all non-resume related options from the original cursor', function () {
          const cursor = new ChangeStreamCursor(
            new MongoClient('mongodb://localhost:27027'),
            new MongoDBNamespace('db', 'collection'),
            [],
            {
              startAfter: 'start after',
              resumeAfter: 'resume after',
              startAtOperationTime: new Timestamp(Long.ZERO),
              promoteBuffers: true,
              promoteLongs: false,
              maxAwaitTimeMS: 5000
            }
          );
          cursor.resumeToken = null;

          const options = cursor.resumeOptions;
          expect(options).to.haveOwnProperty('promoteBuffers', true);
          expect(options).to.haveOwnProperty('promoteLongs', false);
          expect(options).to.haveOwnProperty('maxAwaitTimeMS', 5000);
        });

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
      });

      context('when the cursor does NOT have a saved operation time', function () {
        it('copies all non-resume related options from the original cursor', function () {
          const cursor = new ChangeStreamCursor(
            new MongoClient('mongodb://localhost:27027'),
            new MongoDBNamespace('db', 'collection'),
            [],
            {
              startAfter: 'start after',
              resumeAfter: 'resume after',
              promoteBuffers: true,
              promoteLongs: false,
              maxAwaitTimeMS: 5000
            }
          );
          cursor.resumeToken = null;

          const options = cursor.resumeOptions;
          expect(options).to.haveOwnProperty('promoteBuffers', true);
          expect(options).to.haveOwnProperty('promoteLongs', false);
          expect(options).to.haveOwnProperty('maxAwaitTimeMS', 5000);
        });

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
      });
    });
  });
});

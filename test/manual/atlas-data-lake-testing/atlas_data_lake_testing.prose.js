'use strict';
const { MongoClient } = require('../../mongodb');

// TODO(NODE-3880): These tests are not fully implemented per the spec
describe('Atlas Data Lake - prose', function () {
  let client;

  beforeEach(function () {
    client = null;
  });

  afterEach(async function () {
    if (client != null) await client.close();
  });

  /**
   * For this test, configure an APM listener on a client and execute a query on the test.driverdata collection
   * that will leave a cursor open on the server (e.g. specify batchSize=2 for a query that would match 3+ documents).
   * Drivers MAY iterate the cursor if necessary to execute the initial find command but MUST NOT iterate further to avoid executing a getMore.
   *
   * Observe the CommandSucceededEvent event for the find command and extract the cursor's ID and namespace from the response document's cursor.id
   * and cursor.ns fields, respectively. Destroy the cursor object and observe a CommandStartedEvent and CommandSucceededEvent for the killCursors command.
   *
   * Assert that the cursor ID and target namespace in the outgoing command match the values from the find command's CommandSucceededEvent.
   * When matching the namespace, note that the killCursors field will contain the collection name and the database may be inferred from either
   * the $db field or accessed via the CommandStartedEvent directly.
   *
   * Finally, assert that the killCursors CommandSucceededEvent indicates that the expected cursor was killed in the cursorsKilled field.
   *
   * Note: this test assumes that drivers only issue a killCursors command internally when destroying a cursor that may still exist on the server.
   * If a driver constructs and issues killCursors commands in other ways (e.g. public API), this test MUST be adapted to test all such code paths.
   */
  it('1. Test that the driver properly constructs and issues a killCursors command to Atlas Data Lake.', async function () {
    client = new MongoClient('mongodb://mhuser:pencil@localhost');
    const db = client.db('admin');
    await db.command({ killCursors: 'kill_cursor_collection' });
  });

  /**
   * For these tests, create a MongoClient using a valid connection string without auth credentials and execute a ping command.
   */
  it('2. Test that the driver can establish a connection with Atlas Data Lake without authentication.', async function () {
    client = new MongoClient('mongodb://localhost');
    const db = client.db('admin');
    await db.command({ ping: 1 });
  });

  /**
   * For these tests, create a MongoClient using a valid connection string with SCRAM-SHA-1 and credentials
   * from the drivers-evergreen-tools ADL configuration and execute a ping command.
   */
  it('3a. Test that the driver can establish a connection with Atlas Data Lake with authentication. (SCRAM-SHA-1)', async function () {
    client = new MongoClient('mongodb://mhuser:pencil@localhost?authMechanism=SCRAM-SHA-1');
    const db = client.db('admin');
    await db.command({ ping: 1 });
    await db.command({ killCursors: 'kill_cursor_collection' });
  });

  /**
   * Repeat the authentication test using SCRAM-SHA-256.
   */
  it('3b. Test that the driver can establish a connection with Atlas Data Lake with authentication. (SCRAM-SHA-256)', async function () {
    client = new MongoClient('mongodb://mhuser:pencil@localhost?authMechanism=SCRAM-SHA-256');
    const db = client.db('admin');
    await db.command({ ping: 1 });
    await db.command({ killCursors: 'kill_cursor_collection' });
  });
});

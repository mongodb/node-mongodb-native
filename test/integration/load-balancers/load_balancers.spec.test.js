'use strict';
const path = require('path');
const { loadSpecTests } = require('../../spec/index');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');

const SKIP = [
  // Verified they use the same connection but the Node implementation executes
  // a getMore before the killCursors even though the stream is immediately
  // closed.
  // TODO(NODE-3970): implement and reference a node specific integration test for this
  'change streams pin to a connection',

  // TODO(DRIVERS-1847): The following three tests are skipped pending a decision made on DRIVERS-1847,
  // since pinning the connection on any getMore error is very awkward in node and likely results
  // in sub-optimal pinning.
  'pinned connections are not returned after an network error during getMore',
  'pinned connections are not returned to the pool after a non-network error on getMore',
  'stale errors are ignored',

  // This test is skipped because it assumes drivers attempt connections on the first operation,
  // but Node has a connect() method that is called before the first operation is ever run.
  // TODO(NODE-2149): Refactor connect()
  'errors during the initial connection hello are ignored',

  ...(process.env.SERVERLESS
    ? [
        // TODO(NODE-2471): Unskip these when there isn't a ping command sent when credentials are defined
        'no connection is pinned if all documents are returned in the initial batch',
        'pinned connections are returned when the cursor is drained',
        'pinned connections are returned to the pool when the cursor is closed',
        'pinned connections are returned after a network error during a killCursors request',
        'aggregate pins the cursor to a connection',
        'errors during the initial connection hello are ignored',
        'all operations go to the same mongos',
        'transaction can be committed multiple times',
        'pinned connection is not released after a non-transient CRUD error',
        'pinned connection is not released after a non-transient commit error',
        'pinned connection is released after a non-transient abort error',
        'pinned connection is released after a transient network commit error',
        'pinned connection is released after a transient non-network abort error',
        'pinned connection is released after a transient network abort error',
        'pinned connection is released on successful abort',
        'pinned connection is returned when a new transaction is started',
        'pinned connection is returned when a non-transaction operation uses the session',
        'a connection can be shared by a transaction and a cursor',
        'wait queue timeout errors include cursor statistics',
        'wait queue timeout errors include transaction statistics'
      ]
    : []),

  // TODO: NODE-3891 - fix tests broken when AUTH enabled
  ...(process.env.AUTH === 'auth'
    ? [
        'errors during authentication are processed',
        'wait queue timeout errors include cursor statistics',
        'wait queue timeout errors include transaction statistics',
        'operations against non-load balanced clusters fail if URI contains loadBalanced=true',
        'operations against non-load balanced clusters succeed if URI contains loadBalanced=false'
      ]
    : [])
];

describe('Load Balancer Unified Tests', function () {
  runUnifiedSuite(loadSpecTests(path.join('load-balancers')), SKIP);
});

# Client Backpressure Tests

______________________________________________________________________

## Introduction

The YAML and JSON files in this directory are platform-independent tests meant to exercise a driver's implementation of
retryable reads. These tests utilize the [Unified Test Format](../../unified-test-format/unified-test-format.md).

Several prose tests, which are not easily expressed in YAML, are also presented in this file. Those tests will need to
be manually implemented by each driver.

### Prose Tests

#### Test 1: Operation Retry Uses Exponential Backoff

Drivers should test that retries do not occur immediately when a SystemOverloadedError is encountered.

1. Let `client` be a `MongoClient`
2. Let `collection` be a collection
3. Now, run transactions without backoff:
    1. Configure the random number generator used for jitter to always return `0` -- this effectively disables backoff.

    2. Configure the following failPoint:

        ```javascript
            {
                configureFailPoint: 'failCommand',
                mode: 'alwaysOn',
                data: {
                    failCommands: ['insert'],
                    errorCode: 2,
                    errorLabels: ['SystemOverloadedError', 'RetryableError']
                }
            }
        ```

    3. Insert the document `{ a: 1 }`. Expect that the command errors. Measure the duration of the command execution.

        ```javascript
           const start = performance.now();
           expect(
            await coll.insertOne({ a: 1 }).catch(e => e)
           ).to.be.an.instanceof(MongoServerError);
           const end = performance.now();
        ```

    4. Configure the random number generator used for jitter to always return `1`.

    5. Execute step 3 again.

    6. Compare the two time between the two runs.
        ```python
        assertTrue(with_backoff_time - no_backoff_time >= 2.1)
        ```
        The sum of 5 backoffs is 3.1 seconds. There is a 1-second window to account for potential variance between the two
        runs.

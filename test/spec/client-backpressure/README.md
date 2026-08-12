# Client Backpressure Tests

______________________________________________________________________

## Introduction

The YAML and JSON files in this directory are platform-independent tests meant to exercise a driver's implementation of
retryable reads. These tests utilize the [Unified Test Format](../../unified-test-format/unified-test-format.md).

Several prose tests, which are not easily expressed in YAML, are also presented in this file. Those tests will need to
be manually implemented by each driver.

### Prose Tests

#### Test 1: Operation Retry Uses Exponential Backoff

Drivers should test that retries do not occur immediately when a SystemOverloadedError is encountered. This test MUST be
executed against a MongoDB 4.4+ server that has enabled the `configureFailPoint` command with the `errorLabels` option.

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

    4. Configure the random number generator used for jitter to always return a number as close as possible to `1`.

    5. Execute step 3 again.

    6. Compare the time between the two runs.

        ```python
        assertTrue(absolute_value(with_backoff_time - (no_backoff_time + 0.6 seconds)) < 0.6 seconds)
        ```

        The sum of 2 backoffs is 0.6 seconds. There is a 0.6-second window to account for potential variance between the
        two runs.

#### Test 2: REMOVED

#### Test 3: Overload Errors are Retried a Maximum of MAX_RETRIES times

Drivers should test that overload errors are retried a maximum of MAX_RETRIES times. This test MUST be executed against
a MongoDB 4.4+ server that has enabled the `configureFailPoint` command with the `errorLabels` option.

1. Let `client` be a `MongoClient` with command event monitoring enabled.

2. Let `coll` be a collection.

3. Configure the following failpoint:

    ```javascript
        {
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: {
                failCommands: ['find'],
                errorCode: 462,  // IngressRequestRateLimitExceeded
                errorLabels: ['SystemOverloadedError', 'RetryableError']
            }
        }
    ```

4. Perform a find operation with `coll` that fails.

5. Assert that the raised error contains both the `RetryableError` and `SystemOverloadedError` error labels.

6. Assert that the total number of started commands is MAX_RETRIES + 1 (3).

#### Test 4: Overload Errors are Retried a Maximum of maxAdaptiveRetries times when configured

Drivers should test that overload errors are retried a maximum of `maxAdaptiveRetries` times, when configured. This test
MUST be executed against a MongoDB 4.4+ server that has enabled the `configureFailPoint` command with the `errorLabels`
option.

1. Let `client` be a `MongoClient` with `maxAdaptiveRetries=1` and command event monitoring enabled.

2. Let `coll` be a collection.

3. Configure the following failpoint:

    ```javascript
        {
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: {
                failCommands: ['find'],
                errorCode: 462,  // IngressRequestRateLimitExceeded
                errorLabels: ['SystemOverloadedError', 'RetryableError']
            }
        }
    ```

4. Perform a find operation with `coll` that fails.

5. Assert that the raised error contains both the `RetryableError` and `SystemOverloadedError` error labels.

6. Assert that the total number of started commands is `maxAdaptiveRetries` + 1 (2).

#### Test 5: Overload Errors with baseBackoffMS override base backoff

Drivers SHOULD test that overload errors with `baseBackoffMS` override the default backoff duration. This test MUST be
executed against a MongoDB 9.0+ server that has enabled the `configureFailPoint` command with the `errorLabels` option.

1. Let `client` be a `MongoClient`.

2. Let `coll` be a collection.

3. Configure the random number generator used for exponential backoff jitter to always return a number as close as
    possible to `1`.

4. Configure the following failPoint:

    ```javascript
        {
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: {
                failCommands: ['insert'],
                errorCode: 462, // IngressRequestRateLimitExceeded
                errorLabels: ['SystemOverloadedError', 'RetryableError']
            }
        }
    ```

5. Insert the document `{ a: 1 }`. Expect that the command errors. Measure the duration of the command execution.

    ```javascript
       const start = performance.now();
       expect(
        await coll.insertOne({ a: 1 }).catch(e => e)
       ).to.be.an.instanceof(MongoServerError);
       const end = performance.now();
    ```

6. Run the following command to set up `baseBackoffMS` on overload errors.

    ```python
    client.admin.command("setParameter", 1, externalClientBaseBackoffMS=50)
    ```

7. Execute step 5 again.

8. Assert that the server attached `baseBackoffMS` to the error and that the driver parsed it.

9. Run the following command to disable `baseBackoffMS` on overload errors.

    ```python
    client.admin.command("setParameter", 1, externalClientBaseBackoffMS=0)
    ```

10. Assert absolute bounds on each run's duration.

    ```python
    assertGreaterEqual(exponential_backoff_time, 0.6)
    assertGreaterEqual(with_base_backoff_ms_time, 0.3)
    assertLess(with_base_backoff_ms_time, 0.6)
    ```

    A run can never be faster than the sum of its backoffs. With jitter pinned to 1, the default backoffs are
    `0.2 + 0.4 = 0.6s` and the `baseBackoffMS=50` backoffs are `0.1 + 0.2 = 0.3s`.

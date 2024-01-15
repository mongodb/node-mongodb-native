/* eslint-disable @typescript-eslint/no-empty-function */
/**
 * The following tests are described in CSOTs spec prose tests as "unit" tests
 * The tests enumerated in this section could not be expressed in either spec or prose format.
 * Drivers SHOULD implement these if it is possible to do so using the driver's existing test infrastructure.
 */

// TODO(NODE-5824): Implement CSOT prose tests
describe.skip('CSOT spec unit tests', () => {
  context('Operations should ignore waitQueueTimeoutMS if timeoutMS is also set.', () => {});

  context(
    'If timeoutMS is set for an operation, the remaining timeoutMS value should apply to connection checkout after a server has been selected.',
    () => {}
  );

  context(
    'If timeoutMS is not set for an operation, waitQueueTimeoutMS should apply to connection checkout after a server has been selected.',
    () => {}
  );

  context(
    'If a new connection is required to execute an operation, min(remaining computedServerSelectionTimeout, connectTimeoutMS) should apply to socket establishment.',
    () => {}
  );

  context(
    'For drivers that have control over OCSP behavior, min(remaining computedServerSelectionTimeout, 5 seconds) should apply to HTTP requests against OCSP responders.',
    () => {}
  );

  context(
    'If timeoutMS is unset, operations fail after two non-consecutive socket timeouts.',
    () => {}
  );

  context(
    'The remaining timeoutMS value should apply to HTTP requests against KMS servers for CSFLE.',
    () => {}
  );

  context(
    'The remaining timeoutMS value should apply to commands sent to mongocryptd as part of automatic encryption.',
    () => {}
  );

  context(
    'When doing minPoolSize maintenance, connectTimeoutMS is used as the timeout for socket establishment.',
    () => {}
  );
});

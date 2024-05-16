/* eslint-disable @typescript-eslint/no-empty-function */
/**
 * The following tests are described in CSOTs spec prose tests as "unit" tests
 * The tests enumerated in this section could not be expressed in either spec or prose format.
 * Drivers SHOULD implement these if it is possible to do so using the driver's existing test infrastructure.
 */
// TODO(NODE-5824): Implement CSOT prose tests
describe.skip('CSOT spec unit tests', () => {
  describe('Operations should ignore waitQueueTimeoutMS if timeoutMS is also set.', () => {});
  describe('If timeoutMS is set for an operation, the remaining timeoutMS value should apply to connection checkout after a server has been selected.', () => {});
  describe('If timeoutMS is not set for an operation, waitQueueTimeoutMS should apply to connection checkout after a server has been selected.', () => {});
  describe('If a new connection is required to execute an operation, min(remaining computedServerSelectionTimeout, connectTimeoutMS) should apply to socket establishment.', () => {});
  describe('For drivers that have control over OCSP behavior, min(remaining computedServerSelectionTimeout, 5 seconds) should apply to HTTP requests against OCSP responders.', () => {});
  describe('If timeoutMS is unset, operations fail after two non-consecutive socket timeouts.', () => {});
  describe('The remaining timeoutMS value should apply to HTTP requests against KMS servers for CSFLE.', () => {});
  describe('The remaining timeoutMS value should apply to commands sent to mongocryptd as part of automatic encryption.', () => {});
  describe('When doing minPoolSize maintenance, connectTimeoutMS is used as the timeout for socket establishment.', () => {});
});

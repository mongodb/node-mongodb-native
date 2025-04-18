import { expect } from 'chai';

import { alphabetically } from '../utils';

export const flakyTests = [
  'Change Streams should properly handle a changeStream event being processed mid-close when invoked with promises',
  'Client Side Encryption (Unified) namedKMS-rewrapManyDataKey rewrap to azure:name1',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from aws to aws',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from aws to azure',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from aws to gcp',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from aws to kmip',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from aws to local',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from azure to aws',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from azure to azure',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from azure to gcp',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from azure to kmip',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from azure to local',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from gcp to aws',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from gcp to azure',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from gcp to gcp',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from gcp to kmip',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from gcp to local',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from kmip to aws',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from kmip to azure',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from kmip to gcp',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from kmip to kmip',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from kmip to local',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from local to aws',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from local to azure',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from local to gcp',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from local to kmip',
  'Client Side Encryption Prose Tests 16. Rewrap Case 1: Rewrap with separate ClientEncryption should rewrap data key from local to local',
  'Client Side Encryption Prose Tests 16. Rewrap Case 2: RewrapManyDataKeyOpts.provider is not optional when provider field is missing raises an error',
  'CSOT spec tests legacy timeouts behave correctly for retryable operations operation fails after two consecutive socket timeouts - aggregate on collection',
  'CSOT spec tests legacy timeouts behave correctly for retryable operations operation succeeds after one socket timeout - aggregate on collection',
  'CSOT spec tests operations ignore deprecated timeout options if timeoutMS is set socketTimeoutMS is ignored if timeoutMS is set - dropIndex on collection',
  'CSOT spec tests runCursorCommand Non-tailable cursor lifetime remaining timeoutMS applied to getMore if timeoutMode is unset',
  'CSOT spec tests timeoutMS behaves correctly for GridFS download operations timeoutMS applied to entire download, not individual parts',
  'Retryable Reads (unified) retryable reads handshake failures collection.aggregate succeeds after retryable handshake network error',
  'Retryable Writes (unified) retryable writes handshake failures collection.updateOne succeeds after retryable handshake network error',
  'Server Discovery and Monitoring Prose Tests Connection Pool Management ensure monitors properly create and unpause connection pools when they discover servers',
  'Transactions Convenient API Spec Unified Tests transaction-options withTransaction inherits transaction options from defaultTransactionOptions'
];

expect(flakyTests, 'expected list to be alphabetized').to.deep.equal(
  [...flakyTests].sort(alphabetically)
);
expect(flakyTests, 'expected to have no duplicates').to.have.lengthOf(new Set(flakyTests).size);

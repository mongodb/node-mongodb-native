/* eslint-disable @typescript-eslint/no-restricted-imports */
import { expect } from 'chai';

import {
  MongoCryptAzureKMSRequestError,
  MongoCryptCreateDataKeyError,
  MongoCryptCreateEncryptedCollectionError,
  MongoCryptError,
  MongoCryptInvalidArgumentError
} from '../../../src/client-side-encryption/errors';
import { MongoError } from '../../mongodb';

describe('MongoCryptError', function () {
  const errors = [
    new MongoCryptAzureKMSRequestError(''),
    new MongoCryptCreateDataKeyError(
      {
        encryptedFields: {}
      },
      {
        cause: new Error()
      }
    ),
    new MongoCryptCreateEncryptedCollectionError(
      {
        encryptedFields: {}
      },
      { cause: new Error() }
    ),
    new MongoCryptError(''),
    new MongoCryptInvalidArgumentError('')
  ];
  for (const err of errors) {
    describe(err.name, function () {
      it('is subclass of MongoError', function () {
        expect(err).to.be.instanceOf(MongoError);
      });
    });
  }
});

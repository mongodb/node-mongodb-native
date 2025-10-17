import { expectAssignable, expectError, expectNotAssignable, expectType } from 'tsd';

import type {
  AutoEncryptionOptions,
  AWSEncryptionKeyOptions,
  AzureEncryptionKeyOptions,
  ClientEncryption,
  ClientEncryptionEncryptOptions,
  GCPEncryptionKeyOptions,
  KMSProviders,
  RangeOptions
} from '../..';
import { Binary, type ClientEncryptionDataKeyProvider } from '../../src';

type RequiredCreateEncryptedCollectionSettings = Parameters<
  ClientEncryption['createEncryptedCollection']
>[2];

expectError<RequiredCreateEncryptedCollectionSettings>({});
expectError<RequiredCreateEncryptedCollectionSettings>({
  provider: 'blah!',
  createCollectionOptions: { encryptedFields: {} }
});
expectError<RequiredCreateEncryptedCollectionSettings>({
  provider: 'aws',
  createCollectionOptions: {}
});
expectError<RequiredCreateEncryptedCollectionSettings>({
  provider: 'aws',
  createCollectionOptions: { encryptedFields: null }
});

expectAssignable<RequiredCreateEncryptedCollectionSettings>({
  provider: 'aws',
  createCollectionOptions: { encryptedFields: {} }
});
expectAssignable<RequiredCreateEncryptedCollectionSettings>({
  provider: 'aws:namedprovider',
  createCollectionOptions: { encryptedFields: {} }
});
expectAssignable<RequiredCreateEncryptedCollectionSettings>({
  provider: 'aws',
  createCollectionOptions: { encryptedFields: {} },
  masterKey: {} as AWSEncryptionKeyOptions | AzureEncryptionKeyOptions | GCPEncryptionKeyOptions
});

{
  // NODE-5041 - incorrect spelling of rangeOpts in typescript definitions
  const options = {} as ClientEncryptionEncryptOptions;
  expectType<RangeOptions | undefined>(options.rangeOptions);
}

{
  // KMSProviders
  // local
  expectAssignable<KMSProviders['local']>({ key: '' });
  expectAssignable<KMSProviders['local']>({ key: Buffer.alloc(0) });
  expectAssignable<KMSProviders['local']>({ key: Binary.createFromBase64('') });
  // aws
  expectAssignable<KMSProviders['aws']>({ accessKeyId: '', secretAccessKey: '' });
  expectAssignable<KMSProviders['aws']>({
    accessKeyId: '',
    secretAccessKey: '',
    sessionToken: undefined
  });
  expectAssignable<KMSProviders['aws']>({ accessKeyId: '', secretAccessKey: '', sessionToken: '' });
  // automatic
  expectAssignable<KMSProviders['aws']>({});

  // azure
  expectAssignable<KMSProviders['azure']>({ tenantId: 'a', clientId: 'a', clientSecret: 'a' });
  expectAssignable<KMSProviders['azure']>({ tenantId: 'a', clientId: 'a', clientSecret: 'a' });
  expectAssignable<KMSProviders['azure']>({
    tenantId: 'a',
    clientId: 'a',
    clientSecret: 'a',
    identityPlatformEndpoint: undefined
  });
  expectAssignable<KMSProviders['azure']>({
    tenantId: 'a',
    clientId: 'a',
    clientSecret: 'a',
    identityPlatformEndpoint: ''
  });
  expectAssignable<KMSProviders['azure']>({ accessToken: 'a' });
  expectAssignable<KMSProviders['azure']>({});

  // gcp
  expectAssignable<KMSProviders['gcp']>({ email: 'a', privateKey: 'a' });
  expectAssignable<KMSProviders['gcp']>({ email: 'a', privateKey: 'a', endpoint: undefined });
  expectAssignable<KMSProviders['gcp']>({ email: 'a', privateKey: 'a', endpoint: 'a' });
  expectAssignable<KMSProviders['gcp']>({ accessToken: 'a' });
  // automatic
  expectAssignable<KMSProviders['gcp']>({});
}

{
  expectAssignable<ClientEncryptionDataKeyProvider>('aws');
  expectAssignable<ClientEncryptionDataKeyProvider>('gcp');
  expectAssignable<ClientEncryptionDataKeyProvider>('azure');
  expectAssignable<ClientEncryptionDataKeyProvider>('local');
  expectAssignable<ClientEncryptionDataKeyProvider>('kmip');
  expectAssignable<ClientEncryptionDataKeyProvider>('aws:named');
  expectAssignable<ClientEncryptionDataKeyProvider>('gcp:named');
  expectAssignable<ClientEncryptionDataKeyProvider>('azure:named');
  expectAssignable<ClientEncryptionDataKeyProvider>('local:named');
  expectAssignable<ClientEncryptionDataKeyProvider>('kmip:named');

  expectNotAssignable<ClientEncryptionDataKeyProvider>('arbitrary string');
}

{
  expectAssignable<AutoEncryptionOptions>({
    extraOptions: {
      mongocryptdSpawnPath: 'mongocryptd'
    }
  });
  expectAssignable<AutoEncryptionOptions>({
    extraOptions: {
      mongocryptdSpawnPath: 'mongocryptd.exe'
    }
  });
  expectAssignable<AutoEncryptionOptions>({
    extraOptions: {
      mongocryptdSpawnPath: '/usr/bin/mongocryptd'
    }
  });
  expectNotAssignable<AutoEncryptionOptions>({
    extraOptions: {
      mongocryptdSpawnPath: 'mongo_crypt_v1.so'
    }
  });

  expectAssignable<AutoEncryptionOptions>({
    extraOptions: {
      cryptSharedLibPath: 'mongo_crypt_v1.so'
    }
  });
  expectAssignable<AutoEncryptionOptions>({
    extraOptions: {
      cryptSharedLibPath: 'mongo_crypt_v1.dll'
    }
  });
  expectAssignable<AutoEncryptionOptions>({
    extraOptions: {
      cryptSharedLibPath: 'mongo_crypt_v1.dylib'
    }
  });
  expectAssignable<AutoEncryptionOptions>({
    extraOptions: {
      cryptSharedLibPath: '/usr/lib/mongo_crypt_v1.dylib'
    }
  });
  expectNotAssignable<AutoEncryptionOptions>({
    extraOptions: {
      cryptSharedLibPath: 'libmongocrypt.so'
    }
  });
}

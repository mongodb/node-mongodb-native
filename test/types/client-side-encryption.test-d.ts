// TODO(NODE-5422): add TS support for FLE in the driver and unskip type tests

// import { expectAssignable, expectError, expectType, expectNotType, expectNotAssignable } from 'tsd';
// import { RangeOptions, AWSEncryptionKeyOptions, AzureEncryptionKeyOptions, ClientEncryption, GCPEncryptionKeyOptions, ClientEncryptionEncryptOptions, KMSProviders } from '../..';

// type RequiredCreateEncryptedCollectionSettings = Parameters<
//   ClientEncryption['createEncryptedCollection']
// >[2];

// expectError<RequiredCreateEncryptedCollectionSettings>({});
// expectError<RequiredCreateEncryptedCollectionSettings>({
//   provider: 'blah!',
//   createCollectionOptions: { encryptedFields: {} }
// });
// expectError<RequiredCreateEncryptedCollectionSettings>({
//   provider: 'aws',
//   createCollectionOptions: {}
// });
// expectError<RequiredCreateEncryptedCollectionSettings>({
//   provider: 'aws',
//   createCollectionOptions: { encryptedFields: null }
// });

// expectAssignable<RequiredCreateEncryptedCollectionSettings>({
//   provider: 'aws',
//   createCollectionOptions: { encryptedFields: {} }
// });
// expectAssignable<RequiredCreateEncryptedCollectionSettings>({
//   provider: 'aws',
//   createCollectionOptions: { encryptedFields: {} },
//   masterKey: { } as AWSEncryptionKeyOptions | AzureEncryptionKeyOptions | GCPEncryptionKeyOptions
// });

// {
//   // NODE-5041 - incorrect spelling of rangeOpts in typescript definitions
//   const options = {} as ClientEncryptionEncryptOptions;
//   expectType<RangeOptions | undefined>(options.rangeOptions)
// }

// {
//   // KMSProviders
//   // aws
//   expectAssignable<KMSProviders['aws']>({ accessKeyId: '', secretAccessKey: '' });
//   expectAssignable<KMSProviders['aws']>({ accessKeyId: '', secretAccessKey: '', sessionToken: undefined });
//   expectAssignable<KMSProviders['aws']>({ accessKeyId: '', secretAccessKey: '', sessionToken: '' });
//   // automatic
//   expectAssignable<KMSProviders['aws']>({});

//   // azure
//   expectAssignable<KMSProviders['azure']>({ tenantId: 'a', clientId: 'a', clientSecret: 'a' });
//   expectAssignable<KMSProviders['azure']>({ tenantId: 'a', clientId: 'a', clientSecret: 'a' });
//   expectAssignable<KMSProviders['azure']>({ tenantId: 'a', clientId: 'a', clientSecret: 'a', identityPlatformEndpoint: undefined });
//   expectAssignable<KMSProviders['azure']>({ tenantId: 'a', clientId: 'a', clientSecret: 'a', identityPlatformEndpoint: '' });
//   expectAssignable<KMSProviders['azure']>({ accessToken: 'a' });
//   expectAssignable<KMSProviders['azure']>({});

//   // gcp
//   expectAssignable<KMSProviders['gcp']>({ email: 'a', privateKey: 'a' });
//   expectAssignable<KMSProviders['gcp']>({ email: 'a', privateKey: 'a', endpoint: undefined });
//   expectAssignable<KMSProviders['gcp']>({ email: 'a', privateKey: 'a', endpoint: 'a' });
//   expectAssignable<KMSProviders['gcp']>({ accessToken: 'a' });
//   // automatic
//   expectAssignable<KMSProviders['gcp']>({});

// }

const { EJSON } = require('bson');
const { AutoEncrypter } = require('../../../src/client-side-encryption/auto_encrypter');
const { MongoClient } = require('../../../src/mongo_client');

try {
  const extraOptions = JSON.parse(process.env.EXTRA_OPTIONS);
  const autoEncrypter = new AutoEncrypter(new MongoClient(process.env.MONGODB_URI), {
    keyVaultNamespace: 'admin.datakeys',
    logger: () => {},
    kmsProviders: {
      aws: { accessKeyId: 'example', secretAccessKey: 'example' },
      local: { key: Buffer.alloc(96) }
    },
    extraOptions
  });

  process.stdout.write(
    EJSON.stringify(autoEncrypter.cryptSharedLibVersionInfo, { useBigInt64: true, relaxed: false })
  );
} catch (error) {
  process.stderr.write(EJSON.stringify({ error: error.message }));
}

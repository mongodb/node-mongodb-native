import { type KMSProviders } from './../src';

const csfleKMSProviders = {
  aws: {
    accessKeyId: process.env.FLE_AWS_KEY,
    secretAccessKey: process.env.FLE_AWS_SECRET
  },
  azure: {
    tenantId: process.env.FLE_AZURE_TENANTID,
    clientId: process.env.FLE_AZURE_CLIENTID,
    clientSecret: process.env.FLE_AZURE_CLIENTSECRET
  },
  gcp: {
    email: process.env.FLE_GCP_EMAIL,
    privateKey: process.env.FLE_GCP_PRIVATEKEY
  },
  local: {
    key: 'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk'
  },
  kmip: {
    endpoint: 'localhost:5698'
  }
};

export function getCSFLEKMSProviders(): KMSProviders {
  return JSON.parse(JSON.stringify(csfleKMSProviders));
}

const keys = [
  'FLE_AWS_KEY',
  'FLE_AWS_SECRET',
  'FLE_AZURE_TENANTID',
  'FLE_AZURE_CLIENTID',
  'FLE_AZURE_CLIENTSECRET',
  'FLE_GCP_EMAIL',
  'FLE_GCP_PRIVATEKEY'
];

const isInEnvironment = key => typeof process.env[key] === 'string' && process.env[key].length > 0;

export const missingKeys = keys.filter(key => !isInEnvironment(key)).join(',');

export const kmsCredentialsPresent = missingKeys === '';

'use strict';

let defaultModule;
function loadDefaultModule() {
  if (!defaultModule) {
    defaultModule = extension(require('mongodb'));
  }

  return defaultModule;
}

const {
  MongoCryptError,
  MongoCryptCreateEncryptedCollectionError,
  MongoCryptCreateDataKeyError,
  MongoCryptAzureKMSRequestError,
  MongoCryptKMSRequestNetworkTimeoutError
} = require('./errors');

const { fetchAzureKMSToken } = require('./providers/index');

function extension(mongodb) {
  const modules = { mongodb };

  modules.stateMachine = require('./stateMachine')(modules);
  modules.autoEncrypter = require('./autoEncrypter')(modules);
  modules.clientEncryption = require('./clientEncryption')(modules);

  const exports = {
    AutoEncrypter: modules.autoEncrypter.AutoEncrypter,
    ClientEncryption: modules.clientEncryption.ClientEncryption,
    MongoCryptError,
    MongoCryptCreateEncryptedCollectionError,
    MongoCryptCreateDataKeyError,
    MongoCryptAzureKMSRequestError,
    MongoCryptKMSRequestNetworkTimeoutError
  };

  Object.defineProperty(exports, '___azureKMSProseTestExports', {
    enumerable: false,
    configurable: false,
    value: fetchAzureKMSToken
  });

  return exports;
}

module.exports = {
  extension,
  MongoCryptError,
  MongoCryptCreateEncryptedCollectionError,
  MongoCryptCreateDataKeyError,
  MongoCryptAzureKMSRequestError,
  MongoCryptKMSRequestNetworkTimeoutError,
  get AutoEncrypter() {
    const m = loadDefaultModule();
    delete module.exports.AutoEncrypter;
    module.exports.AutoEncrypter = m.AutoEncrypter;
    return m.AutoEncrypter;
  },
  get ClientEncryption() {
    const m = loadDefaultModule();
    delete module.exports.ClientEncryption;
    module.exports.ClientEncryption = m.ClientEncryption;
    return m.ClientEncryption;
  }
};

Object.defineProperty(module.exports, '___azureKMSProseTestExports', {
  enumerable: false,
  configurable: false,
  value: fetchAzureKMSToken
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoEncryptionLoggerLevel = exports.aws4 = exports.saslprep = exports.Snappy = exports.getAwsCredentialProvider = exports.ZStandard = exports.Kerberos = exports.PKG_VERSION = void 0;
const error_1 = require("./error");
const utils_1 = require("./utils");
exports.PKG_VERSION = Symbol('kPkgVersion');
function makeErrorModule(error) {
    const props = error ? { kModuleError: error } : {};
    return new Proxy(props, {
        get: (_, key) => {
            if (key === 'kModuleError') {
                return error;
            }
            throw error;
        },
        set: () => {
            throw error;
        }
    });
}
exports.Kerberos = makeErrorModule(new error_1.MongoMissingDependencyError('Optional module `kerberos` not found. Please install it to enable kerberos authentication'));
try {
    // Ensure you always wrap an optional require in the try block NODE-3199
    exports.Kerberos = require('kerberos');
}
catch { } // eslint-disable-line
exports.ZStandard = makeErrorModule(new error_1.MongoMissingDependencyError('Optional module `@mongodb-js/zstd` not found. Please install it to enable zstd compression'));
try {
    exports.ZStandard = require('@mongodb-js/zstd');
}
catch { } // eslint-disable-line
function getAwsCredentialProvider() {
    try {
        // Ensure you always wrap an optional require in the try block NODE-3199
        const credentialProvider = require('@aws-sdk/credential-providers');
        return credentialProvider;
    }
    catch {
        return makeErrorModule(new error_1.MongoMissingDependencyError('Optional module `@aws-sdk/credential-providers` not found.' +
            ' Please install it to enable getting aws credentials via the official sdk.'));
    }
}
exports.getAwsCredentialProvider = getAwsCredentialProvider;
exports.Snappy = makeErrorModule(new error_1.MongoMissingDependencyError('Optional module `snappy` not found. Please install it to enable snappy compression'));
try {
    // Ensure you always wrap an optional require in the try block NODE-3199
    exports.Snappy = require('snappy');
    try {
        exports.Snappy[exports.PKG_VERSION] = (0, utils_1.parsePackageVersion)(require('snappy/package.json'));
    }
    catch { } // eslint-disable-line
}
catch { } // eslint-disable-line
exports.saslprep = makeErrorModule(new error_1.MongoMissingDependencyError('Optional module `saslprep` not found.' +
    ' Please install it to enable Stringprep Profile for User Names and Passwords'));
try {
    // Ensure you always wrap an optional require in the try block NODE-3199
    exports.saslprep = require('saslprep');
}
catch { } // eslint-disable-line
exports.aws4 = makeErrorModule(new error_1.MongoMissingDependencyError('Optional module `aws4` not found. Please install it to enable AWS authentication'));
try {
    // Ensure you always wrap an optional require in the try block NODE-3199
    exports.aws4 = require('aws4');
}
catch { } // eslint-disable-line
/** @public */
exports.AutoEncryptionLoggerLevel = Object.freeze({
    FatalError: 0,
    Error: 1,
    Warning: 2,
    Info: 3,
    Trace: 4
});
//# sourceMappingURL=deps.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decompress = exports.compress = exports.uncompressibleCommands = exports.Compressor = void 0;
const zlib = require("zlib");
const constants_1 = require("../../constants");
const deps_1 = require("../../deps");
const error_1 = require("../../error");
/** @public */
exports.Compressor = Object.freeze({
    none: 0,
    snappy: 1,
    zlib: 2,
    zstd: 3
});
exports.uncompressibleCommands = new Set([
    constants_1.LEGACY_HELLO_COMMAND,
    'saslStart',
    'saslContinue',
    'getnonce',
    'authenticate',
    'createUser',
    'updateUser',
    'copydbSaslStart',
    'copydbgetnonce',
    'copydb'
]);
const MAX_COMPRESSOR_ID = 3;
const ZSTD_COMPRESSION_LEVEL = 3;
// Facilitate compressing a message using an agreed compressor
function compress(self, dataToBeCompressed, callback) {
    const zlibOptions = {};
    switch (self.options.agreedCompressor) {
        case 'snappy': {
            if ('kModuleError' in deps_1.Snappy) {
                return callback(deps_1.Snappy['kModuleError']);
            }
            if (deps_1.Snappy[deps_1.PKG_VERSION].major <= 6) {
                deps_1.Snappy.compress(dataToBeCompressed, callback);
            }
            else {
                deps_1.Snappy.compress(dataToBeCompressed).then(buffer => callback(undefined, buffer), error => callback(error));
            }
            break;
        }
        case 'zlib':
            // Determine zlibCompressionLevel
            if (self.options.zlibCompressionLevel) {
                zlibOptions.level = self.options.zlibCompressionLevel;
            }
            zlib.deflate(dataToBeCompressed, zlibOptions, callback);
            break;
        case 'zstd':
            if ('kModuleError' in deps_1.ZStandard) {
                return callback(deps_1.ZStandard['kModuleError']);
            }
            deps_1.ZStandard.compress(dataToBeCompressed, ZSTD_COMPRESSION_LEVEL).then(buffer => callback(undefined, buffer), error => callback(error));
            break;
        default:
            throw new error_1.MongoInvalidArgumentError(`Unknown compressor ${self.options.agreedCompressor} failed to compress`);
    }
}
exports.compress = compress;
// Decompress a message using the given compressor
function decompress(compressorID, compressedData, callback) {
    if (compressorID < 0 || compressorID > MAX_COMPRESSOR_ID) {
        throw new error_1.MongoDecompressionError(`Server sent message compressed using an unsupported compressor. (Received compressor ID ${compressorID})`);
    }
    switch (compressorID) {
        case exports.Compressor.snappy: {
            if ('kModuleError' in deps_1.Snappy) {
                return callback(deps_1.Snappy['kModuleError']);
            }
            if (deps_1.Snappy[deps_1.PKG_VERSION].major <= 6) {
                deps_1.Snappy.uncompress(compressedData, { asBuffer: true }, callback);
            }
            else {
                deps_1.Snappy.uncompress(compressedData, { asBuffer: true }).then(buffer => callback(undefined, buffer), error => callback(error));
            }
            break;
        }
        case exports.Compressor.zstd: {
            if ('kModuleError' in deps_1.ZStandard) {
                return callback(deps_1.ZStandard['kModuleError']);
            }
            deps_1.ZStandard.decompress(compressedData).then(buffer => callback(undefined, buffer), error => callback(error));
            break;
        }
        case exports.Compressor.zlib:
            zlib.inflate(compressedData, callback);
            break;
        default:
            callback(undefined, compressedData);
    }
}
exports.decompress = decompress;
//# sourceMappingURL=compression.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoCR = void 0;
const crypto = require("crypto");
const error_1 = require("../../error");
const utils_1 = require("../../utils");
const auth_provider_1 = require("./auth_provider");
class MongoCR extends auth_provider_1.AuthProvider {
    auth(authContext, callback) {
        const { connection, credentials } = authContext;
        if (!credentials) {
            return callback(new error_1.MongoMissingCredentialsError('AuthContext must provide credentials.'));
        }
        const username = credentials.username;
        const password = credentials.password;
        const source = credentials.source;
        connection.command((0, utils_1.ns)(`${source}.$cmd`), { getnonce: 1 }, undefined, (err, r) => {
            let nonce = null;
            let key = null;
            // Get nonce
            if (err == null) {
                nonce = r.nonce;
                // Use node md5 generator
                let md5 = crypto.createHash('md5');
                // Generate keys used for authentication
                md5.update(`${username}:mongo:${password}`, 'utf8');
                const hash_password = md5.digest('hex');
                // Final key
                md5 = crypto.createHash('md5');
                md5.update(nonce + username + hash_password, 'utf8');
                key = md5.digest('hex');
            }
            const authenticateCommand = {
                authenticate: 1,
                user: username,
                nonce,
                key
            };
            connection.command((0, utils_1.ns)(`${source}.$cmd`), authenticateCommand, undefined, callback);
        });
    }
}
exports.MongoCR = MongoCR;
//# sourceMappingURL=mongocr.js.map
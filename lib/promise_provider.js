"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromiseProvider = void 0;
const error_1 = require("./error");
/** @internal */
const kPromise = Symbol('promise');
const store = {
    [kPromise]: null
};
/**
 * Global promise store allowing user-provided promises
 * @deprecated Setting a custom promise library is deprecated the next major version will use the global Promise constructor only.
 * @public
 */
class PromiseProvider {
    /**
     * Validates the passed in promise library
     * @deprecated Setting a custom promise library is deprecated the next major version will use the global Promise constructor only.
     */
    static validate(lib) {
        if (typeof lib !== 'function')
            throw new error_1.MongoInvalidArgumentError(`Promise must be a function, got ${lib}`);
        return !!lib;
    }
    /**
     * Sets the promise library
     * @deprecated Setting a custom promise library is deprecated the next major version will use the global Promise constructor only.
     */
    static set(lib) {
        // eslint-disable-next-line no-restricted-syntax
        if (lib === null) {
            // Check explicitly against null since `.set()` (no args) should fall through to validate
            store[kPromise] = null;
            return;
        }
        if (!PromiseProvider.validate(lib)) {
            // validate
            return;
        }
        store[kPromise] = lib;
    }
    /**
     * Get the stored promise library, or resolves passed in
     * @deprecated Setting a custom promise library is deprecated the next major version will use the global Promise constructor only.
     */
    static get() {
        return store[kPromise];
    }
}
exports.PromiseProvider = PromiseProvider;
//# sourceMappingURL=promise_provider.js.map
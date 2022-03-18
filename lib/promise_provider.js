"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromiseProvider = void 0;
const error_1 = require("./error");
/** @internal */
const kPromise = Symbol('promise');
const store = {
    [kPromise]: undefined
};
/**
 * Global promise store allowing user-provided promises
 * @public
 */
class PromiseProvider {
    /** Validates the passed in promise library */
    static validate(lib) {
        if (typeof lib !== 'function')
            throw new error_1.MongoInvalidArgumentError(`Promise must be a function, got ${lib}`);
        return !!lib;
    }
    /** Sets the promise library */
    static set(lib) {
        if (!PromiseProvider.validate(lib)) {
            // validate
            return;
        }
        store[kPromise] = lib;
    }
    /** Get the stored promise library, or resolves passed in */
    static get() {
        return store[kPromise];
    }
}
exports.PromiseProvider = PromiseProvider;
PromiseProvider.set(global.Promise);
//# sourceMappingURL=promise_provider.js.map
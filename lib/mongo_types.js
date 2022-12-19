"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CancellationToken = exports.TypedEventEmitter = void 0;
const events_1 = require("events");
/**
 * Typescript type safe event emitter
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class TypedEventEmitter extends events_1.EventEmitter {
}
exports.TypedEventEmitter = TypedEventEmitter;
/** @public */
class CancellationToken extends TypedEventEmitter {
}
exports.CancellationToken = CancellationToken;
//# sourceMappingURL=mongo_types.js.map
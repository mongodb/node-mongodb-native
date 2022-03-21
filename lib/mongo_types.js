"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CancellationToken = exports.TypedEventEmitter = exports.BSONType = void 0;
const events_1 = require("events");
/** @public */
exports.BSONType = Object.freeze({
    double: 1,
    string: 2,
    object: 3,
    array: 4,
    binData: 5,
    undefined: 6,
    objectId: 7,
    bool: 8,
    date: 9,
    null: 10,
    regex: 11,
    dbPointer: 12,
    javascript: 13,
    symbol: 14,
    javascriptWithScope: 15,
    int: 16,
    timestamp: 17,
    long: 18,
    decimal: 19,
    minKey: -1,
    maxKey: 127
});
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
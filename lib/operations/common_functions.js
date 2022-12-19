"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareDocs = exports.indexInformation = void 0;
const error_1 = require("../error");
const utils_1 = require("../utils");
function indexInformation(db, name, _optionsOrCallback, _callback) {
    let options = _optionsOrCallback;
    let callback = _callback;
    if ('function' === typeof _optionsOrCallback) {
        callback = _optionsOrCallback;
        options = {};
    }
    // If we specified full information
    const full = options.full == null ? false : options.full;
    let topology;
    try {
        topology = (0, utils_1.getTopology)(db);
    }
    catch (error) {
        return callback(error);
    }
    // Did the user destroy the topology
    if (topology.isDestroyed())
        return callback(new error_1.MongoTopologyClosedError());
    // Process all the results from the index command and collection
    function processResults(indexes) {
        // Contains all the information
        const info = {};
        // Process all the indexes
        for (let i = 0; i < indexes.length; i++) {
            const index = indexes[i];
            // Let's unpack the object
            info[index.name] = [];
            for (const name in index.key) {
                info[index.name].push([name, index.key[name]]);
            }
        }
        return info;
    }
    // Get the list of indexes of the specified collection
    db.collection(name)
        .listIndexes(options)
        .toArray((err, indexes) => {
        if (err)
            return callback(err);
        if (!Array.isArray(indexes))
            return callback(undefined, []);
        if (full)
            return callback(undefined, indexes);
        callback(undefined, processResults(indexes));
    });
}
exports.indexInformation = indexInformation;
function prepareDocs(coll, docs, options) {
    var _a;
    const forceServerObjectId = typeof options.forceServerObjectId === 'boolean'
        ? options.forceServerObjectId
        : (_a = coll.s.db.options) === null || _a === void 0 ? void 0 : _a.forceServerObjectId;
    // no need to modify the docs if server sets the ObjectId
    if (forceServerObjectId === true) {
        return docs;
    }
    return docs.map(doc => {
        if (doc._id == null) {
            doc._id = coll.s.pkFactory.createPk();
        }
        return doc;
    });
}
exports.prepareDocs = prepareDocs;
//# sourceMappingURL=common_functions.js.map
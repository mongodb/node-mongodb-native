'use strict';

const { getSymbolFrom, maybeCallback } = require('../utils');
const { toLegacy } = require('../utils');

module.exports = Object.create(null);

const commonCursorFunctions = new Map([
  [
    'close',
    function close(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(
        Object.getPrototypeOf(this.constructor.prototype).close.call(this, options),
        callback
      );
    }
  ],

  [
    'forEach',
    function forEach(iterator, callback) {
      return maybeCallback(
        Object.getPrototypeOf(this.constructor.prototype).forEach.call(this, iterator),
        callback
      );
    }
  ],

  [
    'hasNext',
    function hasNext(callback) {
      return maybeCallback(
        Object.getPrototypeOf(this.constructor.prototype).hasNext.call(this),
        callback
      );
    }
  ],

  [
    'next',
    function next(callback) {
      return maybeCallback(
        Object.getPrototypeOf(this.constructor.prototype).next.call(this),
        callback
      );
    }
  ],

  [
    'toArray',
    function toArray(callback) {
      return maybeCallback(
        Object.getPrototypeOf(this.constructor.prototype).toArray.call(this),
        callback
      );
    }
  ],

  [
    'tryNext',
    function tryNext(callback) {
      return maybeCallback(
        Object.getPrototypeOf(this.constructor.prototype).tryNext.call(this),
        callback
      );
    }
  ]
]);

module.exports.makeLegacyFindCursor = function (baseClass) {
  class LegacyFindCursor extends baseClass {
    constructor(client, namespace, filter, options) {
      if (client instanceof baseClass) {
        const kFilter = getSymbolFrom(client, 'filter');
        const kClient = getSymbolFrom(client, 'client');
        const kNamespace = getSymbolFrom(client, 'namespace');
        const kOptions = getSymbolFrom(client, 'options');
        super(client[kClient], client[kNamespace], client[kFilter], client[kOptions]);
      } else {
        super(client, namespace, filter, options);
      }
    }

    /** @deprecated Use `collection.estimatedDocumentCount` or `collection.countDocuments` instead */
    count(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.count(options), callback);
    }

    explain(verbosity, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof verbosity === 'function'
          ? verbosity
          : undefined;
      verbosity = typeof verbosity !== 'function' ? verbosity : undefined;
      return maybeCallback(super.explain(verbosity), callback);
    }
  }

  for (const [name, method] of commonCursorFunctions) {
    Object.defineProperty(LegacyFindCursor.prototype, name, { enumerable: false, value: method });
  }

  Object.defineProperty(baseClass.prototype, toLegacy, {
    enumerable: false,
    value: function () {
      return new LegacyFindCursor(this);
    }
  });

  return LegacyFindCursor;
};

module.exports.makeLegacyListCollectionsCursor = function (baseClass) {
  class LegacyListCollectionsCursor extends baseClass {
    constructor(db, filter, options) {
      if (db instanceof baseClass) {
        super(db.parent, db.filter, db.options);
      } else {
        super(db, filter, options);
      }
    }
  }

  for (const [name, method] of commonCursorFunctions) {
    Object.defineProperty(LegacyListCollectionsCursor.prototype, name, {
      enumerable: false,
      value: method
    });
  }

  Object.defineProperty(baseClass.prototype, toLegacy, {
    enumerable: false,
    value: function () {
      return new LegacyListCollectionsCursor(this);
    }
  });

  return LegacyListCollectionsCursor;
};

module.exports.makeLegacyListIndexesCursor = function (baseClass) {
  class LegacyListIndexesCursor extends baseClass {
    constructor(collection, options) {
      if (collection instanceof baseClass) {
        super(collection.parent, collection.options);
      } else {
        super(collection, options);
      }
    }
  }

  for (const [name, method] of commonCursorFunctions) {
    Object.defineProperty(LegacyListIndexesCursor.prototype, name, {
      enumerable: false,
      value: method
    });
  }

  Object.defineProperty(baseClass.prototype, toLegacy, {
    enumerable: false,
    value: function () {
      return new LegacyListIndexesCursor(this);
    }
  });

  return LegacyListIndexesCursor;
};

module.exports.makeLegacyAggregationCursor = function (baseClass) {
  class LegacyAggregationCursor extends baseClass {
    constructor(client, namespace, pipeline, options) {
      if (client instanceof baseClass) {
        const kPipeline = getSymbolFrom(client, 'pipeline');
        super(client.s.client, client.namespace, client[kPipeline], client.s.options);
      } else {
        super(client, namespace, pipeline, options);
      }
    }

    explain(verbosity, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof verbosity === 'function'
          ? verbosity
          : undefined;
      verbosity = typeof verbosity !== 'function' ? verbosity : undefined;
      return maybeCallback(super.explain(verbosity), callback);
    }
  }

  for (const [name, method] of commonCursorFunctions) {
    Object.defineProperty(LegacyAggregationCursor.prototype, name, {
      enumerable: false,
      value: method
    });
  }

  Object.defineProperty(baseClass.prototype, toLegacy, {
    enumerable: false,
    value: function () {
      return new LegacyAggregationCursor(this);
    }
  });

  return LegacyAggregationCursor;
};

import { Collection } from '../../../../src';

// Setup legacy shims for tests that use removed or changed APIs

// @ts-expect-error: Method no longer exists on Collection
Collection.prototype.insert = function (docs, options, callback) {
  callback =
    typeof callback === 'function' ? callback : typeof options === 'function' ? options : undefined;
  options = options != null && typeof options === 'object' ? options : { ordered: false };

  docs = Array.isArray(docs) ? docs : [docs];

  return this.insertMany(docs, options, callback);
};

// @ts-expect-error: Method no longer exists on Collection
Collection.prototype.update = function (filter, update, options, callback) {
  callback =
    typeof callback === 'function' ? callback : typeof options === 'function' ? options : undefined;
  options = options != null && typeof options === 'object' ? options : {};

  return this.updateMany(filter, update, options, callback);
};

// @ts-expect-error: Method no longer exists on Collection
Collection.prototype.remove = function (filter, options, callback) {
  callback =
    typeof callback === 'function' ? callback : typeof options === 'function' ? options : undefined;
  options = options != null && typeof options === 'object' ? options : {};

  return this.deleteMany(filter, options, callback);
};

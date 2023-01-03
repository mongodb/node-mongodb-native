import { Collection } from '../../../../src';

// Setup legacy shims for tests that use removed or changed APIs
const counts = {
  insert: 0,
  update: 0,
  remove: 0
};

// @ts-expect-error: Method no longer exists on Collection
Collection.prototype.insert = function (docs, options, callback) {
  counts.insert += 1;
  callback =
    typeof callback === 'function' ? callback : typeof options === 'function' ? options : undefined;
  options = options != null && typeof options === 'object' ? options : { ordered: false };

  docs = Array.isArray(docs) ? docs : [docs];

  return this.insertMany(docs, options, callback);
};

// @ts-expect-error: Method no longer exists on Collection
Collection.prototype.update = function (filter, update, options, callback) {
  counts.update += 1;
  callback =
    typeof callback === 'function' ? callback : typeof options === 'function' ? options : undefined;
  options = options != null && typeof options === 'object' ? options : {};

  return this.updateMany(filter, update, options, callback);
};

process.on('beforeExit', () => {
  console.dir(counts);
});

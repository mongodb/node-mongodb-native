import { expect } from 'chai';

import { Collection } from '../../../../src';

// Setup legacy shims for tests that use removed or changed APIs
const legacyUsageCounts = {
  insert: 0,
  update: 0
};

const legacyUsageMaximums = {
  insert: 340,
  update: 25
};

// @ts-expect-error: Method no longer exists on Collection
Collection.prototype.insert = function (docs, options) {
  legacyUsageCounts.insert += 1;
  options = options != null && typeof options === 'object' ? options : { ordered: false };

  docs = Array.isArray(docs) ? docs : [docs];

  return this.insertMany(docs, options);
};

// @ts-expect-error: Method no longer exists on Collection
Collection.prototype.update = function (filter, update, options) {
  legacyUsageCounts.update += 1;
  options = options != null && typeof options === 'object' ? options : {};

  return this.updateMany(filter, update, options);
};

function assertLegacyAPIUsageDoesNotIncrease() {
  expect(
    legacyUsageCounts.insert,
    'Please do not use more instance of the legacy CRUD API: insert'
  ).is.lessThanOrEqual(legacyUsageMaximums.insert);
  expect(
    legacyUsageCounts.update,
    'Please do not use more instance of the legacy CRUD API: update'
  ).is.lessThanOrEqual(legacyUsageMaximums.update);
}

export const mochaHooks = {
  afterAll: [assertLegacyAPIUsageDoesNotIncrease]
};

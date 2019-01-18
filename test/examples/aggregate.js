'use strict';

const setupDatabase = require('../functional/shared').setupDatabase;
const MongoClient = require('../../lib/mongo_client');

describe('examples.aggregaton:', function() {
  let client;
  let collection;

  before(async function() {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function() {
    client = await MongoClient.connect(this.configuration.url());
    collection = client.db(this.configuration.db).collection('aggregateExample');
  });

  afterEach(async function() {
    await client.close();
    client = undefined;
    collection = undefined;
  });

  it('supports simple aggregation', {
    metadata: { requires: { mongodb: '>=2.8.0', topology: ['single'] } },
    test: async function() {
      // Start aggregate example 1
      await collection
        .aggregate([{ $match: { 'items.fruit': 'banana' } }, { $sort: { date: 1 } }])
        .toArray();
      // End aggregate example 1
    }
  });

  it('supports $match, $group, $project, $unwind, $sum, $sort, $dayOfWeek', {
    metadata: { requires: { mongodb: '>=2.8.0', topology: ['single'] } },
    test: async function() {
      // Start aggregate example 2
      await collection
        .aggregate([
          {
            $unwind: '$items'
          },
          {
            $match: {
              'items.fruit': 'banana'
            }
          },
          {
            $group: {
              _id: { day: { $dayOfWeek: '$date' } },
              count: { $sum: '$items.quantity' }
            }
          },
          {
            $project: {
              dayOfWeek: '$_id.day',
              numberSold: '$count',
              _id: 0
            }
          },
          {
            $sort: { numberSold: 1 }
          }
        ])
        .toArray();
      // End aggregate example 2
    }
  });

  it('supports $unwind, $group, $sum, $dayOfWeek, $multiply, $project, $cond', {
    metadata: { requires: { mongodb: '>=2.8.0', topology: ['single'] } },
    test: async function() {
      // Start aggregate example 3
      await collection
        .aggregate([
          {
            $unwind: '$items'
          },
          {
            $group: {
              _id: { day: { $dayOfWeek: '$date' } },
              items_sold: { $sum: '$items.quantity' },
              revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
            }
          },
          {
            $project: {
              day: '$_id.day',
              revenue: 1,
              items_sold: 1,
              discount: {
                $cond: { if: { $lte: ['$revenue', 250] }, then: 25, else: 0 }
              }
            }
          }
        ])
        .toArray();
      // End aggregate example 3
    }
  });

  it('supports $lookup, $filter, $match', {
    metadata: { requires: { mongodb: '>=2.8.0', topology: ['single'] } },
    test: async function() {
      // Start aggregate example 4
      await collection
        .aggregate([
          {
            $lookup: {
              from: 'air_airlines',
              let: { constituents: '$airlines' },
              pipeline: [
                {
                  $match: { $expr: { $in: ['$name', '$$constituents'] } }
                }
              ],
              as: 'airlines'
            }
          },
          {
            $project: {
              _id: 0,
              name: 1,
              airlines: {
                $filter: {
                  input: '$airlines',
                  as: 'airline',
                  cond: { $eq: ['$$airline.country', 'Canada'] }
                }
              }
            }
          }
        ])
        .toArray();
      // End aggregate example 4
    }
  });
});

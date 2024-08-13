const {
  makeClient,
  connectClient,
  initDb,
  disconnectClient,
  dropDb,
  initCollection,
  createCollection,
  dropCollection,
  makeLoadJSON,
  makeLoadTweets
} = require('../../driverBench/common');

function makeSingleBench(suite) {
  suite
    .benchmark('returnDocument', benchmark =>
      benchmark
        .taskSize(1.531e-3) // One tweet is 1,531 bytes or 0.001531 MB
        .setup(makeLoadJSON('tweet.json'))
        .task(async function () {
          return this.doc;
        })
    )
    .benchmark('runCommand', benchmark =>
      benchmark
        .taskSize(0.16)
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .task(async function () {
          for (let i = 0; i < 10000; ++i) {
            await this.db.command({ hello: true });
          }
        })
        .teardown(disconnectClient)
    )
    .benchmark('findOne', benchmark =>
      benchmark
        .taskSize(16.22)
        .setup(makeLoadJSON('tweet.json'))
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .setup(dropDb)
        .setup(initCollection)
        .setup(makeLoadTweets(true))
        .task(async function () {
          for (let _id = 0; _id < 10000; ++_id) {
            await this.collection.findOne({ _id });
          }
        })
        .teardown(dropDb)
        .teardown(disconnectClient)
    )
    .benchmark('smallDocInsertOne', benchmark =>
      benchmark
        .taskSize(2.75)
        .setup(makeLoadJSON('small_doc.json'))
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .setup(dropDb)
        .setup(initDb)
        .setup(initCollection)
        .setup(createCollection)
        .beforeTask(dropCollection)
        .beforeTask(createCollection)
        .beforeTask(initCollection)
        .beforeTask(function () {
          this.docs = Array.from({ length: 10000 }, () => Object.assign({}, this.doc));
        })
        .task(async function () {
          for (const doc of this.docs) {
            await this.collection.insertOne(doc);
          }
        })
        .teardown(dropDb)
        .teardown(disconnectClient)
    )
    .benchmark('largeDocInsertOne', benchmark =>
      benchmark
        .taskSize(27.31)
        .setup(makeLoadJSON('large_doc.json'))
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .setup(dropDb)
        .setup(initDb)
        .setup(initCollection)
        .setup(createCollection)
        .beforeTask(dropCollection)
        .beforeTask(createCollection)
        .beforeTask(initCollection)
        .beforeTask(function () {
          this.docs = Array.from({ length: 10 }, () => Object.assign({}, this.doc));
        })
        .task(async function () {
          for (const doc of this.docs) {
            await this.collection.insertOne(doc);
          }
        })
        .teardown(dropDb)
        .teardown(disconnectClient)
    );
}

module.exports = { makeSingleBench };

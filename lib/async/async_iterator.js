'use strict';

const PromiseProvider = require('../promise_provider');

// async function* asyncIterator() {
//   while (true) {
//     const value = await this.next();
//     if (!value) {
//       await this.close();
//       return;
//     }

//     yield value;
//   }
// }

// TODO: change this to the async generator function above
function asyncIterator() {
  const Promise = PromiseProvider.get();
  const cursor = this;

  return {
    next: function() {
      return Promise.resolve()
        .then(() => cursor.next())
        .then(value => {
          if (!value) {
            return cursor.close().then(() => ({ value, done: true }));
          }
          return { value, done: false };
        });
    }
  };
}

exports.asyncIterator = asyncIterator;

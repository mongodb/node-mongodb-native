'use strict';

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

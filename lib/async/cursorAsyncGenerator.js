'use strict';

async function* asyncIterator() {
  while (true) {
    const value = await this.next();
    if (!value) {
      return;
    }

    yield value;
  }
}

exports.asyncIterator = asyncIterator;

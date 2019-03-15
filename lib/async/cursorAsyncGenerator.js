'use strict';

async function* asyncIterator() {
  while (true) {
    const value = await this.next();
    if (!value) {
      await this.close();
      return;
    }

    yield value;
  }
}

exports.asyncIterator = asyncIterator;

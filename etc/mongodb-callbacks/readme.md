# MongoDB Node.js Callback Legacy Package

Here is the legacy package for callback support in the MongoDB Driver. Similar to how Node.js has begun to ship promise alternatives to our well known stdlib APIs:

```js
const fs = require('fs/promises')
await fs.readFile('...')
```

We are soon shipping our `'mongodb'` with promise only APIs, but this package can help those who have difficulty adopting that change by continuing to offer our API in it's existing form a combination of callback and promise support. We hope that this module will require only the change of the import string from `'mongodb'` to `'mongodb-legacy'` along with adding `'mongodb-legacy'` to your `package.json`. Our intent is to ensure that the existing APIs offer precisely the same behavior as before, the logic for handling callback or promise been moved to these light wrappers. Please let us know if you encounter any differences if you have need of this package.

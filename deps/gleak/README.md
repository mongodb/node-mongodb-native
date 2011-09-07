# Gleak
Global variable leak detection for Node.js

    var gleak = require('gleak');

    gleak.detect().forEach(function (name) {
      console.warn('found global leak: %s', name);
    });

Global variable leaks in javascript can bite you when you least
expect it. Do something about it now and run this module after
your tests, after HTTP requests, and after you brush your teeth.

## Configurable:

Gleak comes configured for Node.js and will ignore built-ins by default
but you can configure it however your like:

    var gleak = require('gleak');
    gleak.whitelist.push(app, db);

`gleak.whitelist` is an array that holds all globals we want to ignore.
Push to it or blow it away completely with your own list.

    gleak.whitelist = [dnode, cluster];

If you don't want anything fancy and want to quickly dump all
global leaks to your console, just call `print()`.

    gleak.print(); // prints "Gleak!: leakedVarName"

## Expressable

We might want to print leaked variables to our console after each
HTTP request. This is especially helpful during development.
To accomplish this we can utilize the bundled [express](http://expressjs.com) middleware:

    var app = express.createServer();
    app.use(gleak.middleware());

What if we want to output to a different stream than stderr?

    app.use(gleak.middleware(stream));

How about customized logging formats?

    app.use(gleak.middleware('\x1b[31mLeak!\x1b[0m %s'));

Combining formats and streams?

    app.use(gleak.middleware(stream, '\x1b[31mLeak!\x1b[0m %s'));

## Installable

  npm install gleak

### Node version
Compatible with Node >=v0.4 <0.5.0

## License

(The MIT License)

Copyright (c) 2011 [Aaron Heckmann](aaron.heckmann+github@gmail.com)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

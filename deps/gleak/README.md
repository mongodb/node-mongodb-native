# Gleak
Global variable leak detection for Node.js

    var detector = require('gleak')();

    detector.detect().forEach(function (name) {
      console.warn('found global leak: %s', name);
    });

Global variable leaks in javascript can bite you when you least
expect it. Do something about it now and run this module after
your tests, after HTTP requests, and after you brush your teeth.

## Detectable

As demonstrated, gleak comes with the `detect` method which returns
an array of all found variable leaks.

Often times we want to run the detector many times, progressively
checking for any new leaks that occurred since we last checked. In
this scenario we can utilize the `detectNew` method.

    var detector = require('gleak')();

    x = 1;
    detector.detectNew(); // ['x']
    detector.detectNew(); // []
    y = 3;
    detector.detectNew(); // ['y']

## Configurable:

Gleak comes configured for Node.js and will ignore built-ins by default
but you can configure it however your like:

    var gleak = require('gleak')();
    gleak.ignore(app, db);

The `gleak.ignore` method allows us to add globals we want to ignore
while safely ignoring duplicates.

`gleak.whitelist` is an array that holds all globals we are ignoring.
You can push to it or blow it away completely with your own list too.

    var gleak = require('gleak')();
    gleak.whitelist = [dnode, cluster];

Changes to your whitelists do not impact any global settings. For example:

    var gleak = require('gleak');
    var g1 = gleak();
    var g2 = gleak();

    g1.ignore(myglobal);
    g2.whitelist.indexOf(myglobal) === -1;

`g2` does not inherit changes to `g1`s whitelist.

## Printable

If you don't want anything fancy and want to quickly dump all
global leaks to your console, just call `print()`.

    var gleak = require('gleak')();
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

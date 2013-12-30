var Readable = require('stream').Readable,
    util = require('util');
util.inherits(SSC, Readable);

/**
 * Return a simple stream cursor object
 */
function SSC() {
    Readable.call(this);
    this._stuff = ["Sam", "I", 'am', "green", "eggs", "no", "ham"];
    this.setEncoding('utf8');
}

/**
 * A call to read
 */
SSC.prototype._read = function(size) {
    var self = this;
    if (self._stuff.length == 0) {
	self.push(null);
    }
    else {
	var c = self._stuff.shift() + ",";
	if (c) {
	    var buf = new Buffer(c.slice(0, size), 'ascii');
	    self.push(c);
	}
    }
};

/** 
 * Get and return one word from the cursor. 
 */
SSC.prototype.word = function(callback) {

    var self = this;
    var masterBuf = [];

    // Will doing things like this mess up the stream on the client side, 
    // if they are also using the cursor directly as a stream?
    // Willing to bet that it does, perhaps we can pipe it or something.
    var iv = setInterval(function() {
	var buf = self.read();
	if (buf) {
	    n = buf.indexOf(",");
	    if (n != -1) {
		self.unshift(buf.slice(n + 1));
		masterBuf.push(buf.slice(0,n));
		callback(masterBuf);
		clearInterval(iv);
	    }
	    else {
		masterBuf.push(buf);
	    }
	}
	else {
	    clearInterval(iv);
	    callback(buf);
	}
    }, 100);
    return;
}

/**
 * Gets all words from the cursor.
 */

SSC.prototype.printAllWords = function() {
    self = this;
    self.word(function(word) {
	if (word) {
	    console.log(word[0]);
	    self.printAllWords();
	}
    });
}

var ssc = new SSC();
ssc.word(function(word) {
    console.log(word[0]);
});

ssc.printAllWords();


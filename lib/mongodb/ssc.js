var Readable = require('stream').Readable,
    util = require('util');
util.inherits(SSC, Readable);

/**
 * Return a simple stream cursor object
 */
function SSC() {
    Readable.call(this, {objectMode: true});
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
	var c = self._stuff.shift();
	if (c) {
	    self.push(c);
	}
    }
};

/**
 * Gets all words from the cursor in an array
 */
SSC.prototype.toArray = function() {
    var self = this;
    var word;
    var words = [];

    while (word = self.read()) {
	words.push(word);
    }
    return words;
}

// test
var ssc = new SSC();

// get each word, one by one
ssc.on('readable', function() {
    var word;
    while (word = ssc.read()) {
	console.log(word);
	}
});

// get the words as an array
var ssc2 = new SSC();
console.log(ssc2.toArray());




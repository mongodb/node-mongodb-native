
# metamocha
Metamocha is a test runner based on [Mocha](https://mochajs.org/), which allows you to include metadata with each test and add filters to selectively run certain tests. 

## Installation
You can install the module from npm 
```
npm install metamocha
```


## Usage
Here's an example of a test runner that uses `metamocha`. It works in a very similar way to [using Mocha programatically](https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically).
```javascript
var Metamocha = require('metamocha');

// Instantiate new Metamocha
var metamocha = new Metamocha();

// Add files from directory
metamocha.addFolder('test/');

// Apply a filter
metamocha.addFilter({
  filter: function(test) {
    return test.hasOwnProperty('metadata');
  }
});

// Set up test configuration

// Useful in situations where configuration is used to set up 
// things before the test run and you would like tests to have 
// reference to this information
var config = { a: 1 };

// Run
metamocha.run(config, function(failures) {
  process.on('exit', function() {
    process.exit(failures);
  });
});
```

### Add metadata to your tests

Metadata, in the form of an object, can be passed to tests themselves in two ways.
```javascript
// Standard 'it' test, with no metadata
it('should have no metadata', () => {

});

// Test with metadata passed as the second argument
it('should have metadata', { a: 1 }, () => {
    
});

// Test with metadata passed in an alternate object-based syntax
it('should also have metadata', {
    metadata: { a: 1 },

    test: function() {

    }
});
```

### Add metadata to your suites
Metadata can also be passed to tests through the suite level. By default, any tests will inherit their suite's metadata if it's present. If a test has its own metadata, it'll override any metadata passed in through the suite.
```javascript
// Suite metadata passed as the second argument
describe('a suite with metadata', { a: 1 }, () => {
  it('should pass its metadata on to its tests', () => {
    // This test should have metadata { a : 1 }
  }); 

  it('should have its metadata overriten by test-level metadata', {
    metadata: { a: 2 },

    test: function() {
      // This test should have metadata { a: 2 }
    }
  });
});

// Suite metadata passed in an alternate object-based syntax
describe('another suite with metadata', {
  metadata: { a: 1 },

  tests: function() {
    it('should still pass its metadata along', () => {
      // This test should have metadata { a: 1 }
    });
  }
}); 
```

### Have tests reference their own metadata
A test's metadata is contained within its `Context`, so you can access it with `this.metadata` inside the test run.
```javascript
it('should be able to access its own metadata', {
  metadata: { a: 1 },

  test: function() {
    expect(this.metadata).to.eql({ a: 1 });
  }
});
```

Configuration is also contained within the `Context` and can be accessed in a very similar .
```javascript
// test runner
var config = { a: 1 };

metamocha.run(config, function(failures) {
  process.on('exit', function() {
    process.exit(failures);
  });
});

// test file
it('should be able to access its own configuration' function() {
  expect(test.configuration).to.eql({ c: 1 })
});
```

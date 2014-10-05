  'use strict';

var f = require('util').format
  , fs = require('fs');
var conf = env.conf;
// Get the default indent
var indent = env.conf.examples && env.conf.examples.indent ? env.conf.examples.indent : 2;

// State for the plugin
var tests = {};
var example = {};

exports.defineTags = function(dictionary) {
  dictionary.defineTag('example-class', {
      onTagged: function(doclet, tag) {
        example.class = tag.text;
      }
  });  

  dictionary.defineTag('example-method', {
      onTagged: function(doclet, tag) {
        example.method = tag.text;
        doclet.example = example;
      }
  });  
}

var formatCode = function(object) {
  var strings = [];
  // Clean the description
  var parts = object.description.replace(/<p>|\<\/p\>/g, '').split('\n');
  parts = parts.map(function(x) {
    return f('// %s', x);
  });  
  strings.push(parts.join('\n'));

  // Clean the code itself
  var lines = object.code.split('\n');
  lines.shift();
  lines.pop();
  
  // Locate the first index
  // Trim left
  lines = lines.map(function(x) {
    return x.substr(indent);
  });

  // Replace statements
  var replacements = [];
  var removals = [];
  // Do we add the lines
  var addLines = false;
  // Execute template commands
  var finalLines = [];
  for(var i = 0; i < lines.length; i++) {
    // console.log(f("%d :: %s", i, lines[i]))
    if(lines[i].indexOf('// BEGIN') != -1) {
      addLines = true;
    } else if(lines[i].indexOf('// END') != -1) {
      addLines = false;
      break;
    } else if(lines[i].indexOf('// LINE') != -1) {
      finalLines.push(lines[i].split("// LINE ")[1]);
    } else if(lines[i].indexOf('// REMOVE-LINE') != -1) {
      removals.push(lines[i].split('// REMOVE-LINE ')[1]);
    } else if(lines[i].indexOf('// REPLACE') != -1) {
      var right = lines[i].split('// REPLACE ')[1];
      var parts = right.split(" WITH ");
      replacements.push({match: parts[0], replace: parts[1]});
    } else if(addLines) {
      var line = lines[i];
      // Do we add it
      var addLine = true;
      
      // Go through all the removals
      for(var j = 0; j < removals.length; j++) {
        if(line.indexOf(removals[j]) != -1) {
          addLine = false;
        }
      }

      // Go through all the replacements
      for(var j = 0; j < replacements.length; j++) {
        if(line.indexOf(replacements[j].match) != -1) {
          line = line.replace(replacements[j].match, replacements[j].replace);
        }
      }

      if(addLine) finalLines.push(line);
    }
  }
 
  // Add the cleaned code
  strings.push(finalLines.join('\n'));
  return strings.join('\n\n');
}

exports.handlers = {
    newDoclet: function(e) {
      // Do we have an annotated test
      if(e.doclet.example) {
        // Get the method
        var filename = f("%s/%s", e.doclet.meta.path, e.doclet.meta.filename);
        // Read the whole file
        var data = fs.readFileSync(filename, 'utf8');
        // Get the substring
        var code = data.substr(e.doclet.meta.range[0], e.doclet.meta.range[1]);
        // Add to the tests
        if(tests[e.doclet.example.class] == null) 
          tests[e.doclet.example.class] = {};
        if(tests[e.doclet.example.class][e.doclet.example.method] == null)
          tests[e.doclet.example.class][e.doclet.example.method] = [];
        // Save the test
        tests[e.doclet.example.class][e.doclet.example.method].push({
            description: e.doclet.description
          , code: code
        });
      } else if(e.doclet.kind == 'function' && e.doclet.scope == 'instance') {
        if(tests[e.doclet.memberof] != null 
          && tests[e.doclet.memberof][e.doclet.name] != null) {
          if(e.doclet.examples == null) e.doclet.examples = [];
          // console.log("-----------------------------------------")
          // console.dir(e.doclet.memberof)
          // console.dir(Object.keys(tests))
          // console.dir(e.doclet.name)
          // console.dir(tests[e.doclet.memberof][e.doclet.name])
          // Add all the items
          if(Array.isArray(tests[e.doclet.memberof][e.doclet.name])) {
            tests[e.doclet.memberof][e.doclet.name].forEach(function(x) {
              e.doclet.examples.push(formatCode(x));
            });            
          }
        }
      }
    },

    fileComplete: function() {
      // currentClass = null;
    }
}
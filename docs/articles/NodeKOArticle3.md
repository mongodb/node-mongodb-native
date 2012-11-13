# The wonderful world of GEO spatial indexes in MongoDB
MongoDB has native support for geospatial indexes and extensions to the query language to
support a lot of different ways of querying your geo spatial documents. We will touch on a 
all of the available features of the MongoDB geospatial support point by point as outlined
below.

* Query $near a point with a maximum distance around that point
* Set the minimum and maximum range for the 2d space letting you map any data to the space
* GeoNear command lets you return the distance from each point found
* $within query lets you set a shape for you query letting you use a circle, box or arbitrary polygon, letting you map complex geo queries such as congressional districts or post code zones.

But first let's cover the basics of getting you up and running starting with what a document needs to look like
for the indexing to work.

## Geospatialize your documents
Somehow we need to tell MongoDB what fields represent our geospatial coordinates. Luckily for us this is very simple. Lets take a simple sample document representing the best imaginative Burger place in the world.

    var document = {
      name: "Awesome burger bar"      
    }

Not we need know that it's located on the fictitious planet (Burgoria) and more specifically at the coordinates
[50, 50]. So how do we add this to the document so we can look it up using geospatial searches ? Well it's very
simple just add it as a field as shown below.

    var document = {
      name: "Awesome burger bar",
      loc: [50, 50]      
    }

Easy right? The only thing you have to ensure is that the first coordinate is the **x** coordinate and the second one is the **y** coordinate **[x, y]**.

Let's go ahead and connect to the database and insert the document

    var MongoClient = require('mongodb').MongoClient;

    var document = {
      name: "Awesome burger bar",
      loc: [50, 50]      
    }

    MongoClient.connect("mongodb://localhost:27017/geodb", function(err, db) {
      if(err) return console.dir(err)

      db.collection('places').insert(document, {w:1}, function(err, result) {
        if(err) return console.dir(err)
      });
    });

So now we have a document in our collection. We now need to tell MongoDB to index our collection and create a 2D index on our loc attribute so we can avail us of the awesome geospatial features. This turns out to be easy as well. Let's modify the code to ensure we have the index on startup.

    var MongoClient = require('mongodb').MongoClient;

    var document = {
      name: "Awesome burger bar",
      loc: [50, 50]      
    }

    MongoClient.connect("mongodb://localhost:27017/geodb", function(err, db) {
      if(err) return console.dir(err)
      var collection = db.collection('places');

      collection.ensureIndex({loc: "2d"}, {min: -500, max: 500, w:1}, function(err, result) {
        if(err) return console.dir(err);

        collection.insert(document, {w:1}, function(err, result) {
          if(err) return console.dir(err)
        });
      });
    });

**ensureIndex** does the trick creating the index if it does not already exist. By specifying **{loc: "2d"}** MongoDB will index the array contained in every document under the field name **loc**. The **min** and **max** defines the boundaries of our (Burgoria) and means that points outside -500 and 500 will throw an error as it's not on the planet.

## Basic queries for your geospatial documents
Since we now have a geospatial index on our collection let's play around with the query methods and learn how we can work with the data. First however let's add some more documents so we can see the effects of the different boundaries.

    var MongoClient = require('mongodb').MongoClient;

    var documents = [
        {name: "Awesome burger bar", loc: [50, 50]}
      , {name: "Not an Awesome burger bar", loc: [10, 10]}
      , {name: "More or less an Awesome burger bar", loc: [45, 45]}
    ]

    MongoClient.connect("mongodb://localhost:27017/geodb", function(err, db) {
      if(err) return console.dir(err)
      var collection = db.collection('places');

      collection.ensureIndex({loc: "2d"}, {min: -500, max: 500, w:1}, function(err, result) {
        if(err) return console.dir(err);

        collection.insert(documents, {w:1}, function(err, result) {
          if(err) return console.dir(err)
        });
      });
    });

Right from now one for brevities sake we are going to assume we have the documents stored in the collection and the index created so we can work on queries without the boilerplate insert and index creation code. The first thing we are going to do is locate all the documents that's a distance of 10 away from 50, 50.

    var MongoClient = require('mongodb').MongoClient,
      assert = require('assert');

    MongoClient.connect("mongodb://localhost:27017/geodb", function(err, db) {
      if(err) return console.dir(err)
      
      db.collection('places').find({loc: {$near: [50,50], $maxDistance: 10}}).toArray(function(err, docs) {
        if(err) return console.dir(err)

        assert.equal(docs.length, 2);
      });
    });

This returns the following results (ignore the _id it will be different as it's a collection assigned key).

    { "_id" : 509a47337d6ab61b2871ee8e, "name" : "Awesome burger bar", "loc" : [ 50, 50 ] }
    { "_id" : 509a47337d6ab61b2871ee90, "name" : "More or less an Awesome burger bar", "loc" : [ 45

Let's look at the query. **$near** specifies the center point for the geospatial query and **$maxDistance** the radius of the search circle. Given this the query will return the two documents at **[50, 50]** and **[10, 10]**. Now this is a nice feature but what if we need to know the distance from each of the found documents to the originating center for our query. Luckily we have a command that support that called **geoNear**. Let's execute it and look at the results.

    var MongoClient = require('mongodb').MongoClient,
      assert = require('assert');

    MongoClient.connect("mongodb://localhost:27017/geodb", function(err, db) {
      if(err) return console.dir(err)
      
      db.collection('places').geoNear(50, 50, {$maxDistance:10}, function(err, result) {
        if(err) return console.dir(err)

        assert.equal(result.results, 2);
      });
    });

Let's look at the results returned by the query.

    {
      "ns" : "test.places",
      "near" : "1100000011110000111100001111000011110000111100001111",
      "results" : [
        {
          "dis" : 0,
          "obj" : {
            "_id" : 509a47337d6ab61b2871ee8e,
            "name" : "Awesome burger bar",
            "loc" : [
              50,
              50
            ]
          }
        },
        {
          "dis" : 7.0710678118654755,
          "obj" : {
            "_id" : 509a47337d6ab61b2871ee90,
            "name" : "More or less an Awesome burger bar",
            "loc" : [
              45,
              45
            ]
          }
        }
      ],
      "stats" : {
        "time" : 0,
        "btreelocs" : 0,
        "nscanned" : 2,
        "objectsLoaded" : 2,
        "avgDistance" : 3.5355339059327378,
        "maxDistance" : 7.071128503792992
      },
      "ok" : 1
    }

Notice that **geoNear** is a command not a find query so it returns a single document with the results in the results field of the returned document. As we can see from the results each returned result has a field called **dis** that is the distance of the document from the center point of our search. Cool we've now covered the basics of geospatial search so let's move onto more advanced queries.

## Advanced queries for your geospatial documents
So besides these simple queries we can also do **bounds queries**. With bounds queries we mean we can look for points of interest inside a defined boundary. This can be useful if you have such things as a post code area, congressional district or any sort of bounding box that is not a pure circle (say look for all restaurants in the west village in new york). Let's go through the basics.

### The magical boundry box query
Our country Whopper on Burgoria is a perfectly bound box (imagine that). Our application wants to restrict our searches to only burger bars in Burgonia. The boundaries for Burgonia are defined by (30, 30) -> (30, 60) and (30, 60) -> (60, 60). Great let's peform a box bounded query.

    var MongoClient = require('mongodb').MongoClient,
      assert = require('assert');

    MongoClient.connect("mongodb://localhost:27017/geodb", function(err, db) {
      if(err) return console.dir(err)
      var box = [[30, 30], [60, 60]];

      db.collection('places').find({loc: {$within: {$box: box}}).toArray(function(err, docs) {
        if(err) return console.dir(err)

        assert.equal(docs.length, 2);
      });
    });

The results returned are.

    { "_id" : 509a47337d6ab61b2871ee8e, "name" : "Awesome burger bar", "loc" : [ 50, 50 ] }
    { "_id" : 509a47337d6ab61b2871ee90, "name" : "More or less an Awesome burger bar", "loc" : [ 45

### A polygon to far
Awesome we can now do a query by our perfectly boxed country. Inside Whopper the country is split into triangles where triangle one is made up of three points (40, 40), (40, 50), (45, 45). We want to look for points that are only inside this triangle. Let's have a look at the query.

    var MongoClient = require('mongodb').MongoClient,
      assert = require('assert');

    MongoClient.connect("mongodb://localhost:27017/geodb", function(err, db) {
      if(err) return console.dir(err)
      var triangle = [[40, 40], [40, 50], [45, 45]];

      db.collection('places').find({loc: {$within: {$polygon: triangle}}).toArray(function(err, docs) {
        if(err) return console.dir(err)

        assert.equal(docs.length, 2);
      });
    });

The results returned are.

    { "_id" : ObjectId("509a47337d6ab61b2871ee90"), "name" : "More or less an Awesome burger bar", "loc" : [ 45, 45 ] }

Cool things you can use this with is f.ex with the data at [https://nycopendata.socrata.com/browse?tags=geographic](https://nycopendata.socrata.com/browse?tags=geographic) you can create queries slicing new york into areas and look for data points inside those areas. So we've seen how we can query geo spatially in a lot of different ways. In closing we want to mention some simple ideas to get your mind churning.

## Geospatial interesting tidbits
So geospatial is what we mostly promote the features as but at some point you'll realize that it's a generic set of 2d indexes that can be used to index and **x,y** data. You could consider indexing any data points that fit into a 2d space and using the geo query functionality to retrieve subsets of that data. Say if you map price vs apartment size and want to say giving an apartment find me everything that is "close" to the ideal price and size that I'm looking for. The limit here is your fantasy but as you can see it's a pretty general and very powerful feature once you get over looking at the feature as a pure geographical function. With that I leave you to experiment and have fun with the features we have introduced.

## Links and stuff
* [The driver examples, good starting point for basic usage](https://github.com/mongodb/node-mongodb-native/tree/master/examples)
* [All the integration tests, they have tons of different usage cases](https://github.com/mongodb/node-mongodb-native/tree/master/test)
* [MongoDB geospatial pages](http://www.mongodb.org/display/DOCS/Geospatial+Indexing)
* [More specialized geo haystack indexing](http://www.mongodb.org/display/DOCS/Geospatial+Haystack+Indexing)










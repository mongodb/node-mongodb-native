+++
date = "2015-03-19T14:27:51-04:00"
title = "Codec and CodecRegistry"
[menu.main]
  parent = "BSON"
  weight = 40
  pre = "<i class='fa'></i>"
+++

## Codec and CodecRegistry

In the last section we saw how to use the [`BsonReader`]({{< apiref "org/bson/BsonReader" >}}) and 
[`BsonWriter`]({{< apiref "org/bson/BsonWriter" >}}) API to read and write BSON documents.  But writing code at that 
low a level is tedious and error-prone, so in practice these algorithms are packaged in implementations of the 
[`Codec`]({{< apiref "org/bson/codecs/Codec" >}}) interface.

### Codec

The `Codec` interface abstracts the processes of decoding a BSON value into a Java object using a `BsonReader` and encoding a Java object
 into a BSON value using a `BsonWriter`.  The BSON value can be as simple as a boolean or as complex as a document or array.  
 
Let's look at a simple `Codec` implementation that encodes a Java `Integer` to a BSON Int32, and vice versa:
   
```java
public class IntegerCodec implements Codec<Integer> {
    @Override
    public void encode(final BsonWriter writer, final Integer value, final EncoderContext encoderContext) {
        writer.writeInt32(value);
    }

    @Override
    public Integer decode(final BsonReader reader, final DecoderContext decoderContext) {
        return reader.readInt32();
    }

    @Override
    public Class<Integer> getEncoderClass() {
        return Integer.class;
    }
}
```   

The `encode` method takes a `BsonWriter` and an `Integer` and calls the `writeInt32` method on the `BsonWriter` with the value of the 
`Integer`, while the `decode` method takes a `BsonReader` and calls the `readInt32` method on the `BsonReader`, returning the value as an
`Integer`.

A `Codec` implementation than encodes to and decodes from a BSON document or array is more complicated, and would typically 
rely on a set of simpler `Codec` implementations for the basic BSON value types.  For this, it can rely on a `CodecRegistry`.

### CodecRegistry

A [`CodecRegistry`]({{< apiref "org/bson/codecs/configuration/CodecRegistry" >}}) contains a set of `Codec` instances that are accessed 
according to the Java classes that they encode from and decode to. Instances of `CodecRegistry` are generally created via static factory 
methods on the [`CodecRegistries`]({{< apiref "org/bson/codecs/configuration/CodecRegistries" >}}) class.  Consider the simplest of these 
methods, one that takes a list of `Codec`s:

```java
CodecRegistry registry = CodecRegistries.fromCodecs(new IntegerCodec(), new LongCodec(), ...);
```

This returns an immutable `CodecRegistry` instance containing all the `Codec` instances passed to the `fromCodecs` method.  They can be 
accessed like this:

```java
Codec<Integer> integerCodec = codecRegistry.get(Integer.class);
Codec<Long> longCodec = codecRegistry.get(Long.class);
```

Now consider a `Codec` for the `Document` class.  This `Codec` implementation, in order to decode and 
encode the values for each field in the document, must be constructed with a `CodecRegistry` to look up the `Codec` instances for each type
of value.  But how could one construct an instance of that `Codec`?  You would have to pass an instance to the 
`CodecRegistries.fromCodecs` method, but you don't have a `CodecRegistry` yet to pass to the constructor.  You need some way to delay the
construction  of the `Document` `Codec` until after the `CodecRegistry` has been constructed.  For that we use a `CodecProvider`. 
    
### CodecProvider
 
A [`CodecProvider`]({{< apiref "org/bson/codecs/configuration/CodecProvider" >}}) is a factory for `Codec` instances.  Unlike 
`CodecRegistry`, its `get` method takes not only a Class, but also a `CodecRegistry`, allowing a `CodecProvider` implementation to 
construct `Codec` instances that require a `CodecRegistry` to look up `Codec` instances for the values contained within it.  Consider a 
`CodecProvider` for the `Document` class:

```java
public class DocumentCodecProvider implements CodecProvider {
    @Override                                                                                          
    public <T> Codec<T> get(final Class<T> clazz, final CodecRegistry registry) {                      
        if (clazz == Document.class) {                      
            // construct DocumentCodec with a CodecRegistry
            return (Codec<T>) new DocumentCodec(registry);           
        }                                                                                              
                                                                                                       
        // CodecProvider returns null if it's not a provider for the requresed Class 
        return null;                                          
    }                                                                                                  
}
```

The `DocumentCodec`, because it is constructed with a `CodecRegistry`, can now use that registry to look up `Codec` instances for the 
values contained in each Document that it encodes.

One more problem remains, however.  Consider the problem of encoding values to a BSON DateTime.  An application may want  to 
encode to a BSON DateTime instances of both the original Java `Date` class as well as the Java 8 `Instant` class.  It's easy to create 
implemenations of `Codec<Date>` and `Codec<Instant>`, and either one can be used for encoding.  But when decoding, a Document `Codec` 
also has to choose which Java type to decode a BSON DateTime to.  Rather than hard-coding it in the `DocumentCodec`, the decision is 
abstracted via the `BsonTypeClassMap` class.
    
### BsonTypeClassMap
    
The [`BsonTypeClassMap`]({{< apiref "org/bson/codecs/BsonTypeClassMap" >}}) class simply maps each value in the `BsonType` 
enumeration to a Java class.  It contains a sensible set of default mappings that can easily be changed by passing an a `Map<BsonType, 
Class<?>>` instance to the constructor with any replacement mappings to apply.  Consider the case where an application wants to decode 
all BSON DateTime values to a Java 8 `Instant` instead of the default `Date`:

```java
Map<BsonType, Class<?>> replacements = new HashMap<BsonType, Class<?>>();
replacements.put(BsonType.DATE_TIME, Instant.class);
BsonTypeClassMap bsonTypeClassMap = new BsonTypeClassMap(replacements);
```

This will replace the default mapping of BSON DateTime to `Date` to one from BSON DateTime to `Instant`.

Putting it all together, we can added a BsonTypeClassMap to the DocumentCodecProvider shown above:
 
```java
public class DocumentCodecProvider implements CodecProvider {
    private final BsonTypeClassMap bsonTypeClassMap;
    
    public DocumentCodecProvider(final BsonTypeClassMap bsonTypeClassMap) { 
        this.bsonTypeClassMap = bsonTypeClassMap;                                       
    }                                                                       
    
    @Override                                                                                          
    public <T> Codec<T> get(final Class<T> clazz, final CodecRegistry registry) {                      
        if (clazz == Document.class) {                      
            // construct DocumentCodec with a CodecRegistry and a BsonTypeClassMap
            return (Codec<T>) new DocumentCodec(registry, bsonTypeClassMap);           
        }                                                                                              
                                                                                                       
        return null;                                                                                   
    }                                                                                                  
}
``` 

The `DocumentCodec`, because it is constructed with both a `BsonTypeClassMap` and a `CodecRegistry`, can first use the `BsonTypeClassMap`
to determine with type to decode each BSON value to, then use the `CodecRegistry` to look up the `Codec` for that Java type.

Finally, we create a `CodecRegistry` instance

```bash
CodecRegistry defaultCodecRegistry = ... 
DocumentCodecProvider documentCodecProvider = ... 
Codec<Instant> instantCodec = ...   
codecRegistry = CodecRegistries.fromRegistries(CodecRegistries.fromCodecs(instantCodec),
                                               CodecRegistries.fromProviders(documentCodecProvider),
                                               defaultCodecRegistry);
```

using two additional static factory methods from the `CodecRegistries` class: one that takes a list of `CodecProvider`s and one which 
takes a list of `CodecRegistry`s.

    


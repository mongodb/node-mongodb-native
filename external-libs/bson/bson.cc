#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <v8.h>
#include <node.h>
#include <node_events.h>
#include <node_buffer.h>
#include <cstring>

using namespace v8;
using namespace node;

// BSON MAX VALUES
const int32_t BSON_INT32_MAX = 2147483648;
const int32_t BSON_INT32_MIN = -2147483648;

// BSON DATA TYPES
const uint32_t BSON_DATA_NUMBER = 1;
const uint32_t BSON_DATA_STRING = 2;
const uint32_t BSON_DATA_OBJECT = 3;
const uint32_t BSON_DATA_ARRAY = 4;
const uint32_t BSON_DATA_BINARY = 5;
const uint32_t BSON_DATA_OID = 7;
const uint32_t BSON_DATA_BOOLEAN = 8;
const uint32_t BSON_DATA_DATE = 9;
const uint32_t BSON_DATA_NULL = 10;
const uint32_t BSON_DATA_REGEXP = 11;
const uint32_t BSON_DATA_CODE_W_SCOPE = 15;
const uint32_t BSON_DATA_INT = 16;
const uint32_t BSON_DATA_TIMESTAMP = 17;
const uint32_t BSON_DATA_LONG = 18;

// BSON BINARY DATA SUBTYPES
const uint32_t BSON_BINARY_SUBTYPE_FUNCTION = 1;
const uint32_t BSON_BINARY_SUBTYPE_BYTE_ARRAY = 2;
const uint32_t BSON_BINARY_SUBTYPE_UUID = 3;
const uint32_t BSON_BINARY_SUBTYPE_MD5 = 4;
const uint32_t BSON_BINARY_SUBTYPE_USER_DEFINED = 128;

static Handle<Value> VException(const char *msg) {
    HandleScope scope;
    return ThrowException(Exception::Error(String::New(msg)));
}

class BSON : public EventEmitter {
  public:
    
    static void Initialize(v8::Handle<v8::Object> target) {
      // Grab the scope of the call from Node
      HandleScope scope;
      // Define a new function template
      Local<FunctionTemplate> t = FunctionTemplate::New(New);
      
      // Set up function relationships for the template
      t->Inherit(EventEmitter::constructor_template);
      t->InstanceTemplate()->SetInternalFieldCount(1);
      
      // Map up functions to the object visible to Node
      NODE_SET_PROTOTYPE_METHOD(t, "serialize", BSONSerialize);
      NODE_SET_PROTOTYPE_METHOD(t, "deserialize", BSONDeserialize);
      
      // Create a V8 Class with attached methods from FunctionTemplate
      target->Set(String::NewSymbol("BSON"), t->GetFunction());
    }
    
  protected:
    // Basic constructor and destructor (not doing anything special since we are using static
    // methods for the actual calls)
    BSON() : EventEmitter() {}
    ~BSON() {}
    
    // Create a new instance of BSON and assing it the existing context
    static Handle<Value> New(const Arguments &args) {
      HandleScope scope;
      
      BSON *bson = new BSON();
      bson->Wrap(args.This());
      return args.This();
    }
    
    static Handle<Value> BSONSerialize(const Arguments &args) {
      const char* value = "BSONSerialize::Hello world!";
      return String::New(value);
    }
    
    static Handle<Value> BSONDeserialize(const Arguments &args) {
      // Ensure that we have an parameter
      if(args.Length() != 1) return VException("One argument required - buffer1.");
      // Throw an exception if the argument is not of type Buffer
      if(!Buffer::HasInstance(args[0])) return VException("Argument must be a Buffer.");
      
      // Get a pointer to the data passed in
      Buffer *buffer = ObjectWrap::Unwrap<Buffer>(args[0]->ToObject());
      char *data = buffer->data();
      uint32_t length = buffer->length();
      // Deserialize the content
      BSON::deserialize(data, length, NULL);
      
      
      // Let's process
      // for(int index = 0; index < length;) {
        // Split off the first 4 bites
        // char string_size_str[4];
        // strncpy(*(data + 4), string_size_str, 4);


        // printf("=========================== %h", string_size_str);
        // uint32_t string_length = BSON::deserialize_int(data, index);
        // printf("=========================== size %d\n", value);
        
        
        // index = index + 4;
      // }
      
      
      return String::New(data);
    }
    
    // Deserialize the stream
    static Handle<Value> deserialize(char *data, uint32_t length, bool is_array_item) {
      // The current index in the char data
      uint32_t index = 0;
      // Decode the size of the BSON data structure
      uint32_t size = BSON::deserialize_int32(data, index);
      // Adjust the index to point to next piece
      index = index + 4;      
      // While we have data left let's decode
      while(index < length) {
        // Read the first to bytes to indicate the type of object we are decoding
        uint16_t type = BSON::deserialize_int8(data, index);
        // Handles the internal size of the object
        uint32_t insert_index = 0;
        // Adjust index to skip type byte
        index = index + 1;
        
        if(type == BSON_DATA_STRING) {
          // Read the null terminated index String
          char *string_name = BSON::extract_string(data, index);
          if(string_name == NULL) return VException("Invalid C String found.");
          // Let's create a new string
          index = index + strlen(string_name) + 1;
          // Need to handle arrays here
                    
          // Read the length of the string (next 4 bytes)
          uint32_t string_size = BSON::deserialize_int32(data, index);
          // Adjust index to point to start of string
          index = index + 4;
          // Decode the string and add zero terminating value at the end of the string
          char *value = (char *)malloc((string_size * sizeof(char)) + 1);
          strncpy(value, (data + index), string_size);
          *(value + string_size) = '\0';          
          // Adjust the index for the size of the string
          index = index + string_size;
          
          // Print out values
          printf("-- C:: ==== string_name: %s\n", string_name);
          printf("-- C:: ==== string_value: %s\n", value);
          
        }
      }
    }
    
    // Search for 0 terminated C string and return the string
    static char* extract_string(char *data, uint32_t offset) {
      char *prt = strchr((data + offset), '\0');
      if(prt == NULL) return NULL;
      // Figure out the length of the string
      uint32_t length = (prt - data) - offset;      
      // Allocate memory for the new string
      char *string_name = (char *)malloc((length * sizeof(char)) + 1);
      // Copy the variable into the string_name
      strncpy(string_name, (data + offset), length);
      // Ensure the string is null terminated
      *(string_name + length) = '\0';
      // Return the unpacked string
      return string_name;
    }
    
    // Decode a byte
    static uint16_t deserialize_int8(char *data, uint32_t offset) {
      uint16_t value = 0;
      value |= *(data + offset + 0);              
      return value;
    }
    
    // Requires a 4 byte char array
    static uint32_t deserialize_int32(char* data, uint32_t offset) {
      uint32_t value = 0;
      value |= *(data + offset + 0);        
      value |= *(data + offset + 1) << 8;
      value |= *(data + offset + 2) << 16;
      value |= *(data + offset + 3) << 24;
      return value;
    }
};

// Exporting function
extern "C" void init(Handle<Object> target) {
  HandleScope scope;
  BSON::Initialize(target);
}
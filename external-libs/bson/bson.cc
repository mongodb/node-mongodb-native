#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <v8.h>
#include <node.h>
#include <node_events.h>
#include <node_buffer.h>
#include <cstring>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>

#include "bson.h"
#include "long.h"
#include "objectid.h"
#include "binary.h"
#include "code.h"

using namespace v8;
using namespace node;

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
  };

void BSON::Initialize(v8::Handle<v8::Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("BSON"));
  
  // Class methods
  NODE_SET_METHOD(constructor_template->GetFunction(), "serialize", BSONSerialize);  
  NODE_SET_METHOD(constructor_template->GetFunction(), "deserialize", BSONDeserialize);  

  target->Set(String::NewSymbol("BSON"), constructor_template->GetFunction());
}

// Create a new instance of BSON and assing it the existing context
Handle<Value> BSON::New(const Arguments &args) {
  HandleScope scope;
  
  BSON *bson = new BSON();
  bson->Wrap(args.This());
  return args.This();
}

Handle<Value> BSON::BSONSerialize(const Arguments &args) {
  const char* value = "BSONSerialize::Hello world!";
  
  if(args.Length() != 1 && args[0]->IsObject()) return VException("One argument required - object");

  // Calculate the total size of the document in binary form to ensure we only allocate memory once
  uint32_t object_size = BSON::calculate_object_size(args[0]);
  // Allocate the memory needed for the serializtion
  char *serialized_object = (char *)malloc(object_size * sizeof(char));
  *(serialized_object + object_size) = '\0';
  
  
  printf("=================== object_size: %d\n", object_size);
  
  // Serialize the object
  BSON::serialize(serialized_object, 0, String::New(""), args[0]);  
  // Encode the binary value
  Local<Value> bin_value = Encode(serialized_object, object_size, BINARY);  
  // Return the serialized content
  return bin_value;
}

void BSON::write_uint32(char *data, uint32_t value) {
  // Write the int to the char*
  memcpy(data, &value, 4);  
}

uint32_t BSON::serialize(char *serialized_object, uint32_t index, Handle<Value> name, Handle<Value> value) {
  printf("============================================= serialized::::\n");
  
  // If we have an object let's serialize it  
  if(value->IsObject()) {
    printf("============================================= -- serialized::::object\n");    
    // Unwrap the object
    Local<Object> object = value->ToObject();
    Local<Array> property_names = object->GetPropertyNames();
    
    // Process all the properties on the object
    for(uint32_t index = 0; index < property_names->Length(); index++) {
      // Fetch the property name
      Local<String> property_name = property_names->Get(index)->ToString();
      // Fetch the object for the property
      Local<Value> property = object->Get(property_name);
      // Precalculate the index offset for data before the serialized value
      // uint32_t offset = index + 1 + property_name->Length() + 1 + 4;
      
      // Serialize the object and place the content in the index + 4 (4 first bytes is the size of bson object)
      uint32_t offset = BSON::serialize(serialized_object, index + 4, property_name, property);
      // Length is the last position - index + 1 since 0 is element 1
      uint32_t object_length = offset - index + 1;
      printf("================================= object_length: %d", object_length);
      // Write the integer to the char *
      BSON::write_uint32(serialized_object, object_length);
      
      // Get size of property (property + property name length + 1 for terminating 0)
      // object_size += BSON::calculate_object_size(property) + property_name->Length() + 1;
      // Add the bson header size
      // object_size += 1 + 4 + 1;
    }          
  } else if(value->IsString()) {
    // // Let's fetch the encoding
    // enum encoding enc = ParseEncoding(args[1]);
    // // The length of the data for this encoding
    // ssize_t len = DecodeBytes(args[0], enc);
    // // Let's define the buffer size
    // data = new char[len];
    // // Write the data to the buffer from the string object
    // ssize_t written = DecodeWrite(data, len, args[0], BINARY);    
    
    uint32_t i = index;
    
    printf("============================================= -- serialized::::string\n");    
    // Save the string at the offset provided
    *(serialized_object + index) = BSON_DATA_STRING;
    // Adjust writing position for the first byte
    index = index + 1;
    // Convert name to char*
    ssize_t len = DecodeBytes(name, BINARY);
    ssize_t written = DecodeWrite((serialized_object + index), len, name, BINARY);
    // Add null termiation for the string
    *(serialized_object + index + len) = '\0';    
    // Adjust the index
    index = index + len + 1;
    
    // Write the actual string into the char array
    Local<String> str = value->ToString();
    // Let's fetch the int value
    uint32_t string_length = str->Length() + 1;
    // Write the integer to the char *
    BSON::write_uint32((serialized_object + index), string_length);
    // Adjust the index
    index = index + 4;
    // Write the string to the file
    len = DecodeBytes(str, BINARY);
    written = DecodeWrite((serialized_object + index), len, str, BINARY);
    // Add the null termination
    *(serialized_object + index + len + 1) = '\0';    
    // Adjust the index
    index = index + len + 1;
  }
  
  return index;
}

uint32_t BSON::calculate_object_size(Handle<Value> value) {
  uint32_t object_size = 0;
  printf("================================ ----------- calculate_object_size\n");
  

  // If we have an object let's unwrap it and calculate the sub sections
  if(value->IsObject()) {
    printf("================================ calculate_object_size:object\n");
    // Unwrap the object
    Local<Object> object = value->ToObject();
    Local<Array> property_names = object->GetPropertyNames();
    
    // Process all the properties on the object
    for(uint32_t index = 0; index < property_names->Length(); index++) {
      // Fetch the property name
      Local<String> property_name = property_names->Get(index)->ToString();
      // Fetch the object for the property
      Local<Value> property = object->Get(property_name);
      // Get size of property (property + property name length + 1 for terminating 0)
      object_size += BSON::calculate_object_size(property) + property_name->Length() + 1;
      // Add the bson header size
      object_size += 1 + 4 + 1;
    }      
  } else if(value->IsString()) {
    printf("================================ calculate_object_size:string\n");
    Local<String> str = value->ToString();
    // Let's calculate the size the string adds, length + type(1 byte) + size(4 bytes)
    object_size += str->Length() + 1 + 4;  
  }

  return object_size;
}

Handle<Value> BSON::BSONDeserialize(const Arguments &args) {
   HandleScope scope;
  // Ensure that we have an parameter
  if(Buffer::HasInstance(args[0]) && args.Length() > 1) return VException("One argument required - buffer1.");
  if(args[0]->IsString() && args.Length() != 2) return VException("Two argument required - string and encoding.");
  // Throw an exception if the argument is not of type Buffer
  if(!Buffer::HasInstance(args[0]) && !args[0]->IsString()) return VException("Argument must be a Buffer or String.");
  
  // Define pointer to data
  char *data;
  uint32_t length;      
  
  // If we passed in a buffer, let's unpack it, otherwise let's unpack the string
  if(Buffer::HasInstance(args[0])) {
    Buffer *buffer = ObjectWrap::Unwrap<Buffer>(args[0]->ToObject());
    data = buffer->data();        
    uint32_t length = buffer->length();
  } else {
    // Let's fetch the encoding
    enum encoding enc = ParseEncoding(args[1]);
    // The length of the data for this encoding
    ssize_t len = DecodeBytes(args[0], enc);
    // Let's define the buffer size
    data = new char[len];
    // Write the data to the buffer from the string object
    ssize_t written = DecodeWrite(data, len, args[0], BINARY);
    // Assert that we wrote the same number of bytes as we have length
    assert(written == len);
  }
  
  // Deserialize the content
  return BSON::deserialize(data, NULL);
}

// Deserialize the stream
Handle<Value> BSON::deserialize(char *data, bool is_array_item) {
  HandleScope scope;
  // Holds references to the objects that are going to be returned
  Local<Object> return_data = Object::New();
  Local<Array> return_array = Array::New();      
  // The current index in the char data
  uint32_t index = 0;
  // Decode the size of the BSON data structure
  uint32_t size = BSON::deserialize_int32(data, index);
  // printf("C:: ============================ BSON:SIZE:%d\n", size);            
  // Adjust the index to point to next piece
  index = index + 4;      

  // for(int n = 0; n < size; n++) {
  //   printf("C:: ============ %02x\n",(unsigned char)data[n]);
  // }
  
  // for(int n = 0; s_value[n] != '\0'; n++) {
  //   printf("C:: ============ %02x\n",(unsigned char)s_value[n]);                      
  // }
  
  // While we have data left let's decode
  while(index < size) {
    // Read the first to bytes to indicate the type of object we are decoding
    uint16_t type = BSON::deserialize_int8(data, index);
    // printf("C:: ============================ BSON:TYPE:%d\n", type);
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
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      
      
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
      // Add the value to the data
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), String::New(value));        
      } else {
        return_data->Set(String::New(string_name), String::New(value));
      }
      
      // Free up the memory
      free(value);
    } else if(type == BSON_DATA_INT) {
      // printf("===================================== decoding int\n");      
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      
      
      // Decode the integer value
      uint32_t value = 0;
      memcpy(&value, (data + index), 4);
      // Adjust the index for the size of the value
      index = index + 4;
      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), Integer::New(value));
      } else {
        return_data->Set(String::New(string_name), Integer::New(value));
      }          
    } else if(type == BSON_DATA_LONG) {
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      
      
      // Decode the integer value
      int64_t value = 0;
      memcpy(&value, (data + index), 8);      
      // Adjust the index for the size of the value
      index = index + 8;
            
      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), BSON::decodeLong(value));
      } else {
        return_data->Set(String::New(string_name), BSON::decodeLong(value));
      }
    } else if(type == BSON_DATA_NUMBER) {
      // printf("===================================== decoding float/double\n");      
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      
      
      // Decode the integer value
      double value = 0;
      memcpy(&value, (data + index), 8);      
      // Adjust the index for the size of the value
      index = index + 8;
      
      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), Number::New(value));
      } else {
        return_data->Set(String::New(string_name), Number::New(value));
      }
    } else if(type == BSON_DATA_NULL) {
      // printf("===================================== decoding float/double\n");      
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      
      
      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), Null());
      } else {
        return_data->Set(String::New(string_name), Null());
      }      
    } else if(type == BSON_DATA_BOOLEAN) {
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      

      // Decode the boolean value
      char bool_value = *(data + index);
      // Adjust the index for the size of the value
      index = index + 1;
      
      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), bool_value == 1 ? Boolean::New(true) : Boolean::New(false));
      } else {
        return_data->Set(String::New(string_name), bool_value == 1 ? Boolean::New(true) : Boolean::New(false));
      }            
    } else if(type == BSON_DATA_DATE) {
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      

      // Decode the value 64 bit integer
      int64_t value = 0;
      memcpy(&value, (data + index), 8);      
      // Adjust the index for the size of the value
      index = index + 8;
      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), Date::New((double)value));
      } else {
        return_data->Set(String::New(string_name), Date::New((double)value));
      }       
    } else if(type == BSON_DATA_REGEXP) {
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      

      // Length variable
      int32_t length_regexp = 0;
      char chr;

      // Locate end of the regexp expression \0
      while((chr = *(data + index + length_regexp)) != '\0') {
        length_regexp = length_regexp + 1;
      }
            
      // Contains the reg exp
      char *reg_exp = (char *)malloc(length_regexp * sizeof(char) + 1);
      // Copy the regexp from the data to the char *
      memcpy(reg_exp, (data + index), (length_regexp + 1));      
      // Adjust the index to skip the first part of the regular expression
      index = index + length_regexp + 1;
            
      // Reset the length
      int32_t options_length = 0;
      // Locate the end of the options for the regexp terminated with a '\0'
      while((chr = *(data + index + options_length)) != '\0') {
        options_length = options_length + 1;
      }

      // Contains the reg exp
      char *options = (char *)malloc(options_length * sizeof(char) + 1);
      // Copy the options from the data to the char *
      memcpy(options, (data + index), (options_length + 1));      
      // Adjust the index to skip the option part of the regular expression
      index = index + options_length + 1;      
      // ARRRRGH Google does not expose regular expressions through the v8 api
      // Have to use Script to instantiate the object (slower)

      // Generate the string for execution in the string context
      char *reg_exp_string = (char *)malloc((length_regexp + options_length)*sizeof(char) + 2 + 2);
      *(reg_exp_string) = '\0';
      strncat(reg_exp_string, "/", 1);      
      strncat(reg_exp_string, reg_exp, length_regexp);      
      strncat(reg_exp_string, "/", 1);      
      strncat(reg_exp_string, options, options_length);

      // Execute script creating a regular expression object
      Local<Script> script = Script::New(String::New(reg_exp_string), String::New("bson.<anonymous>"));
      Handle<Value> result = script->Run();

      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), result);
      } else {
        return_data->Set(String::New(string_name), result);
      }  
      
      // Free memory
      free(reg_exp);          
      free(options);          
      free(reg_exp_string);          
    } else if(type == BSON_DATA_OID) {
      // printf("=================================================== unpacking oid\n");
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      
      
      // Allocate storage for a 24 character hex oid    
      char *oid_string = (char *)malloc(12 * 2 * sizeof(char) + 1);
      char *pbuffer = oid_string;      
      // Terminate the string
      *(pbuffer + 25) = '\0';      
      // Unpack the oid in hex form
      for(int32_t i = 0; i < 12; i++) {
        sprintf(pbuffer, "%02x", (unsigned char)*(data + index + i));
        pbuffer += 2;
      }      

      // Adjust the index
      index = index + 12;

      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), BSON::decodeOid(oid_string));
      } else {
        return_data->Set(String::New(string_name), BSON::decodeOid(oid_string));
      }     
      // Free memory
      free(oid_string);                       
    } else if(type == BSON_DATA_BINARY) {
      // printf("=================================================== unpacking binary\n");
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      
      
      // Total number of bytes after array index
      uint32_t total_number_of_bytes = BSON::deserialize_int32(data, index);
      // Adjust the index
      index = index + 4;
      // Decode the subtype
      uint32_t sub_type = (int)*(data + index);
      // Adjust the index
      index = index + 1;
      // Read the binary data size
      uint32_t number_of_bytes = BSON::deserialize_int32(data, index);
      // Adjust the index
      index = index + 4;
      // Copy the binary data into a buffer
      char *buffer = (char *)malloc(number_of_bytes * sizeof(char) + 1);
      memcpy(buffer, (data + index), number_of_bytes);
      *(buffer + number_of_bytes) = '\0';
      
      // // Allocate buffer object with space
      // Local<Buffer> buffer_obj = Buffer::New(number_of_bytes);
      // // Write content to buffer
      // buffer_obj->blob().length = 1;
            
      // Adjust the index
      index = index + number_of_bytes;

      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), BSON::decodeBinary(sub_type, number_of_bytes, buffer));
      } else {
        return_data->Set(String::New(string_name), BSON::decodeBinary(sub_type, number_of_bytes, buffer));
      }
      // Free memory
      free(buffer);                             
    } else if(type == BSON_DATA_CODE_W_SCOPE) {
      // printf("=================================================== unpacking code\n");
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      
      
      // Total number of bytes after array index
      uint32_t total_code_size = BSON::deserialize_int32(data, index);
      // Adjust the index
      index = index + 4;
      // Read the string size
      uint32_t string_size = BSON::deserialize_int32(data, index);
      // Adjust the index
      index = index + 4;
      // Read the string
      char *code = (char *)malloc(string_size * sizeof(char) + 1);
      // Copy string + terminating 0
      memcpy(code, (data + index), string_size);
      // Adjust the index
      index = index + string_size;      
      // Get the scope object (bson object)
      uint32_t bson_object_size = total_code_size - string_size - 8;
      // Allocate bson object buffer and copy out the content
      char *bson_buffer = (char *)malloc(bson_object_size * sizeof(char));
      memcpy(bson_buffer, (data + index), bson_object_size);
      // Adjust the index
      index = index + bson_object_size;
      // Parse the bson object
      Handle<Value> scope_object = BSON::deserialize(bson_buffer, false);
      // Define the try catch block
      TryCatch try_catch;                
      // Decode the code object
      Handle<Value> obj = BSON::decodeCode(code, scope_object);
      // If an error was thrown push it up the chain
      if(try_catch.HasCaught()) {
        // Clean up memory allocation
        free(bson_buffer);
        // Rethrow exception
        return try_catch.ReThrow();
      }

      // Add the element to the object
      if(is_array_item) {        
        return_array->Set(Number::New(insert_index), obj);
      } else {
        return_data->Set(String::New(string_name), obj);
      }      
      // Clean up memory allocation
      free(bson_buffer);      
    } else if(type == BSON_DATA_OBJECT) {
      // printf("=================================================== unpacking object\n");
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      

      // Get the object size
      uint32_t bson_object_size = BSON::deserialize_int32(data, index);
      // Allocate bson object buffer and copy out the content
      char *bson_buffer = (char *)malloc(bson_object_size * sizeof(char));
      memcpy(bson_buffer, (data + index), bson_object_size);
      // Adjust the index
      index = index + bson_object_size;
      // Define the try catch block
      TryCatch try_catch;                
      // Decode the code object
      Handle<Value> obj = BSON::deserialize(bson_buffer, false);
      // If an error was thrown push it up the chain
      if(try_catch.HasCaught()) {
        // Clean up memory allocation
        free(bson_buffer);
        // Rethrow exception
        return try_catch.ReThrow();
      }
      
      // Add the element to the object
      if(is_array_item) {        
        return_array->Set(Number::New(insert_index), obj);
      } else {
        return_data->Set(String::New(string_name), obj);
      }
      // Clean up memory allocation
      free(bson_buffer);
    } else if(type == BSON_DATA_ARRAY) {
      // printf("=================================================== unpacking array\n");
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Handle array value if applicable
      uint32_t insert_index = 0;
      if(is_array_item) {
        insert_index = atoi(string_name);
      }      
      
      // Get the array size
      uint32_t array_size = BSON::deserialize_int32(data, index);
      // Let's split off the data and parse all elements (keeping in mind the elements)
      char *array_buffer = (char *)malloc(array_size * sizeof(char));
      memcpy(array_buffer, (data + index), array_size);
      // Define the try catch block
      TryCatch try_catch;                
      // Decode the code object
      Handle<Value> obj = BSON::deserialize(array_buffer, true);
      // If an error was thrown push it up the chain
      if(try_catch.HasCaught()) {
        // Clean up memory allocation
        free(array_buffer);
        // Rethrow exception
        return try_catch.ReThrow();
      }
      // Adjust the index for the next value
      index = index + array_size;
      // Add the element to the object
      if(is_array_item) {        
        return_array->Set(Number::New(insert_index), obj);
      } else {
        return_data->Set(String::New(string_name), obj);
      }      
      // Clean up memory allocation
      free(array_buffer);
    }
  }

  // Return the data object to javascript
  if(is_array_item) {
    return scope.Close(return_array);
  } else {
    return scope.Close(return_data);
  }
}

const char* BSON::ToCString(const v8::String::Utf8Value& value) {
  return *value ? *value : "<string conversion failed>";
}

Handle<Value> BSON::decodeCode(char *code, Handle<Value> scope_object) {
  HandleScope scope;
  
  Local<Value> argv[] = {String::New(code), scope_object->ToObject()};
  Handle<Value> code_obj = Code::constructor_template->GetFunction()->NewInstance(2, argv);
  return scope.Close(code_obj);
}

Handle<Value> BSON::decodeBinary(uint32_t sub_type, uint32_t number_of_bytes, char *data) {
  HandleScope scope;

  Local<String> str = Encode(data, number_of_bytes, BINARY)->ToString();
  Local<Value> argv[] = {Integer::New(sub_type), str};
  Handle<Value> binary_obj = Binary::constructor_template->GetFunction()->NewInstance(2, argv);
  return scope.Close(binary_obj);
}

Handle<Value> BSON::decodeOid(char *oid) {
  HandleScope scope;
  
  Local<Value> argv[] = {String::New(oid)};
  Handle<Value> oid_obj = ObjectID::constructor_template->GetFunction()->NewInstance(1, argv);
  return scope.Close(oid_obj);
}

Handle<Value> BSON::decodeLong(int64_t value) {
  HandleScope scope;
  
  Local<Value> argv[] = {Number::New(value)};
  Handle<Value> long_obj = Long::constructor_template->GetFunction()->NewInstance(1, argv);    
  return scope.Close(long_obj);      
}


// Search for 0 terminated C string and return the string
char* BSON::extract_string(char *data, uint32_t offset) {
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

// Decode a signed byte
int BSON::deserialize_sint8(char *data, uint32_t offset) {
  return (signed char)(*(data + offset));
}

int BSON::deserialize_sint16(char *data, uint32_t offset) {
  return BSON::deserialize_sint8(data, offset) + (BSON::deserialize_sint8(data, offset + 1) << 8);
}

long BSON::deserialize_sint32(char *data, uint32_t offset) {
  return (long)BSON::deserialize_sint8(data, offset) + (BSON::deserialize_sint8(data, offset + 1) << 8) +
    (BSON::deserialize_sint8(data, offset + 2) << 16) + (BSON::deserialize_sint8(data, offset + 3) << 24);
}

// Decode a byte
uint16_t BSON::deserialize_int8(char *data, uint32_t offset) {
  uint16_t value = 0;
  value |= *(data + offset + 0);              
  return value;
}

// Requires a 4 byte char array
uint32_t BSON::deserialize_int32(char* data, uint32_t offset) {
  uint32_t value = 0;
  memcpy(&value, (data + offset), 4);
  return value;
}

// Exporting function
extern "C" void init(Handle<Object> target) {
  HandleScope scope;
  BSON::Initialize(target);
  Long::Initialize(target);
  ObjectID::Initialize(target);
  Binary::Initialize(target);
  Code::Initialize(target);
}

// NODE_MODULE(bson, BSON::Initialize);
// NODE_MODULE(l, Long::Initialize);
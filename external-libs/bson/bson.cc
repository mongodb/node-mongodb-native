#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <v8.h>
#include <node.h>
#include <node_version.h>
#include <node_buffer.h>
#include <cstring>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <vector>

#include "bson.h"

using namespace v8;
using namespace node;
using namespace std;

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
const uint32_t BSON_DATA_CODE = 13;
const uint32_t BSON_DATA_SYMBOL = 14;
const uint32_t BSON_DATA_CODE_W_SCOPE = 15;
const uint32_t BSON_DATA_INT = 16;
const uint32_t BSON_DATA_TIMESTAMP = 17;
const uint32_t BSON_DATA_LONG = 18;
const uint32_t BSON_DATA_MIN_KEY = 0xff;
const uint32_t BSON_DATA_MAX_KEY = 0x7f;

const int32_t BSON_INT32_MAX = (int32_t)2147483647L;
const int32_t BSON_INT32_MIN = (int32_t)(-1) * 2147483648L;

static Handle<Value> VException(const char *msg) {
    HandleScope scope;
    return ThrowException(Exception::Error(String::New(msg)));
  };

Persistent<FunctionTemplate> BSON::constructor_template;

void BSON::Initialize(v8::Handle<v8::Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("BSON"));
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "calculateObjectSize", CalculateObjectSize);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "serialize", BSONSerialize);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "serializeWithBufferAndIndex", SerializeWithBufferAndIndex);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "deserialize", BSONDeserialize);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "deserializeStream", BSONDeserializeStream);

  // Experimental
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "calculateObjectSize2", CalculateObjectSize2);
  //   NODE_SET_METHOD(constructor_template->GetFunction(), "serialize2", BSONSerialize2);  

  target->ForceSet(String::NewSymbol("BSON"), constructor_template->GetFunction());
}

// Create a new instance of BSON and assing it the existing context
Handle<Value> BSON::New(const Arguments &args) {
  HandleScope scope;
  
  // Check that we have an array
  if(args.Length() == 1 && args[0]->IsArray()) {
    // Cast the array to a local reference
    Local<Array> array = Local<Array>::Cast(args[0]);
    
    if(array->Length() > 0) {
      // Create a bson object instance and return it
      BSON *bson = new BSON();

      // Setup pre-allocated comparision objects
      bson->_bsontypeString = Persistent<String>::New(String::New("_bsontype"));
      bson->_longLowString = Persistent<String>::New(String::New("low_"));
      bson->_longHighString = Persistent<String>::New(String::New("high_"));
      bson->_objectIDidString = Persistent<String>::New(String::New("id"));
      bson->_binaryPositionString = Persistent<String>::New(String::New("position"));
      bson->_binarySubTypeString = Persistent<String>::New(String::New("sub_type"));
      bson->_binaryBufferString = Persistent<String>::New(String::New("buffer"));
      bson->_doubleValueString = Persistent<String>::New(String::New("value"));
      bson->_symbolValueString = Persistent<String>::New(String::New("value"));
      bson->_dbRefRefString = Persistent<String>::New(String::New("$ref"));
      bson->_dbRefIdRefString = Persistent<String>::New(String::New("$id"));
      bson->_dbRefDbRefString = Persistent<String>::New(String::New("$db"));
      bson->_dbRefNamespaceString = Persistent<String>::New(String::New("namespace"));
      bson->_dbRefDbString = Persistent<String>::New(String::New("db"));
      bson->_dbRefOidString = Persistent<String>::New(String::New("oid"));

      // total number of found classes
      uint32_t numberOfClasses = 0;
      
      // Iterate over all entries to save the instantiate funtions
      for(uint32_t i = 0; i < array->Length(); i++) {
        // Let's get a reference to the function
        Local<Function> func = Local<Function>::Cast(array->Get(i));
        Local<String> functionName = func->GetName()->ToString();
            
        // Save the functions making them persistant handles (they don't get collected)
        if(functionName->StrictEquals(String::New("Long"))) {
          bson->longConstructor = Persistent<Function>::New(func);
          bson->longString = Persistent<String>::New(String::New("Long"));
          numberOfClasses = numberOfClasses + 1;
        } else if(functionName->StrictEquals(String::New("ObjectID"))) {
          bson->objectIDConstructor = Persistent<Function>::New(func);
          bson->objectIDString = Persistent<String>::New(String::New("ObjectID"));
          numberOfClasses = numberOfClasses + 1;
        } else if(functionName->StrictEquals(String::New("Binary"))) {
          bson->binaryConstructor = Persistent<Function>::New(func);
          bson->binaryString = Persistent<String>::New(String::New("Binary"));
          numberOfClasses = numberOfClasses + 1;
        } else if(functionName->StrictEquals(String::New("Code"))) {
          bson->codeConstructor = Persistent<Function>::New(func);
          bson->codeString = Persistent<String>::New(String::New("Code"));
          numberOfClasses = numberOfClasses + 1;
        } else if(functionName->StrictEquals(String::New("DBRef"))) {
          bson->dbrefConstructor = Persistent<Function>::New(func);
          bson->dbrefString = Persistent<String>::New(String::New("DBRef"));
          numberOfClasses = numberOfClasses + 1;
        } else if(functionName->StrictEquals(String::New("Symbol"))) {
          bson->symbolConstructor = Persistent<Function>::New(func);
          bson->symbolString = Persistent<String>::New(String::New("Symbol"));
          numberOfClasses = numberOfClasses + 1;
        } else if(functionName->StrictEquals(String::New("Double"))) {
          bson->doubleConstructor = Persistent<Function>::New(func);
          bson->doubleString = Persistent<String>::New(String::New("Double"));
          numberOfClasses = numberOfClasses + 1;
        } else if(functionName->StrictEquals(String::New("Timestamp"))) {
          bson->timestampConstructor = Persistent<Function>::New(func);
          bson->timestampString = Persistent<String>::New(String::New("Timestamp"));
          numberOfClasses = numberOfClasses + 1;
        } else if(functionName->StrictEquals(String::New("MinKey"))) {
          bson->minKeyConstructor = Persistent<Function>::New(func);
          bson->minKeyString = Persistent<String>::New(String::New("MinKey"));
          numberOfClasses = numberOfClasses + 1;
        } else if(functionName->StrictEquals(String::New("MaxKey"))) {
          bson->maxKeyConstructor = Persistent<Function>::New(func);
          bson->maxKeyString = Persistent<String>::New(String::New("MaxKey"));
          numberOfClasses = numberOfClasses + 1;
        }
      }
      
      // Check if we have the right number of constructors otherwise throw an error
      if(numberOfClasses != 10) {
        // Destroy object
        delete(bson);
        // Fire exception
        return VException("Missing function constructor for either [Long/ObjectID/Binary/Code/DbRef/Symbol/Double/Timestamp/MinKey/MaxKey]");
      } else {
        bson->Wrap(args.This());
        return args.This();                  
      }
    } else {
      return VException("No types passed in");
    }    
  } else {
    return VException("Argument passed in must be an array of types");
  }  
}

void BSON::write_int32(char *data, uint32_t value) {
  // Write the int to the char*
  memcpy(data, &value, 4);  
}

void BSON::write_double(char *data, double value) {
  // Write the double to the char*
  memcpy(data, &value, 8);    
}

void BSON::write_int64(char *data, int64_t value) {
  // Write the int to the char*
  memcpy(data, &value, 8);      
}

char *BSON::check_key(Local<String> key) {
  // Allocate space for they key string
  char *key_str = (char *)malloc(key->Utf8Length() * sizeof(char) + 1);
  // Error string
  char *error_str = (char *)malloc(256 * sizeof(char));
  // Decode the key
  ssize_t len = DecodeBytes(key, BINARY);
  ssize_t written = DecodeWrite(key_str, len, key, BINARY);
  *(key_str + key->Utf8Length()) = '\0';
  // Check if we have a valid key
  if(key->Utf8Length() > 0 && *(key_str) == '$') {
    // Create the string
    sprintf(error_str, "key %s must not start with '$'", key_str);
    // Free up memory
    free(key_str);
    // Throw exception with string
    throw error_str;
  } else if(key->Utf8Length() > 0 && strchr(key_str, '.') != NULL) {
    // Create the string
    sprintf(error_str, "key %s must not contain '.'", key_str);
    // Free up memory
    free(key_str);
    // Throw exception with string
    throw error_str;
  }
  // Free allocated space
  free(key_str);
  free(error_str);
  // Return No check key error
  return NULL;
}

const char* BSON::ToCString(const v8::String::Utf8Value& value) {
  return *value ? *value : "<string conversion failed>";
}

Handle<Value> BSON::decodeDBref(BSON *bson, Local<Value> ref, Local<Value> oid, Local<Value> db) {
  HandleScope scope;
  Local<Value> argv[] = {ref, oid, db};
  Handle<Value> dbrefObj = bson->dbrefConstructor->NewInstance(3, argv);    
  return scope.Close(dbrefObj);
}

Handle<Value> BSON::decodeCode(BSON *bson, char *code, Handle<Value> scope_object) {
  HandleScope scope;
  
  Local<Value> argv[] = {String::New(code), scope_object->ToObject()};
  Handle<Value> codeObj = bson->codeConstructor->NewInstance(2, argv);
  return scope.Close(codeObj);
}

Handle<Value> BSON::decodeBinary(BSON *bson, uint32_t sub_type, uint32_t number_of_bytes, char *data) {
  HandleScope scope;
  
  // Create a buffer object that wraps the raw stream
  Buffer *bufferObj = Buffer::New(data, number_of_bytes);
  // Arguments to be passed to create the binary
  Handle<Value> argv[] = {bufferObj->handle_, Uint32::New(sub_type)};
  // Return the buffer handle
  Local<Object> bufferObjHandle = bson->binaryConstructor->NewInstance(2, argv);
  // Close the scope
  return scope.Close(bufferObjHandle);
}

Handle<Value> BSON::decodeOid(BSON *bson, char *oid) {
  HandleScope scope;

  // Encode the string (string - null termiating character)
  Local<Value> bin_value = Encode(oid, 12, BINARY)->ToString();

  // Return the id object
  Local<Value> argv[] = {bin_value};
  Local<Object> oidObj = bson->objectIDConstructor->NewInstance(1, argv);
  return scope.Close(oidObj);
}

Handle<Value> BSON::decodeLong(BSON *bson, char *data, uint32_t index) {
  HandleScope scope;
  
  // Decode the integer value
  int32_t lowBits = 0;
  int32_t highBits = 0;
  memcpy(&lowBits, (data + index), 4);        
  memcpy(&highBits, (data + index + 4), 4);        
  
  // Decode 64bit value
  int64_t value = 0;
  memcpy(&value, (data + index), 8);        

  // If value is < 2^53 and >-2^53
  if((highBits < 0x200000 || (highBits == 0x200000 && lowBits == 0)) && highBits >= -0x200000) {
    int64_t finalValue = 0;
    memcpy(&finalValue, (data + index), 8);        
    return scope.Close(Number::New(finalValue));
  }

  // Instantiate the js object and pass it back
  Local<Value> argv[] = {Int32::New(lowBits), Int32::New(highBits)};
  Local<Object> longObject = bson->longConstructor->NewInstance(2, argv);
  return scope.Close(longObject);      
}

Handle<Value> BSON::decodeTimestamp(BSON *bson, char *data, uint32_t index) {
  HandleScope scope;
  
  // Decode the integer value
  int32_t lowBits = 0;
  int32_t highBits = 0;
  memcpy(&lowBits, (data + index), 4);        
  memcpy(&highBits, (data + index + 4), 4);        

  // Build timestamp
  Local<Value> argv[] = {Int32::New(lowBits), Int32::New(highBits)};
  Handle<Value> timestamp_obj = bson->timestampConstructor->NewInstance(2, argv);
  return scope.Close(timestamp_obj);      
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

//------------------------------------------------------------------------------------------------
//
// Experimental
//
//------------------------------------------------------------------------------------------------
Handle<Value> BSON::CalculateObjectSize2(const Arguments &args) {
  HandleScope scope;
  // Ensure we have a valid object
  if(args.Length() == 1 && !args[0]->IsObject()) return VException("One argument required - [object]");
  if(args.Length() > 1) return VException("One argument required - [object]");  
  // Calculate size of the object
  uint32_t object_size = BSON::calculate_object_size2(args[0]);
  // Return the object size
  return scope.Close(Uint32::New(object_size));
}

uint32_t BSON::calculate_object_size2(Handle<Value> value) {
  // Final object size
  uint32_t object_size = (4 + 1);
  uint32_t stackIndex = 0;
  // Controls the flow
  bool done = false;
  bool finished = false;
  bool isObject = false;

  // Define a local vector that keeps the stack
  // vector<vector<Local<Value> > > stack;// = new vector<vector<Local<Value> > >(0);
  
  // My own stack max of 1024 objects deep
  Local<Object> *stack[2048];
  
  // Current object we are processing
  Local<Object> currentObject = value->ToObject();
  // Current list of object keys
  #if NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION < 6
    Local<Array> keys = currentObject->GetPropertyNames();
  #else
    Local<Array> keys = currentObject->GetOwnPropertyNames();
  #endif
  // Contains pointer to keysIndex
  uint32_t keysIndex = 0;
  uint32_t keysLength = keys->Length();
    
  // printf("=================================================================================\n");      
  // printf("Start serializing\n");      
    
  while(!done) {
    // If the index is bigger than the number of keys for the object
    // we finished up the previous object and are ready for the next one
    if(keysIndex >= keys->Length()) {
      #if NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION < 6
        keys = currentObject->GetPropertyNames();
      #else
        keys = currentObject->GetOwnPropertyNames();
      #endif
      keysLength = keys->Length();
    }
    
    // Iterate over all the keys
    while(keysIndex < keysLength) {
      // Fetch the key name
      Local<String> name = keys->Get(keysIndex++)->ToString();
      // Fetch the object related to the key
      Local<Value> value = currentObject->Get(name);

      // If we have a string
      if(value->IsString()) {
        object_size += value->ToString()->Utf8Length() + 1 + 4;  
      } else if(value->IsNumber()) {
        // Check if we have a float value or a long value
        Local<Number> number = value->ToNumber();
        double d_number = number->NumberValue();
        int64_t l_number = number->IntegerValue();
        // Check if we have a double value and not a int64
        double d_result = d_number - l_number;    
        // If we have a value after subtracting the integer value we have a float
        if(d_result > 0 || d_result < 0) {
          object_size = name->Utf8Length() + 1 + object_size + 8 + 1;
        } else if(l_number <= BSON_INT32_MAX && l_number >= BSON_INT32_MIN) {
          object_size = name->Utf8Length() + 1 + object_size + 4 + 1;
        } else {
          object_size = name->Utf8Length() + 1 + object_size + 8 + 1;
        }
      }
      // } else if(isObject && DBRef::HasInstance(value)) {
      //   // printf("  = DbRef\n");
      //   // Unpack the dbref
      //   Local<Object> dbref = value->ToObject();
      //   // unpack dbref to get to the bin
      //   DBRef *db_ref_obj = DBRef::Unwrap<DBRef>(dbref);
      //   uint32_t dbRefSize = 0;
      //   
      //   // Add object header size + terminating 0
      //   dbRefSize += 4 + 1;
      //   
      //   // Calculate the $ref size
      //   dbRefSize += 1; //type
      //   dbRefSize += 4 + 1; //name
      //   dbRefSize += 4; // string length int32
      //   dbRefSize += strlen(db_ref_obj->ref); // length of string
      //   dbRefSize += 1; // termiating 0
      // 
      //   // Calculate the $db size
      //   if(db_ref_obj->db != NULL) {
      //     dbRefSize += 1; //type
      //     dbRefSize += 3 + 1; //name
      //     dbRefSize += 4; // string length int32
      //     dbRefSize += strlen(db_ref_obj->db); // length of string
      //     dbRefSize += 1; // termiating 0          
      //   }
      //   
      //   // Make an assumption it's an objectID for the test
      //   if(db_ref_obj->oid->IsObject() && ObjectID::HasInstance(db_ref_obj->oid)) {
      //     dbRefSize += 1; //type
      //     dbRefSize += 3 + 1; //name
      //     dbRefSize += 12;
      //   }
      //   
      //   // Add the object size to the total
      //   object_size = name->Utf8Length() + 1 + object_size +  dbRefSize + 1;
      // } else if(isObject && ObjectID::HasInstance(value)) {
      //   // printf("  = ObjectID\n");
      //   object_size = name->Utf8Length() + 1 + object_size + 12 + 1;
      // } else if(isObject && Binary::HasInstance(value)) {
      //   // printf("  = Binary\n");
      //   // Unpack the object and encode
      //   Local<Object> obj = value->ToObject();
      //   Binary *binary_obj = Binary::Unwrap<Binary>(obj);
      //   // Adjust the object_size, binary content lengt + total size int32 + binary size int32 + subtype
      //   object_size = name->Utf8Length() + 1 + object_size + binary_obj->index + 4 + 1 + 1;
      // } else if(isObject && Code::HasInstance(value)) {
      //   // printf("  = Code\n");        
      //   // Unpack the dbref
      //   Local<Object> code = value->ToObject();
      //   // unpack dbref to get to the bin
      //   Code *code_ref_obj = Code::Unwrap<Code>(code);        
      //   // Calculate the code size
      //   object_size = name->Utf8Length() + 1 + object_size + strlen(code_ref_obj->code) + 4 + 1 + 1;
      // }
      // printf("======================================================================== 1\n");      
    }

    // printf("======================================================================== 2\n");      
    
    // If we have finished all the keys
    if(keysIndex == keysLength) {
      finished = false;
    }
    
    // Validate the stack
    if(stackIndex == 0) {
      // printf("======================================================================== 3\n");      
      done = true;
    } else if(finished || keysIndex == keysLength) {
      // Pop off the stack
      stackIndex = stackIndex - 1;
      // Fetch the current object stack
      // vector<Local<Value> > currentObjectStored = stack.back();
      // stack.pop_back();
      // // Unroll the current object
      // currentObject = currentObjectStored.back()->ToObject();
      // currentObjectStored.pop_back();
      // // Unroll the keysIndex
      // keys = Local<Array>::Cast(currentObjectStored.back()->ToObject());
      // currentObjectStored.pop_back();
      // // Unroll the keysIndex
      // keysIndex = currentObjectStored.back()->ToUint32()->Value();
      // currentObjectStored.pop_back();      
      // // Check if we finished up
      // if(keysIndex == keys->Length()) {
      //   finished = true;
      // }
    }
  }

  return object_size;
}

// Handle<Value> BSON::BSONSerialize2(const Arguments &args) {
//   HandleScope scope;
// 
//   if(args.Length() == 1 && !args[0]->IsObject()) return VException("One, two or tree arguments required - [object] or [object, boolean] or [object, boolean, boolean]");
//   if(args.Length() == 2 && !args[0]->IsObject() && !args[1]->IsBoolean()) return VException("One, two or tree arguments required - [object] or [object, boolean] or [object, boolean, boolean]");
//   if(args.Length() == 3 && !args[0]->IsObject() && !args[1]->IsBoolean() && !args[2]->IsBoolean()) return VException("One, two or tree arguments required - [object] or [object, boolean] or [object, boolean, boolean]");
//   if(args.Length() > 3) return VException("One, two or tree arguments required - [object] or [object, boolean] or [object, boolean, boolean]");
// 
//   // Calculate the total size of the document in binary form to ensure we only allocate memory once
//   uint32_t object_size = BSON::calculate_object_size2(args[0]);
//   // Allocate the memory needed for the serializtion
//   char *serialized_object = (char *)malloc(object_size * sizeof(char));  
//   // Catch any errors
//   try {
//     // Check if we have a boolean value
//     bool check_key = false;
//     if(args.Length() == 3 && args[1]->IsBoolean()) {
//       check_key = args[1]->BooleanValue();
//     }
//     
//     // Serialize the object
//     BSON::serialize2(serialized_object, 0, Null(), args[0], object_size, check_key);      
//   } catch(char *err_msg) {
//     // Free up serialized object space
//     free(serialized_object);
//     V8::AdjustAmountOfExternalAllocatedMemory(-object_size);
//     // Throw exception with the string
//     Handle<Value> error = VException(err_msg);
//     // free error message
//     free(err_msg);
//     // Return error
//     return error;
//   }
// 
//   // Write the object size
//   BSON::write_int32((serialized_object), object_size);  
// 
//   // If we have 3 arguments
//   if(args.Length() == 3) {
//     // Local<Boolean> asBuffer = args[2]->ToBoolean();    
//     Buffer *buffer = Buffer::New(serialized_object, object_size);
//     // Release the serialized string
//     free(serialized_object);
//     return scope.Close(buffer->handle_);
//   } else {
//     // Encode the string (string - null termiating character)
//     Local<Value> bin_value = Encode(serialized_object, object_size, BINARY)->ToString();
//     // Return the serialized content
//     return bin_value;    
//   }  
// }
// 
// uint32_t BSON::serialize2(char *serialized_object, uint32_t index, Handle<Value> name, Handle<Value> value, uint32_t objectSize, bool check_key) {
//   // Scope for method execution
//   HandleScope scope;
//   
//   // Final object size
//   uint32_t object_size = (4 + 1);
//   uint32_t stackIndex = 0;
//   // Controls the flow
//   bool done = false;
//   bool finished = false;
//   bool isObject = false;
// 
//   // Define a local vector that keeps the stack
//   // vector<vector<Local<Value> > > stack;// = new vector<vector<Local<Value> > >(0);
//   
//   // My own stack max of 1024 objects deep
//   Local<Object> *stack[1024];
//   
//   // Current object we are processing
//   Local<Object> currentObject = value->ToObject();
//   // Current list of object keys
//   Local<Array> keys = currentObject->GetPropertyNames();
//   // Contains pointer to keysIndex
//   uint32_t keysIndex = 0;
//   uint32_t keysLength = keys->Length();
//   // Add pointer to start of new object
//   index = index + 4;
//     
//   // printf("=================================================================================\n");      
//   // printf("Start serializing\n");      
//     
//   while(!done) {
//     // If the index is bigger than the number of keys for the object
//     // we finished up the previous object and are ready for the next one
//     if(keysIndex >= keys->Length()) {
//       keys = currentObject->GetPropertyNames();
//       keysLength = keys->Length();
//     }
//     
//     // Iterate over all the keys
//     while(keysIndex < keysLength) {
//       // Fetch the key name
//       Local<String> name = keys->Get(Number::New(keysIndex++))->ToString();
//       // Fetch the object related to the key
//       Local<Value> value = currentObject->Get(name);
//       // Check if we have an object
//       isObject = value->IsObject();
//       
//       if(isObject && Long::HasInstance(value)) {
//         // printf("======================================= long::%d\n", index);
//         
//         // Save the string at the offset provided
//         *(serialized_object + index) = BSON_DATA_LONG;
//         // Adjust writing position for the first byte
//         index = index + 1;
//         // Convert name to char*
//         ssize_t len = DecodeBytes(name, UTF8);
//         ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
//         // Add null termiation for the string
//         *(serialized_object + index + len) = '\0';    
//         // Adjust the index
//         index = index + len + 1;
// 
//         // Unpack the object and encode
//         Local<Object> obj = value->ToObject();
//         Long *long_obj = Long::Unwrap<Long>(obj);
//         // Write the content to the char array
//         BSON::write_int32((serialized_object + index), long_obj->low_bits);
//         BSON::write_int32((serialized_object + index + 4), long_obj->high_bits);
//         // Adjust the index
//         index = index + 8; 
//       } else if(value->IsString()) {
//         // printf("======================================= long::%d\n", index);
// 
//         // Save the string at the offset provided
//         *(serialized_object + index) = BSON_DATA_STRING;
//         // Adjust writing position for the first byte
//         index = index + 1;
//         // Convert name to char*
//         ssize_t len = DecodeBytes(name, UTF8);
//         ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
//         // Add null termiation for the string
//         *(serialized_object + index + len) = '\0';    
//         // Adjust the index
//         index = index + len + 1;
// 
//        // Write the actual string into the char array
//        Local<String> str = value->ToString();
//        // Let's fetch the int value
//        uint32_t utf8_length = str->Utf8Length();
// 
//        // If the Utf8 length is different from the string length then we
//        // have a UTF8 encoded string, otherwise write it as ascii
//        if(utf8_length != str->Length()) {
//          // Write the integer to the char *
//          BSON::write_int32((serialized_object + index), utf8_length + 1);
//          // Adjust the index
//          index = index + 4;
//          // Write string to char in utf8 format
//          str->WriteUtf8((serialized_object + index), utf8_length);
//          // Add the null termination
//          *(serialized_object + index + utf8_length) = '\0';    
//          // Adjust the index
//          index = index + utf8_length + 1;      
//        } else {
//          // Write the integer to the char *
//          BSON::write_int32((serialized_object + index), str->Length() + 1);
//          // Adjust the index
//          index = index + 4;
//          // Write string to char in utf8 format
//          written = DecodeWrite((serialized_object + index), str->Length(), str, BINARY);
//          // Add the null termination
//          *(serialized_object + index + str->Length()) = '\0';    
//          // Adjust the index
//          index = index + str->Length() + 1;      
//        }           
//       } else if(isObject) {
//         // printf("======================================= object::\n");
//         
//       }
//         // printf("  = Long\n");
//         // object_size = name->Utf8Length() + 1 + object_size + 8 + 1;
//       // } else if(isObject && DBRef::HasInstance(value)) {
//       //   // printf("  = DbRef\n");
//       //   // Unpack the dbref
//       //   Local<Object> dbref = value->ToObject();
//       //   // unpack dbref to get to the bin
//       //   DBRef *db_ref_obj = DBRef::Unwrap<DBRef>(dbref);
//       //   uint32_t dbRefSize = 0;
//       //   
//       //   // Add object header size + terminating 0
//       //   dbRefSize += 4 + 1;
//       //   
//       //   // Calculate the $ref size
//       //   dbRefSize += 1; //type
//       //   dbRefSize += 4 + 1; //name
//       //   dbRefSize += 4; // string length int32
//       //   dbRefSize += strlen(db_ref_obj->ref); // length of string
//       //   dbRefSize += 1; // termiating 0
//       // 
//       //   // Calculate the $db size
//       //   if(db_ref_obj->db != NULL) {
//       //     dbRefSize += 1; //type
//       //     dbRefSize += 3 + 1; //name
//       //     dbRefSize += 4; // string length int32
//       //     dbRefSize += strlen(db_ref_obj->db); // length of string
//       //     dbRefSize += 1; // termiating 0          
//       //   }
//       //   
//       //   // Make an assumption it's an objectID for the test
//       //   if(db_ref_obj->oid->IsObject() && ObjectID::HasInstance(db_ref_obj->oid)) {
//       //     dbRefSize += 1; //type
//       //     dbRefSize += 3 + 1; //name
//       //     dbRefSize += 12;
//       //   }
//       //   
//       //   // Add the object size to the total
//       //   object_size = name->Utf8Length() + 1 + object_size +  dbRefSize + 1;
//       // } else if(isObject && ObjectID::HasInstance(value)) {
//       //   // printf("  = ObjectID\n");
//       //   object_size = name->Utf8Length() + 1 + object_size + 12 + 1;
//       // } else if(isObject && Binary::HasInstance(value)) {
//       //   // printf("  = Binary\n");
//       //   // Unpack the object and encode
//       //   Local<Object> obj = value->ToObject();
//       //   Binary *binary_obj = Binary::Unwrap<Binary>(obj);
//       //   // Adjust the object_size, binary content lengt + total size int32 + binary size int32 + subtype
//       //   object_size = name->Utf8Length() + 1 + object_size + binary_obj->index + 4 + 1 + 1;
//       // } else if(isObject && Code::HasInstance(value)) {
//       //   // printf("  = Code\n");        
//       //   // Unpack the dbref
//       //   Local<Object> code = value->ToObject();
//       //   // unpack dbref to get to the bin
//       //   Code *code_ref_obj = Code::Unwrap<Code>(code);        
//       //   // Calculate the code size
//       //   object_size = name->Utf8Length() + 1 + object_size + strlen(code_ref_obj->code) + 4 + 1 + 1;
//       // }
//       
//       
//       // printf("======================================================================== 1\n");      
//     }
// 
//     // printf("======================================================================== 2\n");      
//     
//     // If we have finished all the keys
//     if(keysIndex == keysLength) {
//       finished = false;
//     }
//     
//     // Validate the stack
//     if(stackIndex == 0) {
//       // printf("======================================================================== 3\n");
//       done = true;
//      // Set last byte to zero
//      *(serialized_object + objectSize - 1) = 0x00;
//     } else if(finished || keysIndex == keysLength) {
//       // printf("======================================================================== 4\n");
//       // Pop off the stack
//       stackIndex = stackIndex - 1;
//      // Set last byte to zero
//      *(serialized_object + objectSize - 1) = 0x00;
// 
//       // Fetch the current object stack
//       // vector<Local<Value> > currentObjectStored = stack.back();
//       // stack.pop_back();
//       // // Unroll the current object
//       // currentObject = currentObjectStored.back()->ToObject();
//       // currentObjectStored.pop_back();
//       // // Unroll the keysIndex
//       // keys = Local<Array>::Cast(currentObjectStored.back()->ToObject());
//       // currentObjectStored.pop_back();
//       // // Unroll the keysIndex
//       // keysIndex = currentObjectStored.back()->ToUint32()->Value();
//       // currentObjectStored.pop_back();      
//       // // Check if we finished up
//       // if(keysIndex == keys->Length()) {
//       //   finished = true;
//       // }
//     }  
//   }
//   
//   return 0;
// }

//------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------
Handle<Value> BSON::BSONDeserialize(const Arguments &args) {
  HandleScope scope;

  // Ensure that we have an parameter
  if(Buffer::HasInstance(args[0]) && args.Length() > 1) return VException("One argument required - buffer1.");
  if(args[0]->IsString() && args.Length() > 1) return VException("One argument required - string1.");
  // Throw an exception if the argument is not of type Buffer
  if(!Buffer::HasInstance(args[0]) && !args[0]->IsString()) return VException("Argument must be a Buffer or String.");
  
  // Define pointer to data
  char *data;
  uint32_t length;      
  Local<Object> obj = args[0]->ToObject();

  // Unpack the BSON parser instance
  BSON *bson = ObjectWrap::Unwrap<BSON>(args.This());  

  // If we passed in a buffer, let's unpack it, otherwise let's unpack the string
  if(Buffer::HasInstance(obj)) {

    #if NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION < 3
     Buffer *buffer = ObjectWrap::Unwrap<Buffer>(obj);
     data = buffer->data();
     uint32_t length = buffer->length();
    #else
     data = Buffer::Data(obj);
     uint32_t length = Buffer::Length(obj);
    #endif

    return BSON::deserialize(bson, data, 0, NULL);
  } else {
    // The length of the data for this encoding
    ssize_t len = DecodeBytes(args[0], BINARY);
    // Let's define the buffer size
    data = (char *)malloc(len);
    // Write the data to the buffer from the string object
    ssize_t written = DecodeWrite(data, len, args[0], BINARY);
    // Assert that we wrote the same number of bytes as we have length
    assert(written == len);
    // Get result
    Handle<Value> result = BSON::deserialize(bson, data, 0, NULL);
    // Free memory
    free(data);
    // Deserialize the content
    return result;
  }  
}

// Deserialize the stream
Handle<Value> BSON::deserialize(BSON *bson, char *data, uint32_t startIndex, bool is_array_item) {
  HandleScope scope;
  // Holds references to the objects that are going to be returned
  Local<Object> return_data = Object::New();
  Local<Array> return_array = Array::New();      
  // The current index in the char data
  uint32_t index = startIndex;
  // Decode the size of the BSON data structure
  uint32_t size = BSON::deserialize_int32(data, index);

  // Data length
  uint32_t dataLength = index + size;

  // Adjust the index to point to next piece
  index = index + 4;      

  // While we have data left let's decode
  while(index < dataLength) {
    // Read the first to bytes to indicate the type of object we are decoding
    uint8_t type = BSON::deserialize_int8(data, index);    
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
      char *value = (char *)malloc((string_size * sizeof(char)));
      strncpy(value, (data + index), string_size);
      // Encode the string (string - null termiating character)
      Local<Value> utf8_encoded_str = Encode(value, string_size - 1, UTF8)->ToString();
      // Add the value to the data
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), utf8_encoded_str);
      } else {
        return_data->ForceSet(String::New(string_name), utf8_encoded_str);
      }
      
      // Adjust index
      index = index + string_size;
      // Free up the memory
      free(value);
      free(string_name);
    } else if(type == BSON_DATA_INT) {
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
        return_array->Set(Integer::New(insert_index), Integer::New(value));
      } else {
        return_data->ForceSet(String::New(string_name), Integer::New(value));
      }          
      // Free up the memory
      free(string_name);
    } else if(type == BSON_DATA_TIMESTAMP) {
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
        return_array->Set(Number::New(insert_index), BSON::decodeTimestamp(bson, data, index));
      } else {
        return_data->ForceSet(String::New(string_name), BSON::decodeTimestamp(bson, data, index));
      }
      
      // Adjust the index for the size of the value
      index = index + 8;
      
      // Free up the memory
      free(string_name);            
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
      
      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), BSON::decodeLong(bson, data, index));
      } else {
        return_data->ForceSet(String::New(string_name), BSON::decodeLong(bson, data, index));
      }        

      // Adjust the index for the size of the value
      index = index + 8;

      // Free up the memory
      free(string_name);      
    } else if(type == BSON_DATA_NUMBER) {
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
        return_data->ForceSet(String::New(string_name), Number::New(value));
      }
      // Free up the memory
      free(string_name);      
    } else if(type == BSON_DATA_MIN_KEY) {
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
      
      // Create new MinKey
      Local<Object> minKey = bson->minKeyConstructor->NewInstance();
      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), minKey);
      } else {
        return_data->ForceSet(String::New(string_name), minKey);
      }      
      // Free up the memory
      free(string_name);      
    } else if(type == BSON_DATA_MAX_KEY) {
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
      
      // Create new MinKey
      Local<Object> maxKey = bson->maxKeyConstructor->NewInstance();
      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), maxKey);
      } else {
        return_data->ForceSet(String::New(string_name), maxKey);
      }      
      // Free up the memory
      free(string_name);      
    } else if(type == BSON_DATA_NULL) {
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
        return_data->ForceSet(String::New(string_name), Null());
      }      
      // Free up the memory
      free(string_name);      
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
        return_data->ForceSet(String::New(string_name), bool_value == 1 ? Boolean::New(true) : Boolean::New(false));
      }            
      // Free up the memory
      free(string_name);      
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
        return_data->ForceSet(String::New(string_name), Date::New((double)value));
      }     
      // Free up the memory
      free(string_name);        
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
      int32_t start_index = index;
      char chr;
      
      // Locate end of the regexp expression \0
      while((chr = *(data + index + length_regexp)) != '\0') {
        length_regexp = length_regexp + 1;
      }

      // Contains the reg exp
      char *reg_exp = (char *)malloc(length_regexp * sizeof(char) + 2);
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
      int flag = 0;

      for(int i = 0; i < options_length; i++) {
        // Multiline
        if(*(options + i) == 'm') {
          flag = flag | 4;
        } else if(*(options + i) == 'i') {
          flag = flag | 2;          
        }
      }

      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), RegExp::New(String::New(reg_exp), (v8::RegExp::Flags)flag));
      } else {
        return_data->ForceSet(String::New(string_name), RegExp::New(String::New(reg_exp), (v8::RegExp::Flags)flag));
      }  
      
      // Free memory
      free(reg_exp);          
      free(options);          
      free(string_name);
    } else if(type == BSON_DATA_OID) {
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

      // The id string
      char *oid_string = (char *)malloc(12 * sizeof(char));
      // Copy the options from the data to the char *
      memcpy(oid_string, (data + index), 12);
      
      // Adjust the index
      index = index + 12;
      
      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), BSON::decodeOid(bson, oid_string));
      } else {
        return_data->ForceSet(String::New(string_name), BSON::decodeOid(bson, oid_string));
      }     
      
      // Free memory
      free(oid_string);                       
      free(string_name);
    } else if(type == BSON_DATA_BINARY) {
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
      
      // Read the binary data size
      uint32_t number_of_bytes = BSON::deserialize_int32(data, index);
      // Adjust the index
      index = index + 4;
      // Decode the subtype, ensure it's positive
      uint32_t sub_type = (int)*(data + index) & 0xff;
      // Adjust the index
      index = index + 1;
      // Copy the binary data into a buffer
      char *buffer = (char *)malloc(number_of_bytes * sizeof(char) + 1);
      memcpy(buffer, (data + index), number_of_bytes);
      *(buffer + number_of_bytes) = '\0';

      // Adjust the index
      index = index + number_of_bytes;

      // Add the element to the object
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), BSON::decodeBinary(bson, sub_type, number_of_bytes, buffer));
      } else {
        return_data->ForceSet(String::New(string_name), BSON::decodeBinary(bson, sub_type, number_of_bytes, buffer));
      }
      // Free memory
      free(buffer);                             
      free(string_name);
    } else if(type == BSON_DATA_SYMBOL) {
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
      char *value = (char *)malloc((string_size * sizeof(char)));
      strncpy(value, (data + index), string_size);
      // Encode the string (string - null termiating character)
      Local<Value> utf8_encoded_str = Encode(value, string_size - 1, UTF8)->ToString();
      
      // Wrap up the string in a Symbol Object
      Local<Value> argv[] = {utf8_encoded_str};
      Handle<Value> symbolObj = bson->symbolConstructor->NewInstance(1, argv);
      
      // Add the value to the data
      if(is_array_item) {
        return_array->Set(Number::New(insert_index), symbolObj);
      } else {
        return_data->ForceSet(String::New(string_name), symbolObj);
      }
      
      // Adjust index
      index = index + string_size;
      // Free up the memory
      free(value);
      free(string_name);
    } else if(type == BSON_DATA_CODE) {
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
      
      // Read the string size
      uint32_t string_size = BSON::deserialize_int32(data, index);
      // Adjust the index
      index = index + 4;
      // Read the string
      char *code = (char *)malloc(string_size * sizeof(char) + 1);
      // Copy string + terminating 0
      memcpy(code, (data + index), string_size);
      
      // Define empty scope object
      Handle<Value> scope_object = Object::New();
      
      // Define the try catch block
      TryCatch try_catch;                
      // Decode the code object
      Handle<Value> obj = BSON::decodeCode(bson, code, scope_object);
      // If an error was thrown push it up the chain
      if(try_catch.HasCaught()) {
        free(string_name);
        free(code);
        // Rethrow exception
        return try_catch.ReThrow();
      }
      
      // Add the element to the object
      if(is_array_item) {        
        return_array->Set(Number::New(insert_index), obj);
      } else {
        return_data->ForceSet(String::New(string_name), obj);
      }      
      
      // Clean up memory allocation
      free(code);
      free(string_name);
    } else if(type == BSON_DATA_CODE_W_SCOPE) {
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
      Handle<Value> scope_object = BSON::deserialize(bson, bson_buffer, 0, false);
      // Define the try catch block
      TryCatch try_catch;                
      // Decode the code object
      Handle<Value> obj = BSON::decodeCode(bson, code, scope_object);
      // If an error was thrown push it up the chain
      if(try_catch.HasCaught()) {
        // Clean up memory allocation
        free(string_name);
        free(bson_buffer);
        free(code);
        // Rethrow exception
        return try_catch.ReThrow();
      }
      
      // Add the element to the object
      if(is_array_item) {        
        return_array->Set(Number::New(insert_index), obj);
      } else {
        return_data->ForceSet(String::New(string_name), obj);
      }      
      
      // Clean up memory allocation
      free(code);
      free(bson_buffer);      
      free(string_name);
    } else if(type == BSON_DATA_OBJECT) {
      // If this is the top level object we need to skip the undecoding
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
      // Define the try catch block
      TryCatch try_catch;                
      // Decode the code object
      Handle<Value> obj = BSON::deserialize(bson, data + index, 0, false);
      // Adjust the index
      index = index + bson_object_size;
      // If an error was thrown push it up the chain
      if(try_catch.HasCaught()) {
        // Rethrow exception
        return try_catch.ReThrow();
      }
      
      // Add the element to the object
      if(is_array_item) {        
        return_array->Set(Number::New(insert_index), obj);
      } else {
        return_data->ForceSet(String::New(string_name), obj);
      }
      
      // Clean up memory allocation
      free(string_name);
    } else if(type == BSON_DATA_ARRAY) {
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
      
      // Get the size
      uint32_t array_size = BSON::deserialize_int32(data, index);
      // Define the try catch block
      TryCatch try_catch;                

      // Decode the code object
      Handle<Value> obj = BSON::deserialize(bson, data + index, 0, true);
      // If an error was thrown push it up the chain
      if(try_catch.HasCaught()) {
        // Rethrow exception
        return try_catch.ReThrow();
      }
      // Adjust the index for the next value
      index = index + array_size;
      // Add the element to the object
      if(is_array_item) {        
        return_array->Set(Number::New(insert_index), obj);
      } else {
        return_data->ForceSet(String::New(string_name), obj);
      }      
      // Clean up memory allocation
      free(string_name);
    }
  }
  
  // Check if we have a db reference
  if(!is_array_item && return_data->Has(String::New("$ref")) && return_data->Has(String::New("$id"))) {
    Handle<Value> dbrefValue = BSON::decodeDBref(bson, return_data->Get(String::New("$ref")), return_data->Get(String::New("$id")), return_data->Get(String::New("$db")));
    return scope.Close(dbrefValue);
  }
  
  // Return the data object to javascript
  if(is_array_item) {
    return scope.Close(return_array);
  } else {
    return scope.Close(return_data);
  }
}

Handle<Value> BSON::BSONSerialize(const Arguments &args) {
  HandleScope scope;

  if(args.Length() == 1 && !args[0]->IsObject()) return VException("One, two or tree arguments required - [object] or [object, boolean] or [object, boolean, boolean]");
  if(args.Length() == 2 && !args[0]->IsObject() && !args[1]->IsBoolean()) return VException("One, two or tree arguments required - [object] or [object, boolean] or [object, boolean, boolean]");
  if(args.Length() == 3 && !args[0]->IsObject() && !args[1]->IsBoolean() && !args[2]->IsBoolean()) return VException("One, two or tree arguments required - [object] or [object, boolean] or [object, boolean, boolean]");
  if(args.Length() == 4 && !args[0]->IsObject() && !args[1]->IsBoolean() && !args[2]->IsBoolean() && !args[3]->IsBoolean()) return VException("One, two or tree arguments required - [object] or [object, boolean] or [object, boolean, boolean] or [object, boolean, boolean, boolean]");
  if(args.Length() > 4) return VException("One, two, tree or four arguments required - [object] or [object, boolean] or [object, boolean, boolean] or [object, boolean, boolean, boolean]");

  // Unpack the BSON parser instance
  BSON *bson = ObjectWrap::Unwrap<BSON>(args.This());  

  uint32_t object_size = 0;
  // Calculate the total size of the document in binary form to ensure we only allocate memory once
  // With serialize function
  if(args.Length() == 4) {
    object_size = BSON::calculate_object_size(bson, args[0], args[3]->BooleanValue());    
  } else {
    object_size = BSON::calculate_object_size(bson, args[0], false);        
  }

  // Allocate the memory needed for the serializtion
  char *serialized_object = (char *)malloc(object_size * sizeof(char));  
  // Catch any errors
  try {
    // Check if we have a boolean value
    bool check_key = false;
    if(args.Length() >= 3 && args[1]->IsBoolean()) {
      check_key = args[1]->BooleanValue();
    }

    // Check if we have a boolean value
    bool serializeFunctions = false;
    if(args.Length() == 4 && args[1]->IsBoolean()) {
      serializeFunctions = args[3]->BooleanValue();
    }
    
    // Serialize the object
    BSON::serialize(bson, serialized_object, 0, Null(), args[0], check_key, serializeFunctions);      
  } catch(char *err_msg) {
    // Free up serialized object space
    free(serialized_object);
    V8::AdjustAmountOfExternalAllocatedMemory(-object_size);
    // Throw exception with the string
    Handle<Value> error = VException(err_msg);
    // free error message
    free(err_msg);
    // Return error
    return error;
  }

  // Write the object size
  BSON::write_int32((serialized_object), object_size);  

  // If we have 3 arguments
  if(args.Length() == 3 || args.Length() == 4) {
    // Local<Boolean> asBuffer = args[2]->ToBoolean();    
    Buffer *buffer = Buffer::New(serialized_object, object_size);
    // Release the serialized string
    free(serialized_object);
    return scope.Close(buffer->handle_);
  } else {
    // Encode the string (string - null termiating character)
    Local<Value> bin_value = Encode(serialized_object, object_size, BINARY)->ToString();
    // Return the serialized content
    return bin_value;    
  }  
}

Handle<Value> BSON::CalculateObjectSize(const Arguments &args) {
  HandleScope scope;
  // Ensure we have a valid object
  if(args.Length() == 1 && !args[0]->IsObject()) return VException("One argument required - [object]");
  if(args.Length() == 2 && !args[0]->IsObject() && !args[1]->IsBoolean())  return VException("Two arguments required - [object, boolean]");
  if(args.Length() > 3) return VException("One or two arguments required - [object] or [object, boolean]");
  
  // Unpack the BSON parser instance
  BSON *bson = ObjectWrap::Unwrap<BSON>(args.This());  
  
  // Object size
  uint32_t object_size = 0;
  // Check if we have our argument, calculate size of the object  
  if(args.Length() == 2) {
    object_size = BSON::calculate_object_size(bson, args[0], args[1]->BooleanValue());
  } else {
    object_size = BSON::calculate_object_size(bson, args[0], false);
  }

  // Return the object size
  return scope.Close(Uint32::New(object_size));
}

uint32_t BSON::calculate_object_size(BSON *bson, Handle<Value> value, bool serializeFunctions) {
  uint32_t object_size = 0;

  // If we have an object let's unwrap it and calculate the sub sections
  if(value->IsString()) {
    // Let's calculate the size the string adds, length + type(1 byte) + size(4 bytes)
    object_size += value->ToString()->Utf8Length() + 1 + 4;  
  } else if(value->IsNumber()) {
    // Check if we have a float value or a long value
    Local<Number> number = value->ToNumber();
    double d_number = number->NumberValue();
    int64_t l_number = number->IntegerValue();
    // Check if we have a double value and not a int64
    double d_result = d_number - l_number;    
    // If we have a value after subtracting the integer value we have a float
    if(d_result > 0 || d_result < 0) {
      object_size = object_size + 8;      
    } else if(l_number <= BSON_INT32_MAX && l_number >= BSON_INT32_MIN) {
      object_size = object_size + 4;
    } else {
      object_size = object_size + 8;
    }
  } else if(value->IsBoolean()) {
    object_size = object_size + 1;
  } else if(value->IsDate()) {
    object_size = object_size + 8;
  } else if(value->IsRegExp()) {
    // Fetch the string for the regexp
    Handle<RegExp> regExp = Handle<RegExp>::Cast(value);    
    ssize_t len = DecodeBytes(regExp->GetSource(), UTF8);
    int flags = regExp->GetFlags();
    
    // global
    if((flags & (1 << 0)) != 0) len++;
    // ignorecase
    if((flags & (1 << 1)) != 0) len++;
    //multiline
    if((flags & (1 << 2)) != 0) len++;
    // if((flags & (1 << 2)) != 0) len++;
    // Calculate the space needed for the regexp: size of string - 2 for the /'ses +2 for null termiations
    object_size = object_size + len + 2;
  } else if(value->IsNull() || value->IsUndefined()) {
  } else if(value->IsArray()) {
    // Cast to array
    Local<Array> array = Local<Array>::Cast(value->ToObject());
    // Turn length into string to calculate the size of all the strings needed
    char *length_str = (char *)malloc(256 * sizeof(char));
    // Calculate the size of each element
    for(uint32_t i = 0; i < array->Length(); i++) {
      // Add "index" string size for each element
      sprintf(length_str, "%d", i);
      // Add the size of the string length
      uint32_t label_length = strlen(length_str) + 1;
      // Add the type definition size for each item
      object_size = object_size + label_length + 1;
      // Add size of the object
      uint32_t object_length = BSON::calculate_object_size(bson, array->Get(Integer::New(i)), serializeFunctions);
      object_size = object_size + object_length;
    }
    // Add the object size
    object_size = object_size + 4 + 1;
    // Free up memory
    free(length_str);
  } else if(value->IsFunction()) {
    if(serializeFunctions) {
      object_size += value->ToString()->Utf8Length() + 4 + 1;
    }
  } else if(value->ToObject()->Has(bson->_bsontypeString)) {
    // Handle holder
    Local<String> constructorString = value->ToObject()->GetConstructorName();
    
    // BSON type object, avoid non-needed checking unless we have a type
    if(bson->longString->StrictEquals(constructorString)) {
      object_size = object_size + 8;
    } else if(bson->timestampString->StrictEquals(constructorString)) {
      object_size = object_size + 8;
    } else if(bson->objectIDString->StrictEquals(constructorString)) {
      object_size = object_size + 12;
    } else if(bson->binaryString->StrictEquals(constructorString)) {
      // Unpack the object and encode
      Local<Uint32> positionObj = value->ToObject()->Get(String::New("position"))->ToUint32();
      // Adjust the object_size, binary content lengt + total size int32 + binary size int32 + subtype
      object_size += positionObj->Value() + 4 + 1;
    } else if(bson->codeString->StrictEquals(constructorString)) {
      // Unpack the object and encode
      Local<Object> obj = value->ToObject();
      // Get the function
      Local<String> function = obj->Get(String::New("code"))->ToString();
      // Get the scope object
      Local<Object> scope = obj->Get(String::New("scope"))->ToObject();
            
      // For Node < 0.6.X use the GetPropertyNames
      #if NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION < 6
        uint32_t propertyNameLength = scope->GetPropertyNames()->Length();
      #else
        uint32_t propertyNameLength = scope->GetOwnPropertyNames()->Length();
      #endif
      
      // Check if the scope has any parameters
      // Let's calculate the size the code object adds adds      
      if(propertyNameLength > 0) {
       object_size += function->Utf8Length() + 4 + BSON::calculate_object_size(bson, scope, serializeFunctions) + 4 + 1;
      } else {
       object_size += function->Utf8Length() + 4 + 1;
      }       
    } else if(bson->dbrefString->StrictEquals(constructorString)) {
      // Unpack the dbref
      Local<Object> dbref = value->ToObject();
      // Create an object containing the right namespace variables
      Local<Object> obj = Object::New();
      // Build the new object
      obj->Set(bson->_dbRefRefString, dbref->Get(bson->_dbRefNamespaceString));
      obj->Set(bson->_dbRefIdRefString, dbref->Get(bson->_dbRefOidString));      
      if(!dbref->Get(bson->_dbRefDbString)->IsNull() && !dbref->Get(bson->_dbRefDbString)->IsUndefined()) obj->Set(bson->_dbRefDbRefString, dbref->Get(bson->_dbRefDbString));
      // Calculate size
      object_size += BSON::calculate_object_size(bson, obj, serializeFunctions);
    } else if(bson->minKeyString->StrictEquals(constructorString) || bson->maxKeyString->Equals(constructorString)) {    
    } else if(bson->symbolString->StrictEquals(constructorString)) {
      // Get string
      Local<String> str = value->ToObject()->Get(String::New("value"))->ToString();
      // Get the utf8 length
      uint32_t utf8_length = str->Utf8Length();
      // Check if we have a utf8 encoded string or not
      if(utf8_length != str->Length()) {
        // Let's calculate the size the string adds, length + type(1 byte) + size(4 bytes)
        object_size += str->Utf8Length() + 1 + 4;  
      } else {
        object_size += str->Length() + 1 + 4;        
      }    
    } else if(bson->doubleString->StrictEquals(constructorString)) {
      object_size = object_size + 8;
    }    
  } else if(value->IsObject()) {
    // Unwrap the object
    Local<Object> object = value->ToObject();

    #if NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION < 6
      Local<Array> property_names = object->GetPropertyNames();
    #else
      Local<Array> property_names = object->GetOwnPropertyNames();
    #endif

    // Process all the properties on the object
    for(uint32_t index = 0; index < property_names->Length(); index++) {
      // Fetch the property name
      Local<String> property_name = property_names->Get(index)->ToString();
      
      // Fetch the object for the property
      Local<Value> property = object->Get(property_name);
      // Get size of property (property + property name length + 1 for terminating 0)
      if(!property->IsFunction() || (property->IsFunction() && serializeFunctions)) {
        // Convert name to char*
        ssize_t len = DecodeBytes(property_name, UTF8);
        object_size += BSON::calculate_object_size(bson, property, serializeFunctions) + len + 1 + 1;
      }
    }      
    
    object_size = object_size + 4 + 1;
  } 

  return object_size;
}

uint32_t BSON::serialize(BSON *bson, char *serialized_object, uint32_t index, Handle<Value> name, Handle<Value> value, bool check_key, bool serializeFunctions) {
  // Scope for method execution
  HandleScope scope;

  // If we have a name check that key is valid
  if(!name->IsNull() && check_key) {
    if(BSON::check_key(name->ToString()) != NULL) return -1;
  }  
  
  // If we have an object let's serialize it  
  if(value->IsString()) {
    // Save the string at the offset provided
    *(serialized_object + index) = BSON_DATA_STRING;
    // Adjust writing position for the first byte
    index = index + 1;
    // Convert name to char*
    ssize_t len = DecodeBytes(name, UTF8);
    ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
    // Add null termiation for the string
    *(serialized_object + index + len) = '\0';    
    // Adjust the index
    index = index + len + 1;        
  
    // Write the actual string into the char array
    Local<String> str = value->ToString();
    // Let's fetch the int value
    uint32_t utf8_length = str->Utf8Length();

    // Write the integer to the char *
    BSON::write_int32((serialized_object + index), utf8_length + 1);
    // Adjust the index
    index = index + 4;
    // Write string to char in utf8 format
    str->WriteUtf8((serialized_object + index), utf8_length);
    // Add the null termination
    *(serialized_object + index + utf8_length) = '\0';    
    // Adjust the index
    index = index + utf8_length + 1;      
  } else if(value->IsNumber()) {
    uint32_t first_pointer = index;
    // Save the string at the offset provided
    *(serialized_object + index) = BSON_DATA_INT;
    // Adjust writing position for the first byte
    index = index + 1;
    // Convert name to char*
    ssize_t len = DecodeBytes(name, UTF8);
    ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
    // Add null termiation for the string
    *(serialized_object + index + len) = '\0';    
    // Adjust the index
    index = index + len + 1;    
    
    Local<Number> number = value->ToNumber();
    // Get the values
    double d_number = number->NumberValue();
    int64_t l_number = number->IntegerValue();
    
    // Check if we have a double value and not a int64
    double d_result = d_number - l_number;    
    // If we have a value after subtracting the integer value we have a float
    if(d_result > 0 || d_result < 0) {
      // Write the double to the char array
      BSON::write_double((serialized_object + index), d_number);
      // Adjust type to be double
      *(serialized_object + first_pointer) = BSON_DATA_NUMBER;
      // Adjust index for double
      index = index + 8;
    } else if(l_number <= BSON_INT32_MAX && l_number >= BSON_INT32_MIN) {
      // Smaller than 32 bit, write as 32 bit value
      BSON::write_int32(serialized_object + index, value->ToInt32()->Value());
      // Adjust the size of the index
      index = index + 4;
    } else if(l_number <= (2^53) && l_number >= (-2^53)) {
      // Write the double to the char array
      BSON::write_double((serialized_object + index), d_number);
      // Adjust type to be double
      *(serialized_object + first_pointer) = BSON_DATA_NUMBER;
      // Adjust index for double
      index = index + 8;      
    } else {
      BSON::write_double((serialized_object + index), d_number);
      // Adjust type to be double
      *(serialized_object + first_pointer) = BSON_DATA_NUMBER;
      // Adjust the size of the index
      index = index + 8;
    }     
  } else if(value->IsBoolean()) {
    // Save the string at the offset provided
    *(serialized_object + index) = BSON_DATA_BOOLEAN;
    // Adjust writing position for the first byte
    index = index + 1;
    // Convert name to char*
    ssize_t len = DecodeBytes(name, UTF8);
    ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
    // Add null termiation for the string
    *(serialized_object + index + len) = '\0';    
    // Adjust the index
    index = index + len + 1;    

    // Save the boolean value
    *(serialized_object + index) = value->BooleanValue() ? '\1' : '\0';
    // Adjust the index
    index = index + 1;
  } else if(value->IsDate()) {
    // Save the string at the offset provided
    *(serialized_object + index) = BSON_DATA_DATE;
    // Adjust writing position for the first byte
    index = index + 1;
    // Convert name to char*
    ssize_t len = DecodeBytes(name, UTF8);
    ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
    // Add null termiation for the string
    *(serialized_object + index + len) = '\0';    
    // Adjust the index
    index = index + len + 1;    

    // Fetch the Integer value
    int64_t integer_value = value->IntegerValue();
    BSON::write_int64((serialized_object + index), integer_value);
    // Adjust the index
    index = index + 8;
  } else if(value->IsNull() || value->IsUndefined()) {
    // Save the string at the offset provided
    *(serialized_object + index) = BSON_DATA_NULL;
    // Adjust writing position for the first byte
    index = index + 1;
    // Convert name to char*
    ssize_t len = DecodeBytes(name, UTF8);
    ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
    // Add null termiation for the string
    *(serialized_object + index + len) = '\0';    
    // Adjust the index
    index = index + len + 1;    
  } else if(value->IsArray()) {
    // Cast to array
    Local<Array> array = Local<Array>::Cast(value->ToObject());
    // Turn length into string to calculate the size of all the strings needed
    char *length_str = (char *)malloc(256 * sizeof(char));    
    // Save the string at the offset provided
    *(serialized_object + index) = BSON_DATA_ARRAY;
    // Adjust writing position for the first byte
    index = index + 1;
    // Convert name to char*
    ssize_t len = DecodeBytes(name, UTF8);
    ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
    // Add null termiation for the string
    *(serialized_object + index + len) = '\0';    
    // Adjust the index
    index = index + len + 1;        
    // Object size
    uint32_t object_size = BSON::calculate_object_size(bson, value, serializeFunctions);
    // Write the size of the object
    BSON::write_int32((serialized_object + index), object_size);
    // Adjust the index
    index = index + 4;
    // Write out all the elements
    for(uint32_t i = 0; i < array->Length(); i++) {
      // Add "index" string size for each element
      sprintf(length_str, "%d", i);
      // Encode the values      
      index = BSON::serialize(bson, serialized_object, index, String::New(length_str), array->Get(Integer::New(i)), check_key, serializeFunctions);
      // Write trailing '\0' for object
      *(serialized_object + index) = '\0';
    }

    // Pad the last item
    *(serialized_object + index) = '\0';
    index = index + 1;
    // Free up memory
    free(length_str);
  } else if(value->IsRegExp()) {
    // Save the string at the offset provided
    *(serialized_object + index) = BSON_DATA_REGEXP;
    // Adjust writing position for the first byte
    index = index + 1;
    // Convert name to char*
    ssize_t len = DecodeBytes(name, UTF8);
    ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
    // Add null termiation for the string
    *(serialized_object + index + len) = '\0';    
    // Adjust the index
    index = index + len + 1;    

    // Fetch the string for the regexp
    Handle<RegExp> regExp = Handle<RegExp>::Cast(value);    
    len = DecodeBytes(regExp->GetSource(), UTF8);
    written = DecodeWrite((serialized_object + index), len, regExp->GetSource(), UTF8);
    int flags = regExp->GetFlags();
    // Add null termiation for the string
    *(serialized_object + index + len) = '\0';    
    // Adjust the index
    index = index + len + 1;
    
    // global
    if((flags & (1 << 0)) != 0) {
      *(serialized_object + index) = 's';
      index = index + 1;      
    }
    
    // ignorecase
    if((flags & (1 << 1)) != 0) {
      *(serialized_object + index) = 'i';
      index = index + 1;
    }
    
    //multiline
    if((flags & (1 << 2)) != 0) {
      *(serialized_object + index) = 'm';      
      index = index + 1;
    }
    
    // Add null termiation for the string
    *(serialized_object + index) = '\0';    
    // Adjust the index
    index = index + 1;
  } else if(value->IsFunction()) {
    if(serializeFunctions) {
      // Save the string at the offset provided
      *(serialized_object + index) = BSON_DATA_CODE;
  
      // Adjust writing position for the first byte
      index = index + 1;
      // Convert name to char*
      ssize_t len = DecodeBytes(name, UTF8);
      ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
      // Add null termiation for the string
      *(serialized_object + index + len) = '\0';    
      // Adjust the index
      index = index + len + 1;    
  
      // Function String
      Local<String> function = value->ToString();
  
      // Decode the function
      len = DecodeBytes(function, BINARY);
      // Write the size of the code string + 0 byte end of cString
      BSON::write_int32((serialized_object + index), len + 1);
      // Adjust the index
      index = index + 4;    
      
      // Write the data into the serialization stream
      written = DecodeWrite((serialized_object + index), len, function, BINARY);      
      // Write \0 for string
      *(serialized_object + index + len) = 0x00;
      // Adjust the index
      index = index + len + 1;  
    }
  } else if(value->ToObject()->Has(bson->_bsontypeString)) {
    // Handle holder
    Local<String> constructorString = value->ToObject()->GetConstructorName();    
    uint32_t originalIndex = index;
    // Adjust writing position for the first byte
    index = index + 1;
    // Convert name to char*
    ssize_t len = DecodeBytes(name, UTF8);
    ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
    // Add null termiation for the string
    *(serialized_object + index + len) = 0x00;    
    // Adjust the index
    index = index + len + 1;    

    // BSON type object, avoid non-needed checking unless we have a type
    if(bson->longString->StrictEquals(constructorString)) {
      // Save the string at the offset provided
      *(serialized_object + originalIndex) = BSON_DATA_LONG;
      // Object reference
      Local<Object> longObject = value->ToObject();

      // Fetch the low and high bits
      int32_t lowBits = longObject->Get(bson->_longLowString)->ToInt32()->Value();
      int32_t highBits = longObject->Get(bson->_longHighString)->ToInt32()->Value();
  
      // Write the content to the char array
      BSON::write_int32((serialized_object + index), lowBits);
      BSON::write_int32((serialized_object + index + 4), highBits);
      // Adjust the index
      index = index + 8;      
    } else if(bson->timestampString->StrictEquals(constructorString)) {
      // Save the string at the offset provided
      *(serialized_object + originalIndex) = BSON_DATA_TIMESTAMP;
      // Object reference
      Local<Object> timestampObject = value->ToObject();

      // Fetch the low and high bits
      int32_t lowBits = timestampObject->Get(bson->_longLowString)->ToInt32()->Value();
      int32_t highBits = timestampObject->Get(bson->_longHighString)->ToInt32()->Value();
  
      // Write the content to the char array
      BSON::write_int32((serialized_object + index), lowBits);
      BSON::write_int32((serialized_object + index + 4), highBits);
      // Adjust the index
      index = index + 8;      
    } else if(bson->objectIDString->StrictEquals(constructorString)) {
      // Save the string at the offset provided
      *(serialized_object + originalIndex) = BSON_DATA_OID;
      // Convert to object
      Local<Object> objectIDObject = value->ToObject();
      // Let's grab the id
      Local<String> idString = objectIDObject->Get(bson->_objectIDidString)->ToString();
      // Let's decode the raw chars from the string
      len = DecodeBytes(idString, BINARY);
      written = DecodeWrite((serialized_object + index), len, idString, BINARY);
      // Adjust the index
      index = index + 12;
    } else if(bson->binaryString->StrictEquals(constructorString)) {
      // Save the string at the offset provided
      *(serialized_object + originalIndex) = BSON_DATA_BINARY;
    
      // Let's get the binary object
      Local<Object> binaryObject = value->ToObject();
    
      // Grab the size(position of the binary)
      uint32_t position = value->ToObject()->Get(bson->_binaryPositionString)->ToUint32()->Value();
      // Grab the subtype
      uint32_t subType = value->ToObject()->Get(bson->_binarySubTypeString)->ToUint32()->Value();
      // Grab the buffer object
      Local<Object> bufferObj = value->ToObject()->Get(bson->_binaryBufferString)->ToObject();

      // Buffer data pointers
      char *data;
      uint32_t length;      

      // Unpack the buffer variable
      #if NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION < 3
       Buffer *buffer = ObjectWrap::Unwrap<Buffer>(bufferObj);
       data = buffer->data();
       length = buffer->length();
      #else
       data = Buffer::Data(bufferObj);
       length = Buffer::Length(bufferObj);
      #endif

      // Write the size of the buffer out
      BSON::write_int32((serialized_object + index), position);
      // Adjust index
      index = index + 4;
      // Write subtype
      *(serialized_object + index)  = (char)subType;
      // Adjust index
      index = index + 1;
      // Write binary content
      memcpy((serialized_object + index), data, position);
      // Adjust index.rar">_</a>
      index = index + position;
    } else if(bson->doubleString->StrictEquals(constructorString)) {
      // Save the string at the offset provided
      *(serialized_object + originalIndex) = BSON_DATA_NUMBER;

      // Unpack the double
      Local<Object> doubleObject = value->ToObject();
    
      // Fetch the double value
      Local<Number> doubleValue = doubleObject->Get(bson->_doubleValueString)->ToNumber();
      // Write the double to the char array
      BSON::write_double((serialized_object + index), doubleValue->NumberValue());
      // Adjust index for double
      index = index + 8;
    } else if(bson->symbolString->StrictEquals(constructorString)) {
      // Save the string at the offset provided
      *(serialized_object + originalIndex) = BSON_DATA_SYMBOL;
      // Unpack symbol object
      Local<Object> symbolObj = value->ToObject();
    
      // Grab the actual string
      Local<String> str = symbolObj->Get(bson->_symbolValueString)->ToString();
      // Let's fetch the int value
      uint32_t utf8_length = str->Utf8Length();
  
      // If the Utf8 length is different from the string length then we
      // have a UTF8 encoded string, otherwise write it as ascii
      if(utf8_length != str->Length()) {
        // Write the integer to the char *
        BSON::write_int32((serialized_object + index), utf8_length + 1);
        // Adjust the index
        index = index + 4;
        // Write string to char in utf8 format
        str->WriteUtf8((serialized_object + index), utf8_length);
        // Add the null termination
        *(serialized_object + index + utf8_length) = '\0';    
        // Adjust the index
        index = index + utf8_length + 1;      
      } else {
        // Write the integer to the char *
        BSON::write_int32((serialized_object + index), str->Length() + 1);
        // Adjust the index
        index = index + 4;
        // Write string to char in utf8 format
        written = DecodeWrite((serialized_object + index), str->Length(), str, BINARY);
        // Add the null termination
        *(serialized_object + index + str->Length()) = '\0';    
        // Adjust the index
        index = index + str->Length() + 1;      
      }       
    } else if(bson->codeString->StrictEquals(constructorString)) {
      // Unpack the object and encode
      Local<Object> obj = value->ToObject();
      // Get the function
      Local<String> function = obj->Get(String::New("code"))->ToString();
      // Get the scope object
      Local<Object> scope = obj->Get(String::New("scope"))->ToObject();

      #if NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION < 6
        uint32_t propertyNameLength = scope->GetPropertyNames()->Length();
      #else
        uint32_t propertyNameLength = scope->GetOwnPropertyNames()->Length();
      #endif

      // Set the right type if we have a scope or not
      if(propertyNameLength > 0) {
        // Set basic data code object with scope object
        *(serialized_object + originalIndex) = BSON_DATA_CODE_W_SCOPE;        

        // Calculate the size of the whole object
        uint32_t scopeSize = BSON::calculate_object_size(bson, scope, false);
        // Decode the function length
        ssize_t len = DecodeBytes(function, UTF8);
        // Calculate total size
        uint32_t size = 4 + len + 1 + 4 + scopeSize;
        
        // Write the total size
        BSON::write_int32((serialized_object + index), size);
        // Adjust the index
        index = index + 4;
        
        // Write the function size
        BSON::write_int32((serialized_object + index), len + 1);
        // Adjust the index
        index = index + 4;

        // Write the data into the serialization stream
        ssize_t written = DecodeWrite((serialized_object + index), len, function, UTF8);      
        // Write \0 for string
        *(serialized_object + index + len) = 0x00;
        // Adjust the index with the length of the function
        index = index + len + 1;
        // Write the scope object
        BSON::serialize(bson, (serialized_object + index), 0, Null(), scope, check_key, serializeFunctions);
        // Adjust the index
        index = index + scopeSize;
      } else {
        // Set basic data code object
        *(serialized_object + originalIndex) = BSON_DATA_CODE;                
        // Decode the function
        ssize_t len = DecodeBytes(function, BINARY);
        // Write the size of the code string + 0 byte end of cString
        BSON::write_int32((serialized_object + index), len + 1);
        // Adjust the index
        index = index + 4;    
        
        // Write the data into the serialization stream
        ssize_t written = DecodeWrite((serialized_object + index), len, function, BINARY);      
        // Write \0 for string
        *(serialized_object + index + len) = 0x00;
        // Adjust the index
        index = index + len + 1;
      }          
    } else if(bson->dbrefString->StrictEquals(constructorString)) {
      // Unpack the dbref
      Local<Object> dbref = value->ToObject();
      // Create an object containing the right namespace variables
      Local<Object> obj = Object::New();

      // Build the new object
      obj->Set(bson->_dbRefRefString, dbref->Get(bson->_dbRefNamespaceString));
      obj->Set(bson->_dbRefIdRefString, dbref->Get(bson->_dbRefOidString));      
      if(!dbref->Get(bson->_dbRefDbString)->IsNull() && !dbref->Get(bson->_dbRefDbString)->IsUndefined()) obj->Set(bson->_dbRefDbRefString, dbref->Get(bson->_dbRefDbString));

      // Encode the variable
      index = BSON::serialize(bson, serialized_object, originalIndex, name, obj, false, serializeFunctions);
    } else if(bson->minKeyString->StrictEquals(constructorString)) {
      // Save the string at the offset provided
      *(serialized_object + originalIndex) = BSON_DATA_MIN_KEY;
    } else if(bson->maxKeyString->StrictEquals(constructorString)) {
      *(serialized_object + originalIndex) = BSON_DATA_MAX_KEY;
    }
  } else if(value->IsObject()) {
    if(!name->IsNull()) {
      // Save the string at the offset provided
      *(serialized_object + index) = BSON_DATA_OBJECT;
      // Adjust writing position for the first byte
      index = index + 1;
      // Convert name to char*
      ssize_t len = DecodeBytes(name, UTF8);
      ssize_t written = DecodeWrite((serialized_object + index), len, name, UTF8);
      // Add null termiation for the string
      *(serialized_object + index + len) = '\0';    
      // Adjust the index
      index = index + len + 1;          
    }
        
    // Unwrap the object
    Local<Object> object = value->ToObject();

    #if NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION < 6
      Local<Array> property_names = object->GetPropertyNames();
    #else
      Local<Array> property_names = object->GetOwnPropertyNames();
    #endif

    // Calculate size of the total object
    uint32_t object_size = BSON::calculate_object_size(bson, value, serializeFunctions);
    // Write the size
    BSON::write_int32((serialized_object + index), object_size);
    // Adjust size
    index = index + 4;    
    
    // Process all the properties on the object
    for(uint32_t i = 0; i < property_names->Length(); i++) {
      // Fetch the property name
      Local<String> property_name = property_names->Get(i)->ToString();      
      // Fetch the object for the property
      Local<Value> property = object->Get(property_name);
      // Write the next serialized object
      // printf("========== !property->IsFunction() || (property->IsFunction() && serializeFunctions) = %d\n", !property->IsFunction() || (property->IsFunction() && serializeFunctions) == true ? 1 : 0);
      if(!property->IsFunction() || (property->IsFunction() && serializeFunctions)) {
        // Convert name to char*
        ssize_t len = DecodeBytes(property_name, UTF8);
        // char *data = new char[len];
        char *data = (char *)malloc(len + 1);
        *(data + len) = '\0';
        ssize_t written = DecodeWrite(data, len, property_name, UTF8);      
        // Serialize the content
        index = BSON::serialize(bson, serialized_object, index, property_name, property, check_key, serializeFunctions);      
        // Free up memory of data
        free(data);
      }
    }
    // Pad the last item
    *(serialized_object + index) = '\0';
    index = index + 1;

    // Null out reminding fields if we have a toplevel object and nested levels
    if(name->IsNull()) {
      for(uint32_t i = 0; i < (object_size - index); i++) {
        *(serialized_object + index + i) = '\0';
      }
    }    
  }
  
  return index;
}

Handle<Value> BSON::SerializeWithBufferAndIndex(const Arguments &args) {
  HandleScope scope;  

  //BSON.serializeWithBufferAndIndex = function serializeWithBufferAndIndex(object, checkKeys, buffer, index) {
  // Ensure we have the correct values
  if(args.Length() > 5) return VException("Four or five parameters required [object, boolean, Buffer, int] or [object, boolean, Buffer, int, boolean]");
  if(args.Length() == 4 && !args[0]->IsObject() && !args[1]->IsBoolean() && !Buffer::HasInstance(args[2]) && !args[3]->IsUint32()) return VException("Four parameters required [object, boolean, Buffer, int]");
  if(args.Length() == 5 && !args[0]->IsObject() && !args[1]->IsBoolean() && !Buffer::HasInstance(args[2]) && !args[3]->IsUint32() && !args[4]->IsBoolean()) return VException("Four parameters required [object, boolean, Buffer, int, boolean]");

  // Unpack the BSON parser instance
  BSON *bson = ObjectWrap::Unwrap<BSON>(args.This());  

  // Define pointer to data
  char *data;
  uint32_t length;      
  // Unpack the object
  Local<Object> obj = args[2]->ToObject();

  // Unpack the buffer object and get pointers to structures
  #if NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION < 3
    Buffer *buffer = ObjectWrap::Unwrap<Buffer>(obj);
    data = buffer->data();
    length = buffer->length();
  #else
    data = Buffer::Data(obj);
    length = Buffer::Length(obj);
  #endif
  
  uint32_t object_size = 0;
  // Calculate the total size of the document in binary form to ensure we only allocate memory once
  if(args.Length() == 5) {
    object_size = BSON::calculate_object_size(bson, args[0], args[4]->BooleanValue());    
  } else {
    object_size = BSON::calculate_object_size(bson, args[0], false);    
  }
  
  // Unpack the index variable
  Local<Uint32> indexObject = args[3]->ToUint32();
  uint32_t index = indexObject->Value();

  // Allocate the memory needed for the serializtion
  char *serialized_object = (char *)malloc(object_size * sizeof(char));  

  // Catch any errors
  try {
    // Check if we have a boolean value
    bool check_key = false;
    if(args.Length() >= 4 && args[1]->IsBoolean()) {
      check_key = args[1]->BooleanValue();
    }
    
    bool serializeFunctions = false;
    if(args.Length() == 5) {
      serializeFunctions = args[4]->BooleanValue();
    }
    
    // Serialize the object
    BSON::serialize(bson, serialized_object, 0, Null(), args[0], check_key, serializeFunctions);
  } catch(char *err_msg) {
    // Free up serialized object space
    free(serialized_object);
    V8::AdjustAmountOfExternalAllocatedMemory(-object_size);
    // Throw exception with the string
    Handle<Value> error = VException(err_msg);
    // free error message
    free(err_msg);
    // Return error
    return error;
  }

  for(int i = 0; i < object_size; i++) {
    *(data + index + i) = *(serialized_object + i);
  }
  
  return scope.Close(Uint32::New(index + object_size - 1));
}

Handle<Value> BSON::BSONDeserializeStream(const Arguments &args) {
	HandleScope scope;
	
	// At least 3 arguments required
	if(args.Length() < 5)	VException("Arguments required (Buffer(data), Number(index in data), Number(number of documents to deserialize), Array(results), Number(index in the array), Object(optional))");
	
	// If the number of argumets equals 3
	if(args.Length() >= 5) {
		if(!Buffer::HasInstance(args[0])) return VException("First argument must be Buffer instance");
		if(!args[1]->IsUint32()) return VException("Second argument must be a positive index number");
		if(!args[2]->IsUint32()) return VException("Third argument must be a positive number of documents to deserialize");
		if(!args[3]->IsArray()) return VException("Fourth argument must be an array the size of documents to deserialize");
		if(!args[4]->IsUint32()) return VException("Sixth argument must be a positive index number");
	}
	
	// If we have 4 arguments
	if(args.Length() == 6 && !args[5]->IsObject()) return VException("Fifth argument must be an object with options");

  // Define pointer to data
  char *data;
  uint32_t length;      
  Local<Object> obj = args[0]->ToObject();
  uint32_t numberOfDocuments = args[2]->ToUint32()->Value();
  uint32_t index = args[1]->ToUint32()->Value();
  uint32_t resultIndex = args[4]->ToUint32()->Value();

  // Unpack the BSON parser instance
  BSON *bson = ObjectWrap::Unwrap<BSON>(args.This());  

  // Unpack the buffer variable
  #if NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION < 3
   Buffer *buffer = ObjectWrap::Unwrap<Buffer>(obj);
   data = buffer->data();
   length = buffer->length();
  #else
   data = Buffer::Data(obj);
   length = Buffer::Length(obj);
  #endif

   // Fetch the documents
  Local<Object> documents = args[3]->ToObject();
  
  for(uint32_t i = 0; i < numberOfDocuments; i++) {
    // Decode the size of the BSON data structure
    uint32_t size = BSON::deserialize_int32(data, index);
    
    // Get result
    Handle<Value> result = BSON::deserialize(bson, data, index, NULL);
    
    // Add result to array
    documents->Set(i + resultIndex, result);
    
    // Adjust the index for next pass
    index = index + size;
  }
	
	// Return new index of parsing
	return scope.Close(Uint32::New(index));
}

// Exporting function
extern "C" void init(Handle<Object> target) {
  HandleScope scope;
  BSON::Initialize(target);
}

// NODE_MODULE(bson, BSON::Initialize);
// NODE_MODULE(l, Long::Initialize);

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

#include "objectid.h"

static Handle<Value> VException(const char *msg) {
    HandleScope scope;
    return ThrowException(Exception::Error(String::New(msg)));
  };

Persistent<FunctionTemplate> ObjectID::constructor_template;

ObjectID::ObjectID(char *oid) : ObjectWrap() {
  this->oid = oid;
}

ObjectID::~ObjectID() {}

char *ObjectID::uint32_to_char(uint32_t value) {
  char *buf = (char *) malloc(4 * sizeof(char) + 1);
  *(buf) = (char)(value & 0xff);
  *(buf + 1) = (char)((value >> 8) & 0xff);
  *(buf + 2) = (char)((value >> 16) & 0xff);
  *(buf + 3) = (char)((value >> 24) & 0xff);
  *(buf + 4) = '\0';
  return buf;
}

// Generates a new oid
char *ObjectID::oid_id_generator() {
  // Blatant copy of the code from mongodb-c driver
  static int incr = 0;
  int fuzz = 0;
  // Fetch a new counter ()
  int i = incr++; /*TODO make atomic*/
  int t = time(NULL);
  
  /* TODO rand sucks. find something better */
  if (!fuzz){
    srand(t);
    fuzz = rand();
  }
  
  // Build a 12 byte char string based on the address of the current object, the rand number and the current time
  char *oid_string_c = (char *)malloc(12 * sizeof(char) + 1);
  *(oid_string_c + 13) = '\0';
  
  // Fetch the address int value from the variable t
  int *m_p = &t;
  int *i_p = &i;  
  // Build the string
  memcpy(oid_string_c, ObjectID::uint32_to_char(t), 4);
  memcpy((oid_string_c + 4), ObjectID::uint32_to_char(fuzz), 4);
  memcpy((oid_string_c + 8), ObjectID::uint32_to_char(i), 4);
  // Allocate storage for a 24 character hex oid    
  char *oid_string = (char *)malloc(12 * 2 * sizeof(char) + 1);
  char *pbuffer = oid_string;      
  // Terminate the string
  *(pbuffer + 25) = '\0';      
  // Unpack the oid in hex form
  for(int32_t i = 0; i < 12; i++) {
    sprintf(pbuffer, "%02x", (unsigned char)*(oid_string_c + i));
    pbuffer += 2;
  }        
  
  // Free c string
  free(oid_string_c);
  // Return encoded hex string
  return oid_string;
}

Handle<Value> ObjectID::New(const Arguments &args) {
  HandleScope scope;
  
  // If no arguments are passed in we generate a new ID automagically
  if(args.Length() == 0) {
    // Instantiate a ObjectID object
    char *oid_string = ObjectID::oid_id_generator();
    ObjectID *oid = new ObjectID(oid_string);
    // Wrap it
    oid->Wrap(args.This());
    // Return the object
    return args.This();        
  } else {
    // Ensure we have correct parameters passed in
    if(args.Length() != 1 && !args[0]->IsString()) {
      return VException("Argument passed in must be a single String of 12 bytes or a string of 24 hex characters in hex format");
    }

    // Convert the argument to a String
    Local<String> oid_string = args[0]->ToString();  
    if(oid_string->Length() != 12 && oid_string->Length() != 24) {
      return VException("Argument passed in must be a single String of 12 bytes or a string of 24 hex characters in hex format");
    }
  
    // Contains the final oid string
    char *oid_string_c = (char *)malloc(25);;
    // Terminate the string
    *(oid_string_c + 25) = '\0';      
  
    if(oid_string->Length() == 12) {    
      // Contains the bytes for the string
      char *oid_string_bytes = (char *)malloc(13);
      // Decode the 12 bytes of the oid
      node::DecodeWrite(oid_string_bytes, 13, oid_string, node::BINARY);    
      // Unpack the String object to char*
      char *pbuffer = oid_string_c;      
      // Unpack the oid in hex form
      for(int32_t i = 0; i < 12; i++) {
        sprintf(pbuffer, "%02x", (unsigned char)*(oid_string_bytes + i));
        pbuffer += 2;
      }          
    } else {
      // Decode the content
      node::DecodeWrite(oid_string_c, 25, oid_string, node::BINARY);        
    }
  
    // Instantiate a ObjectID object
    ObjectID *oid = new ObjectID(oid_string_c);
    // Wrap it
    oid->Wrap(args.This());
    // Return the object
    return args.This();    
  }  
}

void ObjectID::Initialize(Handle<Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("ObjectID"));
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toString", ToString);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "inspect", Inspect);  
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toHexString", ToHexString);  

  target->Set(String::NewSymbol("ObjectID"), constructor_template->GetFunction());
}

Handle<Value> ObjectID::ToHexString(const Arguments &args) {
  HandleScope scope;
  
  // Unpack the ObjectID instance
  ObjectID *oid = ObjectWrap::Unwrap<ObjectID>(args.This());  
  // Return the id
  return String::New(oid->oid);  
}

Handle<Value> ObjectID::Inspect(const Arguments &args) {
  HandleScope scope;
  
  // Unpack the ObjectID instance
  ObjectID *oid = ObjectWrap::Unwrap<ObjectID>(args.This());  
  // Return the id
  return String::New(oid->oid);
}

Handle<Value> ObjectID::ToString(const Arguments &args) {
  HandleScope scope;

  // Unpack the ObjectID instance
  ObjectID *oid = ObjectWrap::Unwrap<ObjectID>(args.This());  
  // Return the id
  return String::New(oid->oid);
}










#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <v8.h>
#include <node.h>
#include <node_buffer.h>
#include <cstring>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>

#include "symbol.h"

static Handle<Value> VException(const char *msg) {
  HandleScope scope;
  return ThrowException(Exception::Error(String::New(msg)));
};

Persistent<FunctionTemplate> Symbol::constructor_template;

Symbol::Symbol(Persistent<Object> value) : ObjectWrap() {
  this->value = value;
}

Symbol::~Symbol() {
}

Handle<Value> Symbol::New(const Arguments &args) {
  HandleScope scope;  
  Persistent<Object> symbol;
  
  if(args.Length() != 1 && !args[0]->IsString()) {
    return VException("There must be 1 argument passed in where the first argument is a string");
  }
  
  // Decode the string
  symbol = Persistent<Object>::New(args[0]->ToObject());
  // Create code object
  Symbol *symbol_obj = new Symbol(symbol);
  // Wrap it
  symbol_obj->Wrap(args.This());
  // Return the object
  return args.This();    
}

static Persistent<String> value_symbol;

void Symbol::Initialize(Handle<Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("Symbol"));
  
  // Propertry symbols
  value_symbol = NODE_PSYMBOL("value");

  // Getters for correct serialization of the object  
  constructor_template->InstanceTemplate()->SetAccessor(value_symbol, ValueGetter, ValueSetter);
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toString", ToString);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "inspect", Inspect);  
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toJSON", ToJSON);

  target->Set(String::NewSymbol("Symbol"), constructor_template->GetFunction());
}

Handle<Value> Symbol::ValueGetter(Local<String> property, const AccessorInfo& info) {
  HandleScope scope;
  
  // Unpack the long object
  Symbol *symbol_obj = ObjectWrap::Unwrap<Symbol>(info.Holder());
  // Extract value doing a cast of the pointer to Long and accessing code
  // char *value = symbol_obj->value;
  // Return the string
  return scope.Close(symbol_obj->value);
}

void Symbol::ValueSetter(Local<String> property, Local<Value> value, const AccessorInfo& info) {
  // if(value->IsString()) {
  //   // Unpack the long object
  //   Symbol *symbol_obj = ObjectWrap::Unwrap<Symbol>(info.Holder());
  //   // Convert the value to a string
  //   Local<String> str = value->ToString();
  //   // Set up the string
  //   char *symbol = (char *)malloc(str->Length() * sizeof(char) + 1);
  //   *(symbol + str->Length()) = '\0';
  //   // Copy over
  //   node::DecodeWrite(symbol, str->Length(), str, node::BINARY);  
  //   // Free existing pointer if any
  //   if(symbol_obj->value != NULL) free(symbol_obj->value);
  //   // Return the code
  //   symbol_obj->value = symbol;
  // }
}

Handle<Value> Symbol::Inspect(const Arguments &args) {
  return Symbol::ToString(args);
}

Handle<Value> Symbol::ToString(const Arguments &args) {
  HandleScope scope;

  // Unpack the Binary object
  Symbol *symbol_obj = ObjectWrap::Unwrap<Symbol>(args.This());
  // Return the raw data  
  // return String::New(symbol_obj->value);
  return symbol_obj->value;
}

Handle<Value> Symbol::ToJSON(const Arguments &args) {
  return Symbol::ToString(args);
}











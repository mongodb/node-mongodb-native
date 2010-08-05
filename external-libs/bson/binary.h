#ifndef BINARY_H_
#define BINARY_H_

#include <node.h>
#include <node_object_wrap.h>
#include <v8.h>

using namespace v8;
using namespace node;

class Binary : public ObjectWrap {  
  public:
    char *data;
    uint32_t sub_type;
    
    Binary(uint32_t sub_type, char *data);
    ~Binary();    

    // Functions available from V8
    static void Initialize(Handle<Object> target);    
    static Handle<Value> ToString(const Arguments &args);
    static Handle<Value> Inspect(const Arguments &args);
    static Handle<Value> Data(const Arguments &args);

    // Constructor used for creating new Long objects from C++
    static Persistent<FunctionTemplate> constructor_template;
    
  private:
    static Handle<Value> New(const Arguments &args);
};

#endif  // BINARY_H_
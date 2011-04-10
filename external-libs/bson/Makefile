
NODE = node
name = all

# To allow building on platforms with ridiculously little memory.
JOBS ?= 16

all:
	rm -rf build .lock-wscript bson.node
	node-waf -j$(JOBS) configure build
	@$(NODE) test_bson.js
	@$(NODE) test_full_bson.js

test:
	@$(NODE) test_bson.js
	@$(NODE) test_full_bson.js

clean:
	rm -rf build .lock-wscript bson.node
	
.PHONY: all
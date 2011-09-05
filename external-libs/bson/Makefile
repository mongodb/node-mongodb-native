
NODE = node
name = all
JOBS = 1

all:
	rm -rf build .lock-wscript bson.node
	node-waf configure build
	#cp -R ./build/Release/bson.node .
	@$(NODE) --expose-gc test_bson.js
	@$(NODE) --expose-gc test_full_bson.js

test:
	@$(NODE) --expose-gc test_bson.js
	@$(NODE) --expose-gc test_full_bson.js

clean:
	rm -rf build .lock-wscript bson.node

.PHONY: all
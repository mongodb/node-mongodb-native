YAML_FILES=$(shell find . -iname '*.yml')
JSON_FILES=$(patsubst %.yml,%.json,$(YAML_FILES))

all: $(JSON_FILES)

%.json : %.yml
	jwc yaml2json $< > $@


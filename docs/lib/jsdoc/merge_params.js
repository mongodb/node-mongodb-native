'use strict';

exports.defineTags = function(dictionary) {
  dictionary.defineTag('mergeProps', {
    mustHaveValue: true,
    canHaveName: true,
    onTagged: function(doclet, tag) {
      doclet.mergeProps = doclet.mergeProps || [];
      doclet.mergeProps.push(tag.value.name);
    }
  });

  dictionary.defineTag('mergeParams', {
    mustHaveValue: true,
    canHaveType: true,
    canHaveName: true,
    onTagged: function(doclet, tag) {
      doclet.mergeParams = doclet.mergeParams || [];
      doclet.mergeParams.push(tag.value);

      doclet.params = doclet.params || [];
      doclet.params.push(tag.value || {});
    }
  });
};

exports.handlers = {
  parseComplete: function(options) {
    const doclets = options.doclets;
    const DOCLET_MAP = new Map();

    doclets.forEach(doclet => {
      DOCLET_MAP.set(doclet.longname, doclet);
    });

    doclets.forEach(function tapDoclet(doclet) {
      doclet.tapped = true;
      if (doclet.mergeProps) {
        doclet.mergeProps.forEach(name => {
          const target = DOCLET_MAP.get(name);
          if (!target) {
            return;
          }
          if (!target.tapped) {
            tapDoclet(target);
          }
          if (!target.properties) {
            return;
          }

          doclet.properties = doclet.properties || [];
          const propertySet = new Set(doclet.properties.map(prop => prop.name));

          target.properties.forEach(prop => {
            if (!propertySet.has(prop.name)) {
              propertySet.add(prop.name);
              doclet.properties.push(prop);
            }
          });
        });
      }
      if (doclet.mergeParams && doclet.params) {
        doclet.mergeParams.forEach(tag => {
          const name = tag.name;
          const type = tag.type && tag.type.names && tag.type.names[0];
          const index = doclet.params.findIndex(param => param.name === name);
          const target = DOCLET_MAP.get(type);
          if (index < 0 || !target) {
            return;
          }
          if (!target.tapped) {
            tapDoclet(target);
          }
          if (!target.properties) {
            return;
          }

          const firstParams = doclet.params.slice(0, index + 1);
          const lastParams = doclet.params.slice(index + 1);
          const newParams = target.properties.map(prop => {
            const newName = `${name}.${prop.name}`;
            return Object.assign({}, prop, { name: newName });
          });

          doclet.params = firstParams.concat(newParams).concat(lastParams);
        });
      }
    });
  }
};

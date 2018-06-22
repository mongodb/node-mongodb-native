'use strict';

const requireOptional = require('require_optional');

let Kerberos = null;
let MongoAuthProcess = null;

try {
  const kerberos = requireOptional('kerberos');
  if (kerberos) {
    Kerberos = kerberos.Kerberos;
    MongoAuthProcess = kerberos.processes.MongoAuthProcess;
  }
} catch (err) {
  console.warn(err.message);
}

module.exports = { Kerberos, MongoAuthProcess };

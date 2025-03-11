import fs from 'fs/promises';
import util from 'util';

const API_PATH = 'https://performance-monitoring-api.corp.mongodb.com/raw_perf_results';

const resultFile = process.argv[2];
if (resultFile == null) {
  throw new Error('Must specify result file');
}

// Get expansions
const {
  execution,
  requester,
  project,
  task_id,
  task_name,
  revision_order_id,
  build_variant: variant,
  version_id: version
} = process.env;

const orderSplit = revision_order_id?.split('_');
const order = Number(orderSplit ? orderSplit[orderSplit.length - 1] : undefined);

if (!Number.isInteger(order)) throw new Error(`Failed to parse integer from order, revision_order_id=${revision_order_id}`);

const results = JSON.parse(await fs.readFile(resultFile, 'utf8'));

// FIXME(NODE-6838): We are using dummy dates here just to be able to successfully post our results
for (const r of results) {
  r.created_at = new Date().toISOString();
  r.completed_at = new Date().toISOString();
}

const body = {
  id: {
    project,
    version,
    variant,
    order,
    task_name,
    task_id,
    execution,
    mainline: requester === 'commit'
  },
  results
};

console.log('POST', util.inspect(body, { depth: Infinity }));

const resp = await fetch(API_PATH, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    accept: 'application/json'
  },
  body: JSON.stringify(body)
});

const responseText = await resp.text();
let jsonResponse = null;
try {
  jsonResponse = JSON.parse(responseText)
} catch (cause) {
  console.log('Failed to parse json response', cause);
}

console.log(resp.statusText, util.inspect(jsonResponse ?? responseText, { depth: Infinity }));

if (jsonResponse.message == null) throw new Error("Didn't get success message");

console.log(jsonResponse.message);

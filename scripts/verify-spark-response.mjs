import fs from 'node:fs';
import assert from 'node:assert/strict';
const [bodyPath,transportPath]=process.argv.slice(2);
assert.ok(bodyPath&&transportPath,'Expected HTML and transport files');
const body=fs.readFileSync(bodyPath,'utf8');
const transport=fs.readFileSync(transportPath,'utf8');
const status=transport.match(/status=(\d+)/)?.[1];
if(status!=='200')throw Error('HTTP status was '+(status||'unknown')+', not 200');
if(/Sorry, unable to open the file|Sign in to continue|You need access|Request access/i.test(body))throw Error('Google access/error page delivered');
const markers=['Reasoning Opportunity Builder','id="page1"','id="p1"'];
if(!body.includes(markers[0])||!(body.includes(markers[1])||body.includes(markers[2]))){
 throw Error('HTTP 200 received, but not SPARK application HTML. Google may have served a wrapper/login/redirect.');
}
console.log('SPARK HTML identity validated from anonymous response');

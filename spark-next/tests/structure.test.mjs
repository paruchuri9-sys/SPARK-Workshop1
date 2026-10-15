import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

test('frontend and server JavaScript parse',()=>{
 const ui=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const api=fs.readFileSync(new URL('../netlify/functions/api.mjs',import.meta.url),'utf8');
 new vm.Script(ui);
 execFileSync(process.execPath,['--check',new URL('../netlify/functions/api.mjs',import.meta.url).pathname]);
});
test('schema and research audit fields present',()=>{
 const sql=fs.readFileSync(new URL('../netlify/database/migrations/20261015000100_initial_spark_events.sql',import.meta.url),'utf8');
 for(const field of ['session_id','event_type','design_version','reasoner_version','build_id','created_at','payload'])assert.match(sql,new RegExp(field));
});
test('application has three steps and action control',()=>{
 const page=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const id of ['source','opportunities','result','lesson','analyze','build'])assert.ok(page.includes('id="'+id+'"'));
});

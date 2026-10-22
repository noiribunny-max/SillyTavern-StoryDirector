import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {vmSource} from './vm-support.mjs';
const c={window:{},document:{getElementById:()=>null},console};vm.createContext(c);vm.runInContext(vmSource(fs.readFileSync(new URL('../index.js',import.meta.url),'utf8')),c);
const run=s=>vm.runInContext(s,c);
test('calendar validates dates and handles small years without 1900 offset',()=>{
 assert.equal(run("parseStoryDirectorDate('01.01.0012').date.getUTCFullYear()"),12);
 assert.equal(run("parseStoryDirectorDate('31.02.2026')"),null);
 assert.equal(run("parseStoryDirectorDate('29.02.2024').day"),29);
 assert.equal(run("parseStoryDirectorDate('29.02.2025')"),null);
});
test('month/year arithmetic clamps end-of-month and preserves XX conventions',()=>{
 assert.equal(run("formatStoryDirectorDate(addStoryDirectorDuration(parseStoryDirectorDate('31.01.2026'),1,'months'))"),'28.02.2026');
 assert.equal(run("formatStoryDirectorDate(addStoryDirectorDuration(parseStoryDirectorDate('29.02.2024'),1,'years'))"),'28.02.2025');
 assert.equal(run("formatStoryDirectorDate(addStoryDirectorDuration(parseStoryDirectorDate('31.12.XX12'),1,'days'))"),'01.01.XX13');
 assert.equal(run("getStoryDirectorDateDifference(parseStoryDirectorDate('28.02.2024'),parseStoryDirectorDate('01.03.2024'))"),2);
 assert.equal(run("addStoryDirectorDuration(parseStoryDirectorDate('01.01.2026'),1.5,'months')"),null);
});

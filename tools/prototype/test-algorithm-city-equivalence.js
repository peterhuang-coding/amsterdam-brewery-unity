'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const City = require('./reopening-city.js');

const fixturePath = path.join(__dirname, 'fixtures', 'algorithms', 'city-routes.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

assert.ok(fixture && typeof fixture.sourceCommit === 'string', 'city route fixture must include sourceCommit');
assert.ok(Array.isArray(fixture.cases), 'city route fixture must include cases');

for (const [index, testCase] of fixture.cases.entries()) {
  assert.ok(testCase && typeof testCase.from === 'object',
    `case ${index} has a valid from point`);
  assert.ok(testCase.to && typeof testCase.to === 'object',
    `case ${index} has a valid to point`);
  assert.ok(Array.isArray(testCase.path), `case ${index} has a baseline path`);

  test(`city route ${fixture.sourceCommit} case ${index}: (${testCase.from.x},${testCase.from.y}) -> (${testCase.to.x},${testCase.to.y})`, () => {
    const actual = City.route(testCase.from, testCase.to);
    assert.deepStrictEqual(actual, testCase.path);
  });
}

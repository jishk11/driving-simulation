import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSignedDirection, wayTravelDirection, headingDifference } from '../src/utils/highwayDirection.ts';

const way = { id: 10, tags: { highway: 'motorway', ref: 'I 5' } };
const relation = (role, direction, ref = '5', network = 'US:I') => ({
  tags: { type: 'route', route: 'road', ref, network, direction },
  members: [{ type: 'way', ref: 10, role }],
});
const resolve = (relations, overrides = {}) => resolveSignedDirection(
  overrides.way ?? way, relations, overrides.ref ?? 'I 5',
  overrides.segment ?? 90, overrides.heading ?? 90,
);

test('I-5 NORTH stays north on a geographically eastbound bend', () => {
  assert.equal(resolve([relation('north')]), 'NORTH');
});
test('directional relations preserve the signed southbound direction', () => {
  assert.equal(resolve([relation('', 'south')]), 'SOUTH');
});
test('missing metadata does not turn an eastbound bend into EAST', () => {
  assert.equal(resolve([]), null);
});
test('later metadata corrects an unknown direction on the same reference', () => {
  assert.equal(resolve([]), null);
  assert.equal(resolve([relation('north')]), 'NORTH');
  assert.equal(resolve([relation('south')]), 'SOUTH');
});
test('concurrent highway metadata does not leak into the displayed highway', () => {
  assert.equal(resolve([relation('east', undefined, '10'), relation('north')]), 'NORTH');
  assert.equal(resolve([relation('east', undefined, '5', 'US:US')]), null);
  assert.equal(resolve([relation('north')], { ref: 'I-5;US 101' }), 'NORTH');
});
test('unrelated membership and conflicting metadata remain unknown', () => {
  const other = relation('north');
  other.members[0].ref = 11;
  assert.equal(resolve([other]), null);
  assert.equal(resolve([relation('north'), relation('south')]), null);
  assert.equal(resolve([relation('north', 'south')]), null);
});
test('opposite carriageway is rejected; reverse-digitized one-way is supported', () => {
  assert.equal(resolve([relation('north')], { heading: 270 }), null);
  const reverseWay = { ...way, tags: { ...way.tags, oneway: '-1' } };
  assert.equal(resolve([relation('north')], { way: reverseWay, heading: 270 }), 'NORTH');
});
test('two-way directional relations require matching forward/backward roles', () => {
  const twoWay = { ...way, tags: { ...way.tags, oneway: 'no' } };
  const relations = [relation('forward', 'north'), relation('backward', 'south')];
  assert.equal(resolve(relations, { way: twoWay }), 'NORTH');
  assert.equal(resolve(relations, { way: twoWay, heading: 270 }), 'SOUTH');
  assert.equal(resolve([relation('north')], { way: twoWay }), null);
  assert.equal(resolve([relation('', 'north')], { way: twoWay }), null);
});
test('names are not parsed as direction; unknown roles do not imply direction', () => {
  const named = relation('');
  named.tags.name = 'North Coast Highway';
  assert.equal(resolve([named]), null);
  assert.equal(resolve([relation('alternate', 'north')]), null);
});
test('legal orientation and heading differences handle explicit overrides and wraparound', () => {
  assert.equal(wayTravelDirection({ highway: 'motorway' }), 1);
  assert.equal(wayTravelDirection({ highway: 'motorway', oneway: 'no' }), 0);
  assert.equal(wayTravelDirection({ highway: 'motorway_link' }), 0);
  assert.equal(headingDifference(359, 1), 2);
  assert.equal(resolve([relation('north')], { segment: 359, heading: 1 }), 'NORTH');
});

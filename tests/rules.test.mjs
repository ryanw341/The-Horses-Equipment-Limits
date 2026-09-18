import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, discoverCategories, equipmentViolations, itemCost,
  weaponGroup, attunementViolation } from '../scripts/rules.js';
import { reportHtml } from '../scripts/messages.js';

const equipment = (id, category = 'ring', equipped = true) => ({
  _id: id, name: id, type: 'equipment', system: { type: { value: category }, equipped }
});
const weapon = (id, type = 'martialM', properties = []) => ({
  _id: id, name: id, type: 'weapon', system: { type: { value: type }, equipped: true, properties }
});
function config() {
  const value = defaultConfig();
  value.equipment.ring = { enabled: true, limit: 2 };
  value.weapons.melee = { enabled: true, limit: 2 };
  value.weapons.ranged = { enabled: true, limit: 1 };
  return value;
}

test('allows exactly the limit and reports the existing items above it', () => {
  const first = equipment('First ring'), second = equipment('Second ring'), third = equipment('Third ring');
  assert.deepEqual(equipmentViolations([first], [first, second], config()), []);
  const [error] = equipmentViolations([first, second], [first, second, third], config());
  assert.equal(error.limit, 2);
  assert.equal(error.after, 3);
  assert.deepEqual(error.existing.map(i => i.name), ['First ring', 'Second ring']);
});

test('disabled categories and the master switch are unrestricted', () => {
  const items = [equipment('a'), equipment('b'), equipment('c')];
  const disabled = config();
  disabled.equipment.ring.enabled = false;
  assert.deepEqual(equipmentViolations([], items, disabled), []);
  disabled.equipment.ring.enabled = true;
  disabled.enabled = false;
  assert.deepEqual(equipmentViolations([], items, disabled), []);
});

test('zero is a valid limit and unequipped items never count', () => {
  const rules = config();
  rules.equipment.ring.limit = 0;
  assert.equal(equipmentViolations([], [equipment('a')], rules).length, 1);
  assert.deepEqual(equipmentViolations([], [equipment('a', 'ring', false)], rules), []);
});

test('equipment categories are independent, including arbitrary custom IDs', () => {
  const rules = config();
  rules.equipment['custom.cloak:rare'] = { enabled: true, limit: 1 };
  const items = [equipment('r1'), equipment('r2'), equipment('c1', 'custom.cloak:rare')];
  assert.deepEqual(equipmentViolations([], items, rules), []);
  const [error] = equipmentViolations(items, [...items, equipment('c2', 'custom.cloak:rare')], rules);
  assert.equal(error.key, 'equipment:custom.cloak:rare');
});

test('item stacks count as one equipped entry', () => {
  const item = equipment('a');
  item.system.quantity = 20;
  assert.deepEqual(equipmentViolations([], [item], config()), []);
});

test('melee and ranged weapon limits are separate', () => {
  const items = [weapon('s1'), weapon('s2'), weapon('bow', 'martialR')];
  assert.deepEqual(equipmentViolations([], items, config()), []);
  assert.equal(equipmentViolations(items, [...items, weapon('crossbow', 'simpleR')], config())[0].key, 'weapon:ranged');
});

test('thrown melee weapons remain melee', () => {
  assert.equal(weaponGroup(weapon('dagger', 'simpleM', ['thr']), config()), 'melee');
});

test('each weighting option works independently and the options never stack', () => {
  const heavy = weapon('heavy', 'martialM', new Set(['hvy']));
  const two = weapon('two', 'martialM', ['two']);
  const both = weapon('both', 'martialM', ['two', 'hvy']);
  const rules = config();
  assert.equal(itemCost(both, rules), 1);
  rules.heavyCountsTwo = true;
  assert.equal(itemCost(heavy, rules), 2);
  assert.equal(itemCost(two, rules), 1);
  rules.heavyCountsTwo = false;
  rules.twoHandedCountsTwo = true;
  assert.equal(itemCost(heavy, rules), 1);
  assert.equal(itemCost(two, rules), 2);
  rules.heavyCountsTwo = true;
  assert.equal(itemCost(both, rules), 2);
});

test('weighted weapons consume slots in their own weapon group', () => {
  const rules = config();
  rules.heavyCountsTwo = true;
  const sword = weapon('greatsword', 'martialM', ['hvy']);
  assert.deepEqual(equipmentViolations([], [sword], rules), []);
  assert.equal(equipmentViolations([sword], [sword, weapon('dagger')], rules)[0].after, 3);
  assert.equal(equipmentViolations([], [weapon('bow', 'martialR', ['hvy'])], rules)[0].after, 2);
});

test('Light half-slot counting is optional, accepts property formats, and only affects weapons', () => {
  const rules = config(), dagger = weapon('dagger', 'simpleM', ['lgt']);
  assert.equal(rules.lightCountsHalf, false);
  assert.equal(itemCost(dagger, rules), 1);
  delete rules.lightCountsHalf;
  assert.equal(itemCost(dagger, rules), 1, 'Older saved settings retain the original counting');
  rules.lightCountsHalf = true;
  for (const properties of [['lgt'], new Set(['lgt']), { lgt: true }]) {
    assert.equal(itemCost(weapon('light', 'simpleM', properties), rules), 0.5);
  }
  dagger.system.quantity = 20;
  assert.equal(itemCost(dagger, rules), 0.5);
  assert.equal(itemCost(weapon('ordinary'), rules), 1);
  const armor = equipment('leather', 'light'); armor.system.properties = ['lgt'];
  assert.equal(itemCost(armor, rules), 1);
});

test('enabled two-slot rules take priority over Light without stacking', () => {
  const rules = config(); rules.lightCountsHalf = true;
  const lightHeavy = weapon('custom-heavy', 'martialM', ['lgt', 'hvy']);
  const lightTwo = weapon('custom-two', 'martialM', ['lgt', 'two']);
  assert.equal(itemCost(lightHeavy, rules), 0.5);
  assert.equal(itemCost(lightTwo, rules), 0.5);
  rules.heavyCountsTwo = true;
  assert.equal(itemCost(lightHeavy, rules), 2);
  assert.equal(itemCost(lightTwo, rules), 0.5);
  rules.heavyCountsTwo = false; rules.twoHandedCountsTwo = true;
  assert.equal(itemCost(lightHeavy, rules), 0.5);
  assert.equal(itemCost(lightTwo, rules), 2);
  rules.heavyCountsTwo = true;
  assert.equal(itemCost(weapon('all', 'martialM', ['lgt', 'hvy', 'two']), rules), 2);
});

test('two Light weapons fit one slot in either group and warnings retain half-slot costs', () => {
  const rules = config(); rules.lightCountsHalf = true; rules.weapons.melee.limit = 1;
  for (const type of ['simpleM', 'simpleR']) {
    const weapons = ['first', 'second', 'third'].map(id => weapon(id, type, ['lgt']));
    assert.deepEqual(equipmentViolations([], weapons.slice(0, 2), rules), []);
    const errors = equipmentViolations(weapons.slice(0, 2), weapons, rules);
    assert.equal(errors[0].before, 1);
    assert.equal(errors[0].after, 1.5);
    assert.equal(errors[0].limit, 1);
    assert.equal(errors[0].key, type === 'simpleM' ? 'weapon:melee' : 'weapon:ranged');
    assert.match(reportHtml('Hero', errors, null, true, { equipment: [] }), /counts as 0\.5/);
    assert.deepEqual(equipmentViolations(weapons, weapons.slice(0, 2), rules), []);
  }
});

test('decreasing an already excessive loadout and unrelated edits remain allowed', () => {
  const items = [equipment('a'), equipment('b'), equipment('c'), equipment('d')];
  assert.deepEqual(equipmentViolations(items, items.slice(0, 3), config()), []);
  assert.deepEqual(equipmentViolations(items, items.map(i => ({ ...i, name: 'renamed' })), config()), []);
});

test('bulk equips cannot exceed the limit and a bulk swap at capacity is allowed', () => {
  const first = equipment('a'), second = equipment('b'), third = equipment('c');
  assert.equal(equipmentViolations([first], [first, second, third], config()).length, 1);
  assert.deepEqual(equipmentViolations([first, second], [first, third], config()), []);
});

test('changing category or weapon properties on an equipped item rechecks the limit', () => {
  const rings = [equipment('a'), equipment('b')];
  assert.equal(equipmentViolations([...rings, equipment('c', 'clothing')], [...rings, equipment('c')], config()).length, 1);
  const rules = config(); rules.heavyCountsTwo = true;
  assert.equal(equipmentViolations([weapon('a'), weapon('b')], [weapon('a', 'martialM', ['hvy']), weapon('b')], rules).length, 1);
});

test('attunement uses actor maximum, counts unequipped attuned items, and only warns on increases', () => {
  const attuned = id => ({ ...equipment(id, 'ring', false), system: { attuned: true, equipped: false } });
  const items = ['a', 'b', 'c', 'd'].map(attuned);
  assert.equal(attunementViolation(items.slice(0, 3), items, 3).after, 4);
  assert.equal(attunementViolation(items.slice(0, 3), items, 6), null);
  assert.equal(attunementViolation(items, items.slice(0, 3), 2), null);
  assert.equal(attunementViolation(items, items, 3), null);
  assert.equal(attunementViolation([], [attuned('a')], 0).limit, 0);
  assert.equal(attunementViolation([], items, undefined), null);
  assert.equal(attunementViolation([], [{ system: { attunement: 'required', attuned: false } }], 0), null);
});

test('scans system configuration, custom item types, and saved rules without duplicates', () => {
  const rules = config();
  rules.equipment.old = { label: 'Old category', enabled: true, limit: 1 };
  const discovered = discoverCategories({ equipmentTypes: { ring: 'RING', cloak: { label: 'Cloaks' } },
    miscEquipmentTypes: { gloves: 'Gloves' }, weaponTypes: { laser: 'Laser' } },
  [equipment('ring'), equipment('other', 'custom'), equipment('other2', 'custom')], rules,
  label => label === 'RING' ? 'Rings' : label);
  assert.equal(discovered.equipment.filter(i => i.key === 'custom').length, 1);
  assert.equal(discovered.equipment.find(i => i.key === 'ring').label, 'Rings');
  assert.ok(discovered.equipment.some(i => i.key === 'gloves'));
  assert.ok(discovered.equipment.some(i => i.key === 'old'));
  assert.ok(discovered.weapons.some(i => i.key === 'laser'));
});

test('custom weapons use system assignments or GM overrides; unknown types are explicit', () => {
  const laser = weapon('laser', 'laser');
  assert.equal(weaponGroup(laser, config(), { laser: 'ranged' }), 'ranged');
  const rules = config(); rules.weaponTypes.laser = 'melee';
  assert.equal(weaponGroup(laser, rules, { laser: 'ranged' }), 'melee');
  rules.weaponTypes.laser = 'ignore';
  assert.equal(weaponGroup(laser, rules, { laser: 'ranged' }), null);
  assert.equal(weaponGroup(weapon('unknown', 'custom'), config()), null);
});

test('item names and category names are escaped in player reports', () => {
  const rules = config(); rules.equipment.ring.limit = 0;
  const item = equipment('<img src=x onerror=alert(1)>');
  const errors = equipmentViolations([], [item], rules);
  const html = reportHtml('<actor>', errors, null, true, { equipment: [{ key: 'ring', label: '<category>' }] });
  assert.ok(html.includes('&lt;actor&gt;'));
  assert.ok(html.includes('&lt;category&gt;'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
});

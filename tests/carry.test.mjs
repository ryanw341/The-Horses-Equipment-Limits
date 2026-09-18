import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig } from '../scripts/rules.js';
import { carryConfig, carryLimit, carriedAmount, carriedTotals, carryViolations, categoryId, matchesCarry } from '../scripts/carry.js';
import { parseItemUuids, resolveCarrySources, carrySourceOptions } from '../scripts/carry-sources.js';
import { readCarryForm, carrySections } from '../scripts/carry-ui.js';
import { auditActor, auditPlayers, capacityReportHtml } from '../scripts/audit.js';
import { reportHtml } from '../scripts/messages.js';

const actor = (str = 2, con = 1, prof = 3) => ({ system: { attributes: { prof }, abilities: { str: { mod: str }, con: { mod: con } } } });
const item = (id, quantity = 1, extra = {}) => ({
  id, name: id, type: 'consumable', uuid: `Actor.hero.Item.${id}`,
  system: { equipped: false, quantity, type: { value: 'ammo', subtype: 'magazine' } }, ...extra
});
function config() {
  const value = defaultConfig(); value.carry.ammo.enabled = true;
  value.carry.ammo.categories = [categoryId('consumable', 'ammo')];
  return value;
}

test('default capacities follow the requested formulas and each section starts disabled', () => {
  const rules = carryConfig(defaultConfig());
  assert.equal(carryLimit(actor(), rules.ammo), 6);
  assert.equal(carryLimit(actor(), rules.aid), 12);
  assert.equal(carryLimit(actor(), rules.implants), 4);
  assert.ok(Object.values(rules).every(rule => !rule.enabled));
});

test('minimums apply after multiplication, and negative implant capacity becomes zero', () => {
  const rules = carryConfig(defaultConfig());
  assert.equal(carryLimit(actor(-5, -5, 2), rules.ammo), 2);
  assert.equal(carryLimit(actor(-5, -5, 2), rules.aid), 4);
  assert.equal(carryLimit(actor(-5, -5, 2), rules.implants), 0);
});

test('custom numbers, ability choice and fixed capacities are supported', () => {
  const rule = { ...config().carry.ammo, base: 2, proficiency: 2, ability: 'con', abilityMultiplier: 3, multiplier: 2, minimum: 0 };
  assert.equal(carryLimit(actor(9, 2, 3), rule), 28);
  Object.assign(rule, { base: 7, proficiency: 0, ability: 'none', multiplier: 1 });
  assert.equal(carryLimit(actor(), rule), 7);
  rule.multiplier = 0.5;
  assert.equal(carryLimit(actor(), rule), 3);
});

test('capacity uses current actor stats on each check and missing stats contribute zero', () => {
  const hero = actor(), rule = config().carry.ammo;
  assert.equal(carryLimit(hero, rule), 6);
  hero.system.attributes.prof = 4; hero.system.abilities.str.mod = 4;
  assert.equal(carryLimit(hero, rule), 9);
  assert.equal(carryLimit({}, rule), 2);
});

test('older world configurations gain fresh disabled sections without modifying saved data', () => {
  const old = { enabled: true, equipment: { ring: { enabled: true, limit: 2 } } };
  const result = carryConfig(old); result.ammo.base = 9;
  assert.equal(old.carry, undefined);
  assert.equal(carryConfig(old).ammo.base, 1);
  assert.deepEqual(old.equipment.ring, { enabled: true, limit: 2 });
});

test('carried quantity includes unequipped items and sums all stacks', () => {
  const rules = config(), items = [item('a', 4), item('b', 3)];
  const [violation] = carryViolations([], items, actor(), rules);
  assert.equal(violation.limit, 6);
  assert.equal(violation.after, 7);
  assert.equal(violation.count, 'quantity');
  assert.deepEqual(violation.proposed.map(i => i.cost), [4, 3]);
  assert.equal(carryViolations([], [item('a', 6)], actor(), rules).length, 0);
});

test('counting choices are independent: quantity, uses, and one per entry', () => {
  const magazine = item('a', 10); magazine.system.uses = { max: '8', spent: 3, value: 8 };
  assert.equal(carriedAmount(magazine, 'quantity'), 10);
  assert.equal(carriedAmount(magazine, 'uses'), 5);
  assert.equal(carriedAmount(magazine, 'entries'), 1);
  magazine.system.quantity = 0;
  for (const mode of ['quantity', 'uses', 'entries']) assert.equal(carriedAmount(magazine, mode), 0);
  assert.equal(carriedAmount(item('b'), 'uses'), 0);
});

test('formula-based uses retain prepared value and account for projected spent changes', () => {
  const magazine = item('a'); magazine.system.uses = { max: '@prof', value: 4, spent: 1 };
  assert.equal(carriedAmount(magazine, 'uses'), 4);
  magazine.system.uses._initialSpent = 1; magazine.system.uses.spent = 3;
  assert.equal(carriedAmount(magazine, 'uses'), 2);
});

test('decreases and unrelated edits remain allowed while already over capacity', () => {
  const rules = config();
  assert.equal(carryViolations([item('a', 10)], [item('a', 9)], actor(), rules).length, 0);
  assert.equal(carryViolations([item('a', 10)], [item('a', 10)], actor(), rules).length, 0);
  assert.equal(carryViolations([item('a', 10)], [item('a', 11)], actor(), rules).length, 1);
  rules.enabled = false;
  assert.equal(carryViolations([], [item('a', 100)], actor(), rules).length, 0);
});

test('multiple selectors in a section count an item once; overlapping sections remain independent', () => {
  const rules = config(), source = item('a', 7);
  rules.carry.ammo.uuids = [source.uuid];
  assert.equal(carriedTotals([source], rules.carry.ammo).total, 7);
  rules.carry.aid.enabled = true; rules.carry.aid.uuids = [source.uuid]; rules.carry.aid.multiplier = 1;
  assert.equal(carryViolations([], [source], actor(), rules).length, 2);
});

test('custom equipment categories and consumable subtypes match precisely', () => {
  const implant = item('implant', 1, { type: 'equipment', system: { quantity: 1, type: { value: 'custom.implant' } } });
  const rule = config().carry.implants; rule.categories = [categoryId('equipment', 'custom.implant')];
  assert.equal(matchesCarry(implant, rule), true);
  assert.equal(matchesCarry(item('other'), rule), false);
  rule.categories = [categoryId('consumable', 'ammo', 'magazine')];
  assert.equal(matchesCarry(item('ammo'), rule), true);
  const bullet = item('bullet'); bullet.system.type.subtype = 'bullet';
  assert.equal(matchesCarry(bullet, rule), false);
  rule.categories = [categoryId('consumable')];
  assert.equal(matchesCarry(bullet, rule), true);
});

test('UUID matching supports modern and legacy provenance without matching names', () => {
  const rule = { ...config().carry.ammo, categories: [], uuids: ['Compendium.world.ammo.Item.magazine'] };
  const source = item('a', 1, { _stats: { compendiumSource: 'Compendium.world.ammo.Item.magazine' } });
  assert.equal(matchesCarry(source, rule), true);
  delete source._stats; source.flags = { core: { sourceId: 'Compendium.world.ammo.magazine' } };
  assert.equal(matchesCarry(source, rule), true);
  assert.equal(matchesCarry(item('magazine'), rule), false);
  rule.uuids = ['Item.worldAmmo']; source.flags = {}; source._stats = { duplicateSource: 'Item.worldAmmo' };
  assert.equal(matchesCarry(source, rule), true);
});

test('compendium selectors recognize new imports and do not match similarly named packs', () => {
  const rule = { ...config().carry.ammo, categories: [], compendiums: ['world.ammo'] };
  assert.equal(matchesCarry(item('a', 1, { _stats: { compendiumSource: 'Compendium.world.ammo.Item.new' } }), rule), true);
  assert.equal(matchesCarry(item('b', 1, { _stats: { compendiumSource: 'Compendium.world.ammoExtra.Item.new' } }), rule), false);
});

test('UUID input accepts Foundry links, separators and old compendium IDs and rejects non-Item IDs', () => {
  assert.deepEqual(parseItemUuids('@UUID[Item.source]{Magazine}\nCompendium.world.ammo.magazine,Item.source'),
    ['Item.source', 'Compendium.world.ammo.Item.magazine']);
  for (const value of ['Actor.hero', 'https://example.com', 'Folder.foo']) assert.throws(() => parseItemUuids(value), /Item UUID/);
});

test('folder compilation includes descendants and matches copied items on player clients', async () => {
  const rules = config(); rules.carry.ammo.categories = []; rules.carry.ammo.folders = ['parent'];
  const source = item('a', 1, { uuid: 'Item.source', folder: 'child' });
  const resolved = await resolveCarrySources(rules, { items: [source], folders: [
    { id: 'parent', type: 'Item' }, { id: 'child', type: 'Item', folder: 'parent' },
    { id: 'actorFolder', type: 'Actor', folder: 'parent' }
  ] });
  const rule = resolved.carry.ammo;
  assert.deepEqual(rule.resolvedFolders, ['parent', 'child']);
  assert.ok(rule.resolvedUuids.includes('Item.source'));
  assert.equal(matchesCarry(item('owned', 1, { _stats: { duplicateSource: 'Item.source' } }), rule), true);
  assert.deepEqual(rules.carry.ammo.resolvedUuids, []);
});

test('compilation follows source ancestry and does not pin category-only items to old categories', async () => {
  const rules = config(); rules.carry.ammo.uuids = ['Item.original'];
  const items = [item('copy', 1, { uuid: 'Item.copy', _stats: { duplicateSource: 'Item.original' } }),
    item('owned', 1, { _stats: { duplicateSource: 'Item.copy' } })];
  const resolved = await resolveCarrySources(rules, { items });
  assert.ok(resolved.carry.ammo.resolvedUuids.includes(items[1].uuid));
  const categoryOnly = await resolveCarrySources(config(), { items: [item('categoryMatch')] });
  assert.deepEqual(categoryOnly.carry.ammo.resolvedUuids, []);
});

test('selected UUIDs resolve source aliases, while deleted original UUIDs retain exact matching', async () => {
  const rules = config(); rules.carry.ammo.categories = []; rules.carry.ammo.uuids = ['Item.original', 'Item.deleted'];
  const result = await resolveCarrySources(rules, { resolve: async uuid => uuid === 'Item.original'
    ? { documentName: 'Item', uuid, _stats: { compendiumSource: 'Compendium.world.ammo.Item.original' } } : null });
  assert.ok(result.carry.ammo.resolvedUuids.includes('Compendium.world.ammo.Item.original'));
  assert.equal(matchesCarry(item('copy', 1, { _stats: { duplicateSource: 'Item.deleted' } }), result.carry.ammo), true);
});

test('rescanning folders drops removed source memberships', async () => {
  const rules = config(); rules.carry.ammo.categories = []; rules.carry.ammo.folders = ['selected'];
  const original = item('original', 1, { uuid: 'Item.original', folder: 'selected' });
  const first = await resolveCarrySources(rules, { items: [original] });
  original.folder = 'different';
  const second = await resolveCarrySources(first, { items: [original] });
  assert.deepEqual(second.carry.ammo.resolvedUuids, []);
});

test('source choices include registered and observed custom categories, subtypes, Item folders and Item packs only', () => {
  const choices = carrySourceOptions(config(), { equipmentTypes: { implant: 'Implants' },
    consumableTypes: { ammo: { label: 'Ammo', subtypes: { magazine: 'Magazines' } } } },
  [item('custom', 1, { type: 'equipment', system: { type: { value: 'homebrew' } } })],
  [{ id: 'items', type: 'Item', name: 'Ammo' }, { id: 'actors', type: 'Actor', name: 'Actors' }],
  [{ collection: 'world.ammo', documentName: 'Item', metadata: { label: 'Ammo pack' } }, { collection: 'world.actors', documentName: 'Actor' }]);
  assert.ok(choices.categories.some(c => c.key === categoryId('equipment', 'implant')));
  assert.ok(choices.categories.some(c => c.key === categoryId('equipment', 'homebrew')));
  assert.ok(choices.categories.some(c => c.key === categoryId('consumable', 'ammo', 'magazine')));
  assert.deepEqual(choices.folders.map(c => c.key), ['items']);
  assert.deepEqual(choices.compendiums.map(c => c.key), ['world.ammo']);
});

function carryForm() {
  const fields = {};
  for (const [key, rule] of Object.entries(config().carry)) {
    const prefix = `carry-${key}`;
    fields[`${prefix}-enabled`] = { checked: rule.enabled };
    for (const name of ['base', 'proficiency', 'ability', 'abilityMultiplier', 'multiplier', 'minimum', 'count']) fields[`${prefix}-${name}`] = { value: String(rule[name]) };
    fields[`${prefix}-uuids`] = { value: '' };
    for (const name of ['categories', 'folders', 'compendiums']) fields[`${prefix}-${name}`] = { selectedOptions: rule[name].map(value => ({ value })) };
  }
  return { fields, form: { elements: { namedItem: name => fields[name] } } };
}

test('carried capacity form saves independent toggles, edited formula values and multiple selections', () => {
  const { fields, form } = carryForm();
  fields['carry-ammo-count'].value = 'uses'; fields['carry-ammo-base'].value = '2';
  fields['carry-ammo-uuids'].value = 'Item.ammo';
  fields['carry-ammo-folders'].selectedOptions = [{ value: 'folder' }];
  const result = readCarryForm(form, defaultConfig());
  assert.equal(result.ammo.enabled, true); assert.equal(result.aid.enabled, false);
  assert.equal(result.ammo.count, 'uses'); assert.equal(result.ammo.base, 2);
  assert.deepEqual(result.ammo.folders, ['folder']); assert.deepEqual(result.ammo.uuids, ['Item.ammo']);
});

test('form rejects invalid formulas, negative minimums and enabled sections without matching criteria', () => {
  const { fields, form } = carryForm();
  for (const invalid of ['', 'NaN', 'Infinity', '1 + prof']) {
    fields['carry-ammo-base'].value = invalid;
    assert.throws(() => readCarryForm(form, config()), /valid formula numbers/);
  }
  fields['carry-ammo-base'].value = '1'; fields['carry-ammo-minimum'].value = '-1';
  assert.throws(() => readCarryForm(form, config()), /valid formula numbers/);
  fields['carry-ammo-minimum'].value = '2'; fields['carry-ammo-categories'].selectedOptions = [];
  assert.throws(() => readCarryForm(form, config()), /select at least one/);
  // A rescan must still work while the GM is choosing matching items for an enabled section.
  assert.deepEqual(readCarryForm(form, config(), { requireSources: false }).ammo.categories, []);
});

test('carried capacity is included in player audits with the excess quantity of a partial stack', () => {
  const hero = { ...actor(), name: 'Hero', items: [item('mags', 10)], testUserPermission: () => true };
  const [group] = auditActor(hero, config()).equipment;
  assert.equal(group.count, 'quantity'); assert.equal(group.total, 10); assert.equal(group.limit, 6);
  assert.equal(group.items[0].excessAmount, 4);
  const audit = auditPlayers([{ key: 'hero', actor: hero, location: '' }], [{ name: 'Player' }], config());
  assert.equal(audit.hasChecks, true);
  assert.match(capacityReportHtml(audit, { equipment: [] }), /Ammo capacity/);
  assert.match(capacityReportHtml(audit, { equipment: [] }), /4 over/);
});

test('carry reports instruct players to reduce carried items and settings escape custom labels', () => {
  const errors = carryViolations([], [item('<mags>', 10)], actor(), config());
  const html = reportHtml('Hero', errors, null, true, { equipment: [] });
  assert.match(html, /Already carried/); assert.match(html, /Unequipping does not reduce/);
  assert.match(html, /&lt;mags&gt;/);
  const form = carrySections(config(), { categories: [{ key: categoryId('equipment', 'implant'), label: '<Implants>' }], folders: [], compendiums: [] });
  assert.match(form, /&lt;Implants&gt;/); assert.ok(!form.includes('<Implants>'));
});

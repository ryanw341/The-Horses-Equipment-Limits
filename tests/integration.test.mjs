import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig } from '../scripts/rules.js';
import { checkOperation, registerEnforcement } from '../scripts/enforcement.js';
import { readForm, registerSettings } from '../scripts/settings.js';
import { categoryId } from '../scripts/carry.js';

let config, reports, registered;
const player = { id: 'player', isGM: false };
const gm = { id: 'gm', isGM: true };
const item = (id, equipped = false) => ({
  id, _id: id, name: id, type: 'equipment', system: { type: { value: 'ring' }, equipped, attuned: false }
});
const actor = items => ({ documentName: 'Actor', name: 'Hero', items,
  system: { attributes: { attunement: { max: 3 } } } });

function expandObject(data) {
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    const keys = key.split('.');
    let cursor = result;
    for (const part of keys.slice(0, -1)) cursor = cursor[part] ??= {};
    cursor[keys.at(-1)] = value;
  }
  return result;
}
function mergeObject(original, update, { recursive = true } = {}) {
  const copy = structuredClone(original);
  for (const [key, value] of Object.entries(update)) {
    copy[key] = recursive && value && typeof value === 'object' && !Array.isArray(value)
      ? mergeObject(copy[key] ?? {}, value) : value;
  }
  return copy;
}

test.beforeEach(() => {
  config = defaultConfig();
  config.equipment.ring = { enabled: true, limit: 1 };
  reports = []; registered = new Map();
  globalThis.game = {
    settings: {
      get: () => config,
      register: (id, key, options) => registered.set(key, options),
      registerMenu: (id, key, options) => registered.set(key, options)
    },
    user: player,
    items: [], actors: [], scenes: [],
    modules: new Map([['lib-wrapper', { active: true }]]),
    i18n: { localize: value => value }
  };
  globalThis.CONFIG = { DND5E: { equipmentTypes: { ring: 'Rings' }, weaponTypeMap: {} },
    Item: { documentClass: { _preUpdateOperation() {}, _preCreateOperation() {} } } };
  globalThis.foundry = {
    utils: { expandObject, mergeObject },
    applications: { api: { DialogV2: class {
      constructor(options) { this.options = options; }
      render() { reports.push(this.options); }
    } } }
  };
  globalThis.libWrapper = { register: (id, target, fn) => registered.set(target, fn) };
});

test('blocks player equip via flattened updates and leaves the source untouched', () => {
  const parent = actor([item('a', true), item('b')]);
  assert.equal(checkOperation([], { parent, updates: [{ _id: 'b', 'system.equipped': true }] }, player, false), false);
  assert.equal(parent.items[1].system.equipped, false);
  assert.equal(reports.length, 1);
  assert.ok(reports[0].content.includes('Already equipped'));
  assert.ok(reports[0].content.includes('blocked'));
});

test('warn mode allows equipment and reports the limit', () => {
  config.mode = 'warn';
  const parent = actor([item('a', true), item('b')]);
  assert.equal(checkOperation([], { parent, updates: [{ _id: 'b', system: { equipped: true } }] }, player, false), undefined);
  assert.equal(reports.length, 1);
  assert.ok(reports[0].content.includes('This change is allowed'));
});

test('GM bypass is default and can be turned off', () => {
  const operation = { parent: actor([item('a', true), item('b')]), updates: [{ _id: 'b', 'system.equipped': true }] };
  assert.equal(checkOperation([], operation, gm, false), undefined);
  assert.equal(reports.length, 0);
  config.applyToGM = true;
  assert.equal(checkOperation([], operation, gm, false), false);
});

test('bulk swaps are order independent, bulk equips are evaluated together', () => {
  const parent = actor([item('a', true), item('b'), item('c')]);
  assert.equal(checkOperation([], { parent, updates: [
    { _id: 'b', 'system.equipped': true }, { _id: 'a', 'system.equipped': false }
  ] }, player, false), undefined);
  assert.equal(reports.length, 0);
  assert.equal(checkOperation([], { parent, updates: [
    { _id: 'b', 'system.equipped': true }, { _id: 'c', 'system.equipped': true }
  ] }, player, false), false);
});

test('creating multiple already equipped items is checked as one batch', () => {
  const parent = actor([]);
  assert.equal(checkOperation([item('a', true), item('b', true)], { parent }, player, true), false);
  assert.equal(checkOperation([item('a'), item('b')], { parent }, player, true), undefined);
});

test('attunement is optional and never blocks, even in block mode', () => {
  const parent = actor([item('a'), item('b')]);
  parent.system.attributes.attunement.max = 1;
  parent.items[0].system.attuned = true;
  const operation = { parent, updates: [{ _id: 'b', 'system.attuned': true }] };
  assert.equal(checkOperation([], operation, player, false), undefined);
  assert.equal(reports.length, 0);
  config.attunementReminder = true;
  assert.equal(checkOperation([], operation, player, false), undefined);
  assert.equal(reports.length, 1);
  assert.ok(reports[0].content.includes('Attunement limit: <strong>1</strong>'));
});

test('disabled module, world items, compendiums, and dry runs are ignored', () => {
  const parent = actor([item('a', true)]);
  for (const operation of [{}, { parent, pack: 'some.pack' }, { parent, dryRun: true }]) {
    assert.equal(checkOperation([item('b', true)], operation, player, true), undefined);
  }
  config.enabled = false;
  assert.equal(checkOperation([item('b', true)], { parent }, player, true), undefined);
  assert.equal(reports.length, 0);
});

test('synthetic token actors are checked directly instead of their base actor', () => {
  const base = actor([]), synthetic = actor([item('a', true), item('b')]);
  synthetic.isToken = true;
  game.actors = [base];
  assert.equal(checkOperation([], { parent: synthetic, updates: [{ _id: 'b', 'system.equipped': true }] }, player, false), false);
  assert.equal(base.items.length, 0);
});

test('wrappers preserve original arguments, respect cancellation, and validate afterwards', async () => {
  registerEnforcement();
  const wrapper = registered.get('CONFIG.Item.documentClass._preUpdateOperation');
  const documents = [], operation = { parent: actor([item('a', true), item('b')]), updates: [{ _id: 'b', 'system.equipped': true }] };
  let called = 0;
  const result = await wrapper(async (...args) => {
    called++;
    assert.deepEqual(args, [documents, operation, player]);
    return false;
  }, documents, operation, player);
  assert.equal(result, false);
  assert.equal(called, 1);
  assert.equal(reports.length, 0);
  assert.equal(await wrapper(async () => undefined, documents, operation, player), false);
  assert.equal(reports.length, 1);
});

test('missing libWrapper produces an explicit startup error', () => {
  game.modules.get('lib-wrapper').active = false;
  assert.throws(registerEnforcement, /requires libWrapper/);
});

function formFixture() {
  const entries = {
    enabled: { checked: true }, mode: { value: 'warn' }, applyToGM: { checked: false },
    attunementReminder: { checked: true }, heavyCountsTwo: { checked: true }, twoHandedCountsTwo: { checked: false },
    'equipment-0-enabled': { checked: true }, 'equipment-0-limit': { value: '2' },
    'melee-enabled': { checked: true }, 'melee-limit': { value: '2' },
    'ranged-enabled': { checked: false }, 'ranged-limit': { value: '0' },
    'weapon-type-0': { value: 'ranged' }
  };
  return { entries, form: { elements: { namedItem: name => entries[name] } } };
}

test('settings save independent options and custom category IDs without path expansion', () => {
  const { form } = formFixture();
  const result = readForm(form, { equipment: [{ key: 'custom.ring', label: 'Custom ring' }], weapons: [{ key: 'laser' }] }, config);
  assert.equal(result.mode, 'warn');
  assert.equal(result.equipment['custom.ring'].limit, 2);
  assert.equal(result.weapons.ranged.limit, 0);
  assert.equal(result.heavyCountsTwo, true);
  assert.equal(result.twoHandedCountsTwo, false);
  assert.equal(result.attunementReminder, true);
  assert.equal(result.weaponTypes.laser, 'ranged');
});

test('settings reject negative, fractional, blank, and nonnumeric limits', () => {
  const { form, entries } = formFixture();
  const categories = { equipment: [{ key: 'ring', label: 'Rings' }], weapons: [] };
  for (const invalid of ['-1', '1.5', '', 'oops', 'Infinity']) {
    entries['equipment-0-limit'].value = invalid;
    assert.throws(() => readForm(form, categories, config), /whole numbers/);
  }
});

test('settings are world-scoped and the menu is GM-only', () => {
  registerSettings();
  assert.equal(registered.get('rules').scope, 'world');
  assert.equal(registered.get('configure').restricted, true);
  assert.equal(registered.get('capacityReport').restricted, true);
  assert.equal(registered.get('initialCapacityReportShown').scope, 'world');
  assert.equal(registered.get('initialCapacityReportShown').default, false);
  assert.throws(() => new (registered.get('capacityReport').type)(), /Only a GM/);
  const dialog = new (registered.get('configure').type)();
  assert.ok(dialog.options.content.includes('Melee weapons'));
  assert.ok(dialog.options.content.includes('Ranged weapons'));
  assert.ok(dialog.options.content.includes('Warn only'));
});

test('saving limits shows the capacity report with the newly saved rules', async () => {
  game.user = gm;
  game.users = [gm, { ...player, name: 'Player' }];
  game.actors = [{ ...actor([item('a', true), item('b', true), item('c', true)]),
    uuid: 'Actor.hero', testUserPermission: () => true }];
  const saved = new Map();
  game.settings.set = async (id, key, value) => { saved.set(key, value); if (key === 'rules') config = value; };
  globalThis.ui = { notifications: { info() {} } };
  registerSettings();
  const dialog = new (registered.get('configure').type)();
  const { form } = formFixture();
  await dialog.options.buttons[0].callback({}, { form }, dialog);
  assert.equal(saved.get('rules').equipment.ring.limit, 2);
  assert.equal(reports.length, 1);
  assert.match(reports[0].content, /3 \/ 2/);
  assert.match(reports[0].content, /Excess candidate/);
  assert.equal(saved.get('initialCapacityReportShown'), true);
});

function enableCarriedRings() {
  config.equipment.ring.enabled = false;
  config.carry.ammo.enabled = true;
  config.carry.ammo.categories = [categoryId('equipment', 'ring')];
  return config.carry.ammo;
}

test('carried capacity blocks stack increases on unequipped items and warns in warn mode', () => {
  enableCarriedRings();
  const magazine = item('mags'); magazine.system.quantity = 2;
  const parent = actor([magazine]); // Missing stats use the configured minimum of two.
  const operation = { parent, updates: [{ _id: 'mags', 'system.quantity': 3 }] };
  assert.equal(checkOperation([], operation, player, false), false);
  assert.match(reports[0].content, /Already carried/);
  config.mode = 'warn';
  assert.equal(checkOperation([], operation, player, false), undefined);
  assert.equal(magazine.system.quantity, 2);
});

test('carried item creation checks the combined quantities and leaves consumption reductions allowed', () => {
  enableCarriedRings();
  const parent = actor([]), first = item('a'), second = item('b');
  first.system.quantity = 2; second.system.quantity = 1;
  assert.equal(checkOperation([first, second], { parent }, player, true), false);
  parent.items = [first]; first.system.quantity = 8;
  assert.equal(checkOperation([], { parent, updates: [{ _id: 'a', 'system.quantity': 7 }] }, player, false), undefined);
});

test('remaining Uses capacity checks refills, permits spending, and accounts for projected spent values', () => {
  const rule = enableCarriedRings(); rule.count = 'uses';
  const magazine = item('mags'); magazine.system.quantity = 1;
  magazine.system.uses = { max: '10', spent: 8, value: 2 };
  const parent = actor([magazine]);
  assert.equal(checkOperation([], { parent, updates: [{ _id: 'mags', 'system.uses.spent': 7 }] }, player, false), false);
  assert.equal(checkOperation([], { parent, updates: [{ _id: 'mags', 'system.uses.spent': 9 }] }, player, false), undefined);
});

test('source UUID and compendium matching survive the enforcement snapshot', () => {
  const rule = enableCarriedRings(); rule.categories = []; rule.compendiums = ['world.magazines'];
  const magazine = item('mags'); magazine.system.quantity = 3;
  magazine._stats = { compendiumSource: 'Compendium.world.magazines.Item.magazine' };
  assert.equal(checkOperation([magazine], { parent: actor([]) }, player, true), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, MODULE_ID } from '../scripts/rules.js';
import { auditActor, auditPlayers, collectAuditActors, capacityReportHtml,
  showInitialCapacityReport, showCapacityReport, INITIAL_AUDIT_SETTING } from '../scripts/audit.js';

const ring = (id, sort = 0) => ({ id, name: id, sort, type: 'equipment', system: { type: { value: 'ring' }, equipped: true } });
const weapon = (id, group, properties, sort) => ({ id, name: id, sort, type: 'weapon',
  system: { type: { value: group }, properties, equipped: true } });
const player = (id, extra = {}) => ({ id, name: id, isGM: false, ...extra });
function actor(id, items, owners = []) {
  return { id, uuid: `Actor.${id}`, name: id, items,
    system: { attributes: { attunement: { max: 3 } } },
    testUserPermission(user, permission) { assert.equal(permission, 'OWNER'); return owners.includes(user.id); }
  };
}
function config() {
  const rules = defaultConfig();
  rules.equipment.ring = { enabled: true, limit: 2 };
  return rules;
}

test('audits existing excess equipment, respects disabled categories, and preserves inventory', () => {
  const items = [ring('c', 3), ring('b', 2), ring('a', 1)];
  const character = actor('hero', items);
  const rules = config();
  const report = auditActor(character, rules);
  assert.equal(report.equipment[0].total, 3);
  assert.equal(report.equipment[0].excess, 1);
  assert.deepEqual(report.equipment[0].items.filter(i => i.excess).map(i => i.name), ['c']);
  assert.deepEqual(character.items.map(i => i.id), ['c', 'b', 'a']);
  assert.ok(character.items.every(i => i.system.equipped));
  rules.equipment.ring.enabled = false;
  assert.deepEqual(auditActor(character, rules).equipment, []);
});

test('weighted weapons crossing a limit are marked even when they only partly exceed it', () => {
  const rules = config();
  rules.weapons.melee = { enabled: true, limit: 2 };
  rules.weapons.ranged = { enabled: true, limit: 1 };
  rules.heavyCountsTwo = true; rules.twoHandedCountsTwo = true;
  const character = actor('hero', [weapon('dagger', 'simpleM', [], 1),
    weapon('greatsword', 'martialM', ['hvy', 'two'], 2), weapon('bow', 'martialR', ['two'], 3)]);
  const [melee, ranged] = auditActor(character, rules).equipment;
  assert.equal(melee.total, 3);
  assert.equal(melee.items[1].cost, 2);
  assert.equal(melee.items[1].excess, true);
  assert.equal(melee.items[0].excess, false);
  assert.equal(ranged.total, 2);
  assert.equal(ranged.items[0].excess, true);
});

test('zero limits mark every equipped item and ignore unequipped entries', () => {
  const rules = config(); rules.equipment.ring.limit = 0;
  const spare = ring('spare'); spare.system.equipped = false;
  const [group] = auditActor(actor('hero', [ring('a'), ring('b'), spare]), rules).equipment;
  assert.equal(group.total, 2);
  assert.ok(group.items.every(i => i.excess));
});

test('Light weapons preserve half-slot totals and excess candidates in GM reports', () => {
  const rules = config(); rules.lightCountsHalf = true;
  rules.weapons.melee = { enabled: true, limit: 1 };
  const character = actor('hero', ['first', 'second', 'third'].map((id, index) => weapon(id, 'simpleM', ['lgt'], index)), ['Player']);
  const [group] = auditActor(character, rules).equipment;
  assert.equal(group.total, 1.5);
  assert.equal(group.excess, 0.5);
  assert.deepEqual(group.items.filter(item => item.excess).map(item => item.name), ['third']);
  assert.equal(group.items[2].excessAmount, 0.5);
  const audit = auditPlayers([{ key: character.uuid, actor: character }], [player('Player')], rules);
  const html = capacityReportHtml(audit, { equipment: [] });
  assert.match(html, /1\.5 \/ 1/);
  assert.match(html, /0\.5 over capacity/);
  assert.match(html, /counts as 0\.5/);
});

test('custom categories and equal inventory sort values produce stable excess candidates', () => {
  const rules = config(); rules.equipment['custom.cloak'] = { enabled: true, limit: 1 };
  const cloaks = ['c', 'a', 'b'].map(id => ({ ...ring(id), system: { type: { value: 'custom.cloak' }, equipped: true } }));
  assert.deepEqual(auditActor(actor('hero', cloaks), rules).equipment[0].items
    .filter(i => i.excess).map(i => i.name), ['b', 'c']);
});

test('attunement audits use the actor maximum and include unequipped attuned items only when enabled', () => {
  const character = actor('hero', ['a', 'b', 'c', 'd'].map((id, index) => ({
    ...ring(id, index), system: { equipped: false, attuned: true }
  })));
  const rules = config();
  assert.equal(auditActor(character, rules).attunement, null);
  rules.attunementReminder = true;
  const report = auditActor(character, rules).attunement;
  assert.equal(report.excess, 1);
  assert.deepEqual(report.items.filter(i => i.excess).map(i => i.name), ['d']);
  character.system.attributes.attunement.max = 6;
  assert.equal(auditActor(character, rules).attunement, null);
});

test('collects offline players, assigned characters and owned NPCs; excludes observers and GM-only actors', () => {
  const alex = player('Alex', { active: false }), morgan = player('Morgan');
  const assigned = actor('assigned', [ring('a'), ring('b'), ring('c')]);
  alex.character = assigned;
  const npc = actor('pet', [ring('a'), ring('b'), ring('c')], ['Alex']);
  const observerOnly = actor('observer-only', [ring('a'), ring('b'), ring('c')]);
  const gmOnly = actor('GM actor', [ring('a'), ring('b'), ring('c')], ['gm']);
  const users = [alex, morgan, { id: 'gm', name: 'GM', isGM: true, character: gmOnly }];
  const entries = collectAuditActors([npc, observerOnly, gmOnly], [], users);
  const result = auditPlayers(entries, users, config());
  assert.equal(result.actorCount, 2);
  assert.equal(result.players.length, 2);
  assert.equal(result.players[0].overCapacity.length, 2);
  assert.equal(result.players[1].actorCount, 0);
});

test('linked tokens do not duplicate world actors; unlinked tokens remain distinct and carry scene labels', () => {
  const base = actor('base', [ring('a'), ring('b')], ['Alex']);
  const synthetic = { ...actor('base', [ring('a'), ring('b'), ring('c')], ['Alex']), uuid: 'Scene.s.Token.t.Actor.base' };
  const scenes = [{ id: 's', name: 'Dungeon', tokens: [
    { actorLink: true, actor: base, id: 'linked' },
    { actorLink: false, actor: synthetic, id: 't', name: 'Token hero' },
    { actorLink: false, actor: null, id: 'missing' }
  ] }];
  const entries = collectAuditActors([base], scenes, []);
  assert.equal(entries.length, 2);
  const result = auditPlayers(entries, [player('Alex')], config());
  assert.equal(result.actorCount, 2);
  assert.equal(result.players[0].overCapacity.length, 1);
  assert.equal(result.players[0].overCapacity[0].location, 'Dungeon / Token hero');
});

test('shared actors appear under each owner but count once in the overall inventory total', () => {
  const shared = actor('shared', [ring('a'), ring('b'), ring('c')], ['Alex', 'Morgan']);
  const result = auditPlayers(collectAuditActors([shared], [], []), [player('Alex'), player('Morgan')], config());
  assert.equal(result.actorCount, 1);
  assert.ok(result.players.every(p => p.overCapacity.length === 1));
});

test('the master switch suppresses audit violations; GM bypass does not hide player inventories', () => {
  const character = actor('hero', [ring('a'), ring('b'), ring('c')], ['Alex']);
  const rules = config();
  assert.equal(rules.applyToGM, false);
  assert.equal(auditPlayers(collectAuditActors([character], [], []), [player('Alex')], rules)
    .players[0].overCapacity.length, 1);
  rules.enabled = false;
  assert.deepEqual(auditActor(character, rules), { equipment: [], attunement: null });
});

test('report distinguishes no configured limits, no actors, and nobody exceeding capacity', () => {
  const categories = { equipment: [] };
  const entries = collectAuditActors([actor('hero', [ring('a')], ['Alex'])], [], []);
  const users = [player('Alex')];
  assert.match(capacityReportHtml(auditPlayers(entries, users, defaultConfig()), categories), /No category limits/);
  assert.match(capacityReportHtml(auditPlayers([], users, config()), categories), /No player-controlled actors/);
  assert.match(capacityReportHtml(auditPlayers(entries, users, config()), categories), /No players are exceeding/);
});

test('report escapes player, actor, scene, item and category names and identifies excess candidates', () => {
  const user = player('<player>');
  const character = actor('<actor>', [ring('a'), ring('b'), ring('<img src=x>')], [user.id]);
  const entries = [{ key: character.uuid, actor: character, location: '<scene>' }];
  const html = capacityReportHtml(auditPlayers(entries, [user], config()), { equipment: [{ key: 'ring', label: '<rings>' }] });
  for (const value of ['player', 'actor', 'scene', 'rings']) assert.ok(html.includes(`&lt;${value}&gt;`));
  assert.ok(html.includes('&lt;img src=x&gt;'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('Excess candidate'));
  assert.ok(html.includes('3 / 2'));
});

function mockWorld({ shown = false, enabled = true } = {}) {
  const gm = { id: 'gm', name: 'GM', isGM: true }, users = [gm]; users.activeGM = gm;
  const rules = config(); rules.enabled = enabled;
  const settings = new Map([['rules', rules], [INITIAL_AUDIT_SETTING, shown]]);
  const renders = [];
  globalThis.game = { user: gm, users, actors: [], items: [], scenes: [],
    i18n: { localize: value => value }, settings: {
      get(id, key) { assert.equal(id, MODULE_ID); return settings.get(key); },
      async set(id, key, value) { assert.equal(id, MODULE_ID); settings.set(key, value); }
    } };
  globalThis.CONFIG = { DND5E: {} };
  globalThis.foundry = { applications: { api: { DialogV2: class {
    constructor(options) { this.options = options; }
    async render() { renders.push(this.options); }
  } } } };
  return { renders, settings };
}

test('first activation opens once for the active GM and persists completion only after rendering', async () => {
  const { renders, settings } = mockWorld();
  await Promise.all([showInitialCapacityReport(), showInitialCapacityReport()]);
  assert.equal(renders.length, 1);
  assert.equal(settings.get(INITIAL_AUDIT_SETTING), true);
  await showInitialCapacityReport();
  assert.equal(renders.length, 1);
});

test('initial report does not appear for players, secondary GMs, or while disabled', async () => {
  const { renders, settings } = mockWorld();
  game.user = player('Alex'); await showInitialCapacityReport(); await showCapacityReport();
  game.user = { id: 'other-gm', isGM: true }; await showInitialCapacityReport();
  game.user = game.users.activeGM;
  settings.get('rules').enabled = false; await showInitialCapacityReport();
  assert.equal(renders.length, 0);
  assert.equal(settings.get(INITIAL_AUDIT_SETTING), false);
});

test('failed rendering does not consume the first-activation report and can be retried', async () => {
  const { settings } = mockWorld();
  const normal = foundry.applications.api.DialogV2.prototype.render;
  foundry.applications.api.DialogV2.prototype.render = async () => { throw new Error('Render failure'); };
  await assert.rejects(showInitialCapacityReport(), /Render failure/);
  assert.equal(settings.get(INITIAL_AUDIT_SETTING), false);
  foundry.applications.api.DialogV2.prototype.render = normal;
  await showInitialCapacityReport();
  assert.equal(settings.get(INITIAL_AUDIT_SETTING), true);
});

test('a fresh install with no enabled categories explains configuration and can report again after saving', async () => {
  const { renders, settings } = mockWorld();
  settings.set('rules', defaultConfig());
  await showInitialCapacityReport();
  assert.match(renders[0].content, /No category limits/);
  settings.set('rules', config());
  await showCapacityReport(config(), { remember: true });
  assert.equal(renders.length, 2);
  assert.equal(settings.get(INITIAL_AUDIT_SETTING), true);
});

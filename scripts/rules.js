/** Pure rules: no Foundry globals, document writes, or sheet dependencies. */
import { defaultCarryConfig } from './carry.js';
export const MODULE_ID = 'the-horses-equipment-limits';

export function defaultConfig() {
  return {
    enabled: true,
    mode: 'block',
    applyToGM: false,
    attunementReminder: false,
    heavyCountsTwo: false,
    twoHandedCountsTwo: false,
    equipment: {},
    weapons: {
      melee: { enabled: false, limit: 2 },
      ranged: { enabled: false, limit: 2 }
    },
    weaponTypes: {},
    carry: defaultCarryConfig()
  };
}

export function itemTypeValue(item) {
  const type = item.system?.type;
  return (typeof type === 'string' ? type : type?.value)
    || item.system?.armor?.type || item.system?.weaponType || '';
}

const STANDARD_WEAPONS = {
  simpleM: 'melee', martialM: 'melee', simpleR: 'ranged', martialR: 'ranged', siege: 'ranged'
};

export function weaponGroup(item, config, systemMap = {}) {
  const type = itemTypeValue(item);
  const group = config.weaponTypes?.[type] ?? systemMap[type] ?? STANDARD_WEAPONS[type];
  return ['melee', 'ranged'].includes(group) ? group : null;
}

export function hasProperty(item, property) {
  const properties = item.system?.properties;
  if (properties instanceof Set) return properties.has(property);
  if (Array.isArray(properties)) return properties.includes(property);
  return properties?.[property] === true;
}

export function itemCost(item, config) {
  if (item.type !== 'weapon') return 1;
  return ((config.heavyCountsTwo && hasProperty(item, 'hvy'))
    || (config.twoHandedCountsTwo && hasProperty(item, 'two'))) ? 2 : 1;
}

export function categoryKey(item, config, systemMap = {}) {
  if (item.type === 'equipment') return `equipment:${itemTypeValue(item)}`;
  if (item.type === 'weapon') {
    const group = weaponGroup(item, config, systemMap);
    return group ? `weapon:${group}` : null;
  }
  return null;
}

export function equippedByCategory(items, config, systemMap = {}) {
  const groups = new Map();
  for (const item of items) {
    if (item.system?.equipped !== true) continue;
    const key = categoryKey(item, config, systemMap);
    if (!key) continue;
    const group = groups.get(key) ?? { total: 0, items: [] };
    const cost = itemCost(item, config);
    group.total += cost;
    group.items.push({ id: item.id ?? item._id, name: item.name || 'Unnamed item', cost });
    groups.set(key, group);
  }
  return groups;
}

/** Block only increases beyond a limit. Reductions and unrelated edits remain possible. */
export function equipmentViolations(before, after, config, systemMap = {}) {
  if (!config.enabled) return [];
  const previous = equippedByCategory(before, config, systemMap);
  const next = equippedByCategory(after, config, systemMap);
  const violations = [];
  for (const [key, group] of next) {
    const separator = key.indexOf(':');
    const kind = key.slice(0, separator), type = key.slice(separator + 1);
    const rule = kind === 'equipment' ? config.equipment?.[type] : config.weapons?.[type];
    if (!rule?.enabled || !Number.isInteger(rule.limit) || rule.limit < 0) continue;
    const old = previous.get(key) ?? { total: 0, items: [] };
    if (group.total > rule.limit && group.total > old.total) {
      violations.push({ key, limit: rule.limit, before: old.total, after: group.total,
        existing: old.items, proposed: group.items });
    }
  }
  return violations;
}

export function attunementViolation(before, after, maximum) {
  // Use prepared actor maximum, including class features and active effects.
  if (!Number.isFinite(maximum) || maximum < 0) return null;
  const attuned = items => items.filter(item => item.system?.attuned === true);
  const previous = attuned(before), next = attuned(after);
  if (next.length <= maximum || next.length <= previous.length) return null;
  return { limit: maximum, before: previous.length, after: next.length,
    existing: previous.map(item => ({ name: item.name || 'Unnamed item', cost: 1 })),
    proposed: next.map(item => ({ name: item.name || 'Unnamed item', cost: 1 })) };
}

/** Discover registered custom types and types actually used on items. Saved rules survive rescans. */
export function discoverCategories(systemConfig, items, saved = defaultConfig(), localize = value => value) {
  const equipment = new Map(), weapons = new Map();
  const label = (value, fallback) => {
    const text = typeof value === 'string' ? value : value?.label;
    return text ? localize(text) : fallback;
  };
  for (const source of [systemConfig.armorTypes, systemConfig.miscEquipmentTypes, systemConfig.equipmentTypes]) {
    for (const [key, value] of Object.entries(source ?? {})) equipment.set(key, label(value, key));
  }
  for (const [key, value] of Object.entries(systemConfig.weaponTypes ?? {})) weapons.set(key, label(value, key));
  for (const item of items) {
    const key = itemTypeValue(item);
    const collection = item.type === 'equipment' ? equipment : item.type === 'weapon' ? weapons : null;
    if (collection && !collection.has(key)) collection.set(key, key || 'Uncategorized');
  }
  for (const [key, rule] of Object.entries(saved.equipment ?? {})) {
    if (!equipment.has(key)) equipment.set(key, rule.label || key || 'Uncategorized');
  }
  for (const key of Object.keys(saved.weaponTypes ?? {})) if (!weapons.has(key)) weapons.set(key, key);
  const sorted = collection => [...collection].map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { equipment: sorted(equipment), weapons: sorted(weapons) };
}

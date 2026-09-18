/** Carried-capacity rules. Formulas are numeric parameters, never executable expressions. */
export const CARRY_LABELS = { ammo: 'Ammo capacity', aid: 'Aid capacity', implants: 'Implant capacity' };
export const COUNT_LABELS = { quantity: 'item quantity', uses: 'remaining uses', entries: 'item entries' };

export function defaultCarryConfig() {
  const rule = (base, ability, multiplier, minimum) => ({
    enabled: false, base, proficiency: 1, ability, abilityMultiplier: 1, multiplier, minimum,
    count: 'quantity', uuids: [], categories: [], folders: [], compendiums: [],
    resolvedUuids: [], resolvedFolders: []
  });
  return { ammo: rule(1, 'str', 1, 2), aid: rule(1, 'str', 2, 4), implants: rule(0, 'con', 1, 0) };
}

/** Add new defaults to older saved worlds without changing any existing choices. */
export function carryConfig(config) {
  return Object.fromEntries(Object.entries(defaultCarryConfig()).map(([key, defaults]) => [key, {
    ...defaults, ...config.carry?.[key]
  }]));
}

const numeric = (value, fallback = 0) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;

export function carryLimit(actor, rule) {
  const prof = numeric(actor.system?.attributes?.prof);
  const ability = rule.ability === 'none' ? 0 : numeric(actor.system?.abilities?.[rule.ability]?.mod);
  const raw = (numeric(rule.base) + numeric(rule.proficiency) * prof
    + numeric(rule.abilityMultiplier) * ability) * numeric(rule.multiplier, 1);
  return Math.max(0, Math.floor(Math.max(numeric(rule.minimum), raw)));
}

export function canonicalUuid(value) {
  if (typeof value !== 'string') return '';
  const uuid = value.trim();
  const parts = uuid.split('.');
  // Older 5e source IDs omit the document type in compendium UUIDs.
  if (parts[0] === 'Compendium' && parts.length === 4) parts.splice(3, 0, 'Item');
  return parts.join('.');
}

export function sourceUuids(item) {
  return [...new Set([item.uuid, item._stats?.compendiumSource, item._stats?.duplicateSource,
    item.flags?.core?.sourceId].map(canonicalUuid).filter(Boolean))];
}

export function categoryId(type, value = null, subtype = null) {
  return JSON.stringify([type, value, subtype]);
}

function categoryMatches(item, category) {
  let parts;
  try { parts = JSON.parse(category); } catch { return false; }
  if (!Array.isArray(parts)) return false;
  const [type, value, subtype] = parts;
  const data = item.system?.type;
  const itemValue = (typeof data === 'string' ? data : data?.value) ?? '';
  return item.type === type && (value === null || value === itemValue)
    && (subtype === null || subtype === data?.subtype);
}

/** Selections are OR conditions; a matching item is counted only once per section. */
export function matchesCarry(item, rule) {
  if ((rule.categories ?? []).some(category => categoryMatches(item, category))) return true;
  const sources = sourceUuids(item);
  const explicit = new Set([...(rule.uuids ?? []), ...(rule.resolvedUuids ?? [])].map(canonicalUuid));
  if (sources.some(source => explicit.has(source))) return true;
  if ((rule.compendiums ?? []).some(pack => sources.some(source => source.startsWith(`Compendium.${pack}.Item.`)))) return true;
  const folder = typeof item.folder === 'string' ? item.folder : item.folder?.id;
  return Boolean(folder && [...(rule.folders ?? []), ...(rule.resolvedFolders ?? [])].includes(folder));
}

export function carriedAmount(item, count) {
  const quantity = Math.max(0, numeric(item.system?.quantity, 1));
  if (quantity === 0) return 0;
  if (count === 'entries') return 1;
  if (count === 'uses') {
    const uses = item.system?.uses;
    // Source max/spent take precedence so projected consumption and refills never use a stale value.
    const max = uses?.max;
    if (max !== null && max !== '' && max !== undefined && Number.isFinite(Number(max))) {
      return Math.max(0, Number(max) - numeric(uses.spent));
    }
    return Math.max(0, numeric(uses?.value) + numeric(uses?._initialSpent, numeric(uses?.spent)) - numeric(uses?.spent));
  }
  return quantity;
}

export function carriedTotals(items, rule) {
  const matching = [];
  let total = 0;
  for (const item of items) {
    if (!matchesCarry(item, rule)) continue;
    const cost = carriedAmount(item, rule.count);
    if (!cost) continue;
    total += cost;
    matching.push({ id: item.id ?? item._id, name: item.name || 'Unnamed item', cost });
  }
  return { total, items: matching };
}

export function carryViolations(before, after, actor, config) {
  if (!config.enabled) return [];
  const violations = [];
  for (const [key, rule] of Object.entries(carryConfig(config))) {
    if (!rule.enabled) continue;
    const limit = carryLimit(actor, rule), old = carriedTotals(before, rule), next = carriedTotals(after, rule);
    if (next.total > limit && next.total > old.total) violations.push({
      key: `carry:${key}`, label: CARRY_LABELS[key], count: rule.count, limit,
      before: old.total, after: next.total, existing: old.items, proposed: next.items
    });
  }
  return violations;
}

import { carryConfig, categoryId, canonicalUuid, sourceUuids, matchesCarry } from './carry.js';

export function parseItemUuids(text) {
  const plain = String(text ?? '').replace(/@UUID\[([^\]]+)\](?:\{[^}]*\})?/g, '$1');
  const uuids = [...new Set(plain.split(/[\s,;]+/).filter(Boolean).map(canonicalUuid))];
  for (const uuid of uuids) {
    if (!/^(?:Item\.[^.\s]+|(?:Compendium\.[^.\s]+\.[^.\s]+|Actor\.[^.\s]+|Scene\.[^.\s]+\.Token\.[^.\s]+\.Actor\.[^.\s]+)\.Item\.[^.\s]+)$/.test(uuid)) {
      throw new Error(`Expected an Item UUID, received: ${uuid}`);
    }
  }
  return uuids;
}

export function descendantFolders(selected, folders) {
  const ids = new Set(selected);
  let changed;
  do {
    changed = false;
    for (const folder of folders) {
      const parent = typeof folder.folder === 'string' ? folder.folder : folder.folder?.id;
      if (folder.type === 'Item' && ids.has(parent) && !ids.has(folder.id)) {
        ids.add(folder.id); changed = true;
      }
    }
  } while (changed);
  return [...ids];
}

/** Compile source UUIDs as GM so player clients do not need access to source folders/packs. */
export async function resolveCarrySources(config, { items = [], folders = [], resolve = async () => null } = {}) {
  const carry = carryConfig(config);
  const sourceCache = new Map();
  for (const rule of Object.values(carry)) {
    rule.resolvedFolders = descendantFolders(rule.folders, folders);
    const resolved = new Set();
    for (const uuid of rule.uuids) {
      if (!sourceCache.has(uuid)) sourceCache.set(uuid, await resolve(uuid));
      const document = sourceCache.get(uuid);
      if (!document) continue; // Retain exact UUID matching even if the original source was deleted.
      if (document.documentName !== 'Item') throw new Error(`Expected an Item document for ${uuid}.`);
      for (const source of sourceUuids(document)) resolved.add(source);
    }
    const initial = { ...rule, categories: [], resolvedUuids: [...resolved] };
    // A source can itself be a copy. Repeated passes follow world-item ancestry without name matching.
    let changed;
    do {
      changed = false;
      for (const item of items) {
        if (!matchesCarry(item, initial)) continue;
        for (const source of sourceUuids(item)) if (!resolved.has(source)) { resolved.add(source); changed = true; }
      }
      initial.resolvedUuids = [...resolved];
    } while (changed);
    rule.resolvedUuids = [...resolved];
  }
  return { ...config, carry };
}

/** Collect category choices without downloading compendium contents. */
export function carrySourceOptions(config, system, items, folders = [], packs = [], localize = value => value) {
  const choices = new Map();
  const typeLabels = { equipment: 'Equipment', weapon: 'Weapons', consumable: 'Consumables', tool: 'Tools', loot: 'Loot', container: 'Containers' };
  const label = (value, fallback) => localize(typeof value === 'string' ? value : value?.label ?? fallback);
  const add = (type, value = null, subtype = null, title = null) => {
    const key = categoryId(type, value, subtype);
    if (!choices.has(key)) choices.set(key, title ?? `${typeLabels[type] ?? type} / ${value ?? 'All categories'}${subtype ? ` / ${subtype}` : ''}`);
  };
  for (const [type, field] of Object.entries({ equipment: 'equipmentTypes', weapon: 'weaponTypes', consumable: 'consumableTypes', tool: 'toolTypes', loot: 'lootTypes', container: 'containerTypes' })) {
    add(type);
    const types = type === 'equipment' ? { ...system.armorTypes, ...system.miscEquipmentTypes, ...system[field] } : system[field];
    for (const [value, data] of Object.entries(types ?? {})) {
      const title = `${typeLabels[type]} / ${label(data, value)}`;
      add(type, value, null, title);
      for (const [subtype, subdata] of Object.entries(data?.subtypes ?? {})) add(type, value, subtype, `${title} / ${label(subdata, subtype)}`);
    }
  }
  for (const item of items) {
    const value = typeof item.system?.type === 'string' ? item.system.type : item.system?.type?.value;
    add(item.type);
    if (value) add(item.type, value);
    if (item.system?.type?.subtype) add(item.type, value, item.system.type.subtype);
  }
  const selected = carryConfig(config);
  for (const rule of Object.values(selected)) for (const category of rule.categories) {
    if (!choices.has(category)) {
      try { const [type, value, subtype] = JSON.parse(category); add(type, value, subtype); } catch { /* ignore invalid old choice */ }
    }
  }
  const folderChoices = new Map(folders.filter(folder => folder.type === 'Item').map(folder => {
    const names = [folder.name], seen = new Set([folder.id]);
    let parentId = typeof folder.folder === 'string' ? folder.folder : folder.folder?.id;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = folders.find(entry => entry.id === parentId);
      if (!parent) break;
      names.unshift(parent.name); parentId = typeof parent.folder === 'string' ? parent.folder : parent.folder?.id;
    }
    return [folder.id, names.join(' / ')];
  }));
  const packChoices = new Map(packs.filter(pack => pack.documentName === 'Item')
    .map(pack => [pack.collection, pack.metadata?.label ?? pack.collection]));
  for (const rule of Object.values(selected)) {
    for (const id of rule.folders) if (!folderChoices.has(id)) folderChoices.set(id, `${id} (unavailable)`);
    for (const id of rule.compendiums) if (!packChoices.has(id)) packChoices.set(id, `${id} (unavailable)`);
  }
  const sorted = map => [...map].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  return { categories: sorted(choices), folders: sorted(folderChoices), compendiums: sorted(packChoices) };
}

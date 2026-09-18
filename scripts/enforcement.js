import { MODULE_ID, equipmentViolations, attunementViolation } from './rules.js';
import { getConfig } from './settings.js';
import { scanCategories } from './discovery.js';
import { showReport } from './messages.js';

/** A small prepared snapshot retains effect-adjusted equipment/attunement state. */
export function snapshot(item) {
  const system = item.system ?? {};
  return {
    _id: item.id ?? item._id,
    name: item.name,
    type: item.type,
    system: {
      equipped: system.equipped,
      attuned: system.attuned,
      type: typeof system.type === 'string' ? system.type : { value: system.type?.value },
      armor: { type: system.armor?.type },
      weaponType: system.weaponType,
      properties: system.properties instanceof Set ? [...system.properties] : system.properties
    }
  };
}

export function evaluateOperation(before, after, actor, config, systemMap) {
  const equipment = equipmentViolations(before, after, config, systemMap);
  const attunement = config.enabled && config.attunementReminder
    ? attunementViolation(before, after, actor.system?.attributes?.attunement?.max) : null;
  return { equipment, attunement, blocked: config.mode === 'block' && equipment.length > 0 };
}

/** Validate the entire batch, so two new items cannot both take the last free slot. */
export function checkOperation(documents, operation, user, creating) {
  const actor = operation.parent ?? documents[0]?.parent;
  if (actor?.documentName !== 'Actor' || operation.pack || operation.dryRun) return;
  const config = getConfig();
  if (!config.enabled || (user?.isGM && !config.applyToGM)) return;
  const before = Array.from(actor.items, snapshot);
  let after;
  if (creating) {
    // Pending documents have already passed system preCreate processing.
    after = [...before, ...documents.map(snapshot)];
  } else {
    const updates = new Map((operation.updates ?? []).map(update => [update._id, update]));
    after = before.map(item => {
      const update = updates.get(item._id);
      if (!update) return item;
      return foundry.utils.mergeObject(item, foundry.utils.expandObject(update), {
        inplace: false, recursive: operation.recursive !== false
      });
    });
  }
  const result = evaluateOperation(before, after, actor, config, CONFIG.DND5E.weaponTypeMap);
  if (result.equipment.length || result.attunement) {
    showReport(actor, result.equipment, result.attunement, result.blocked, scanCategories(config));
  }
  if (result.blocked) return false;
}

export function registerEnforcement() {
  if (!globalThis.libWrapper || !game.modules.get('lib-wrapper')?.active) {
    throw new Error("The Horse's Equipment Limits requires libWrapper. Enable it, then reload the world.");
  }
  for (const [method, creating] of [['_preUpdateOperation', false], ['_preCreateOperation', true]]) {
    const target = `CONFIG.Item.documentClass.${method}`;
    if (typeof CONFIG.Item.documentClass[method] !== 'function') {
      throw new Error(`Equipment Limits could not register ${method} on this Foundry version.`);
    }
    libWrapper.register(MODULE_ID, target, async function(wrapped, documents, operation, user) {
      const result = await wrapped(documents, operation, user);
      if (result === false) return false;
      return checkOperation(documents, operation, user, creating) === false ? false : result;
    }, 'WRAPPER');
  }
}

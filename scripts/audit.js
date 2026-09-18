import { MODULE_ID, equipmentViolations, attunementViolation } from './rules.js';
import { scanCategories } from './discovery.js';
import { escapeHtml as esc, categoryLabel } from './messages.js';
import { carryConfig, carryViolations, COUNT_LABELS } from './carry.js';

export const INITIAL_AUDIT_SETTING = 'initialCapacityReportShown';

/** Mark a deterministic set of excess candidates, without choosing what to unequip. */
function markExcess(items, limit) {
  let used = 0;
  return items.map(item => {
    used += item.cost;
    return { ...item, excess: used > limit, excessAmount: Math.min(item.cost, Math.max(0, used - limit)) };
  });
}

export function auditActor(actor, config, systemMap = {}) {
  if (!config.enabled) return { equipment: [], attunement: null };
  // Sort a copy: never reorder the actor's actual inventory. IDs break sort ties consistently.
  const items = Array.from(actor.items).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)
    || String(a.id ?? a._id ?? '').localeCompare(String(b.id ?? b._id ?? '')));
  const equipment = [...equipmentViolations([], items, config, systemMap), ...carryViolations([], items, actor, config)].map(violation => ({
    key: violation.key, limit: violation.limit, total: violation.after,
    ...(violation.count ? { count: violation.count } : {}),
    excess: violation.after - violation.limit, items: markExcess(violation.proposed, violation.limit)
  }));
  const attunement = config.attunementReminder
    ? attunementViolation([], items, actor.system?.attributes?.attunement?.max) : null;
  return { equipment, attunement: attunement ? {
    limit: attunement.limit, total: attunement.after, excess: attunement.after - attunement.limit,
    items: markExcess(attunement.proposed, attunement.limit)
  } : null };
}

/** Collect each world actor once, plus distinct unlinked token inventories from all scenes. */
export function collectAuditActors(actors, scenes, users) {
  const entries = new Map();
  const add = (actor, location = '', key = actor?.uuid ?? actor?.id) => {
    if (actor && !entries.has(key)) entries.set(key, { key, actor, location });
  };
  for (const actor of actors) add(actor);
  for (const user of users) if (!user.isGM && user.character) add(user.character);
  for (const scene of scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink) add(token.actor);
      else add(token.actor, `${scene.name} / ${token.name}`, token.uuid ?? `Scene.${scene.id}.Token.${token.id}`);
    }
  }
  return [...entries.values()];
}

export function auditPlayers(entries, users, config, systemMap = {}) {
  const validRule = rule => rule?.enabled && Number.isInteger(rule.limit) && rule.limit >= 0;
  const hasChecks = config.enabled && (config.attunementReminder
    || Object.values(config.equipment ?? {}).some(validRule)
    || Object.values(config.weapons ?? {}).some(validRule)
    || Object.values(carryConfig(config)).some(rule => rule.enabled));
  const players = Array.from(users).filter(user => !user.isGM)
    .sort((a, b) => a.name.localeCompare(b.name));
  const results = new Map(), checked = new Set();
  const breakdown = players.map(user => {
    const owned = entries.filter(({ actor }) => actor === user.character
      || (user.character?.uuid && actor.uuid === user.character.uuid)
      || actor.testUserPermission(user, 'OWNER'));
    const overCapacity = [];
    for (const entry of owned) {
      checked.add(entry.key);
      if (!results.has(entry.key)) results.set(entry.key, auditActor(entry.actor, config, systemMap));
      const result = results.get(entry.key);
      if (result.equipment.length || result.attunement) {
        overCapacity.push({ actorName: entry.actor.name, location: entry.location, ...result });
      }
    }
    return { playerName: user.name, actorCount: owned.length, overCapacity };
  });
  return { enabled: config.enabled, hasChecks, actorCount: checked.size, players: breakdown };
}

function capacityItems(items, carried = false) {
  return `<ul>${items.map(item => `<li${item.excess ? ' class="hel-excess"' : ''}>${esc(item.name)}
    ${item.cost !== 1 ? `<span>(counts as ${item.cost})</span>` : ''}
    ${item.excess ? `<strong class="hel-excess-label">Excess candidate${carried ? ` (${item.excessAmount} over)` : ''}</strong>` : ''}</li>`).join('')}</ul>`;
}

export function capacityReportHtml(audit, categories) {
  let summary;
  if (!audit.enabled) summary = 'Equipment limits and reminders are disabled. Enable them in Configure Equipment Limits to check capacity.';
  else if (!audit.hasChecks) summary = 'No category limits, carried capacity limits, or attunement reminders are enabled yet. Configure limits first; a new report will open when you save.';
  else if (!audit.players.length) summary = 'No player accounts were found in this world.';
  else if (!audit.actorCount) summary = 'No player-controlled actors were found. Assign a character or grant a player Owner permission to include it.';
  else if (!audit.players.some(player => player.overCapacity.length)) summary = 'No players are exceeding the enabled limits.';
  else summary = `${audit.players.filter(player => player.overCapacity.length).length} player(s) have actors exceeding the enabled limits.`;

  const players = audit.players.map(player => {
    const status = !audit.hasChecks ? 'Not checked' : !player.actorCount ? 'No controlled actors'
      : player.overCapacity.length ? `${player.overCapacity.length} over capacity` : 'Within limits';
    return `<tr><td>${esc(player.playerName)}</td><td>${player.actorCount}</td><td>${status}</td></tr>`;
  }).join('');
  const details = audit.players.filter(player => player.overCapacity.length).map(player => `<section>
    <h3>${esc(player.playerName)}</h3>${player.overCapacity.map(actor => `<div class="hel-audit-actor">
      <h4>${esc(actor.actorName)}${actor.location ? ` <small>(${esc(actor.location)})</small>` : ''}</h4>
      ${actor.equipment.map(group => `<h5>${esc(categoryLabel(group.key, categories))}</h5>
        <p><strong>${group.total} / ${group.limit}</strong> ${group.count ? `carried (${COUNT_LABELS[group.count]})` : 'equipped slots'}. <strong>${group.excess} over capacity.</strong></p>
        ${capacityItems(group.items, Boolean(group.count))}`).join('')}
      ${actor.attunement ? `<h5>Attunement</h5><p><strong>${actor.attunement.total} / ${actor.attunement.limit}</strong>
        attuned items. <strong>${actor.attunement.excess} over capacity.</strong></p>${capacityItems(actor.attunement.items)}` : ''}
    </div>`).join('')}</section>`).join('');
  return `<div class="hel-report hel-capacity-report"><p>${summary}</p>
    ${audit.hasChecks ? `<p>${audit.actorCount} distinct player-controlled actor inventory/inventories checked, including offline players.</p>` : ''}
    ${players ? `<table><thead><tr><th>Player</th><th>Actor inventories</th><th>Status</th></tr></thead><tbody>${players}</tbody></table>` : ''}
    ${details ? '<p>Excess candidates are marked in inventory sort order, not equip time. Players may choose which equipment to unequip or which carried items to remove. Unequipping does not reduce carried capacity. No items have been changed.</p>' : ''}
    ${details}</div>`;
}

export function capacityReportOptions(config = game.settings.get(MODULE_ID, 'rules')) {
  if (!game.user.isGM) throw new Error('Only a GM can view the player capacity report.');
  const entries = collectAuditActors(game.actors, game.scenes, game.users);
  const audit = auditPlayers(entries, game.users, config, CONFIG.DND5E.weaponTypeMap);
  return {
    window: { title: 'Player Equipment Capacity' }, position: { width: 700 },
    content: capacityReportHtml(audit, scanCategories(config)),
    buttons: [{ action: 'ok', label: 'Close', default: true }, {
      action: 'configure', label: 'Configure limits',
      callback: () => {
        const Menu = game.settings.menus.get(`${MODULE_ID}.configure`).type;
        return new Menu().render({ force: true });
      }
    }, { action: 'refresh', label: 'Refresh report', callback: () => showCapacityReport() }]
  };
}

export async function showCapacityReport(config = game.settings.get(MODULE_ID, 'rules'), { remember = false } = {}) {
  if (!game.user.isGM) return;
  await new foundry.applications.api.DialogV2(capacityReportOptions(config)).render({ force: true });
  // Only remember success after rendering. A failed render can be retried on the next load.
  if (remember && config.enabled) await game.settings.set(MODULE_ID, INITIAL_AUDIT_SETTING, true);
}

let initialAuditPending = false;
export async function showInitialCapacityReport() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || initialAuditPending) return;
  const config = game.settings.get(MODULE_ID, 'rules');
  if (!config.enabled || game.settings.get(MODULE_ID, INITIAL_AUDIT_SETTING)) return;
  initialAuditPending = true;
  try { await showCapacityReport(config, { remember: true }); }
  finally { initialAuditPending = false; }
}

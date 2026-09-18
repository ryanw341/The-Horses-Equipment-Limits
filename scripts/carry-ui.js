import { CARRY_LABELS, carryConfig } from './carry.js';
import { parseItemUuids } from './carry-sources.js';
import { escapeHtml as esc } from './messages.js';

const selected = (current, value) => current === value ? ' selected' : '';
const abilities = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence',
  wis: 'Wisdom', cha: 'Charisma', hon: 'Honor', san: 'Sanity', none: 'None' };

function selection(name, label, choices, values) {
  return `<label class="hel-carry-selection">${label}<select name="${name}" multiple size="4">
    ${choices.map(choice => `<option value="${esc(choice.key)}"${values.includes(choice.key) ? ' selected' : ''}>${esc(choice.label)}</option>`).join('')}
    </select></label>`;
}

export function carrySections(config, sources) {
  return `<h3>Carried capacity</h3><p class="hel-hint">Counts matching items even when unequipped, including items inside containers on the actor.
    Each section has its own pool. An item matching several choices in one section counts once.</p>`
    + Object.entries(carryConfig(config)).map(([key, rule]) => {
      const prefix = `carry-${key}`;
      const number = (name, label, minimum = null, step = 'any') => `<label>${label}<input type="number" name="${prefix}-${name}"
        value="${esc(rule[name])}" ${minimum === null ? '' : `min="${minimum}"`} step="${step}" required></label>`;
      return `<fieldset class="hel-carry-section"><legend>${CARRY_LABELS[key]}</legend>
        <label class="hel-check"><input type="checkbox" name="${prefix}-enabled"${rule.enabled ? ' checked' : ''}> Enable ${CARRY_LABELS[key].toLowerCase()}</label>
        <details><summary>Customize formula and matching items</summary>
          <p class="hel-hint">Capacity = (Base + PROF &times; proficiency multiplier + ability modifier &times; ability multiplier) &times; total multiplier.
            Apply the minimum, round down, and never go below zero.</p>
          <div class="hel-formula-grid">
            ${number('base', 'Base')}${number('proficiency', 'Proficiency multiplier')}
            <label>Ability<select name="${prefix}-ability">${Object.entries(abilities).map(([value, label]) => `<option value="${value}"${selected(rule.ability, value)}>${label}</option>`).join('')}</select></label>
            ${number('abilityMultiplier', 'Ability multiplier')}${number('multiplier', 'Total multiplier', 0)}${number('minimum', 'Minimum capacity', 0, '1')}
          </div>
          <label class="hel-limit">Count each matching item by<select name="${prefix}-count">
            ${[['quantity', 'Inventory Quantity'], ['uses', 'Remaining Uses'], ['entries', 'One per item entry']].map(([value, label]) => `<option value="${value}"${selected(rule.count, value)}>${label}</option>`).join('')}
          </select></label>
          <p class="hel-hint">Remaining Uses counts the item's current pool once, not multiplied by Quantity. Items without a uses pool count as zero in that mode.</p>
          <label class="hel-carry-selection">Item UUIDs (one per line)<textarea name="${prefix}-uuids" rows="3" placeholder="Item.example or Compendium.world.ammo.Item.example">${esc(rule.uuids.join('\n'))}</textarea></label>
          <p class="hel-hint">UUID links pasted from Foundry are accepted. Copies match when their source UUID is preserved; names are never used for matching.</p>
          ${selection(`${prefix}-categories`, 'Item categories, including custom categories', sources.categories, rule.categories)}
          ${selection(`${prefix}-folders`, 'World Item folders (includes subfolders)', sources.folders, rule.folders)}
          ${selection(`${prefix}-compendiums`, 'Item compendiums', sources.compendiums, rule.compendiums)}
          <p class="hel-hint">Use Ctrl/Cmd-click to select or clear multiple choices. Any selected UUID, category, folder, or compendium can match.
            Folder membership and source copies are refreshed when you save. Compendiums match recorded source IDs, including newly imported items.</p>
        </details>
      </fieldset>`;
    }).join('');
}

export function readCarryForm(form, previous, { requireSources = true } = {}) {
  const field = name => form.elements.namedItem(name);
  const result = carryConfig(previous);
  for (const [key, rule] of Object.entries(result)) {
    const prefix = `carry-${key}`;
    // Existing API callers may submit only the original equipment controls.
    if (!field(`${prefix}-enabled`)) continue;
    rule.enabled = field(`${prefix}-enabled`).checked;
    for (const name of ['base', 'proficiency', 'abilityMultiplier', 'multiplier', 'minimum']) {
      const input = field(`${prefix}-${name}`).value.trim(), value = input === '' ? NaN : Number(input);
      if (!Number.isFinite(value) || Math.abs(value) > 1000000
        || (['multiplier', 'minimum'].includes(name) && value < 0)
        || (name === 'minimum' && !Number.isInteger(value))) {
        throw new Error(`${CARRY_LABELS[key]}: enter valid formula numbers; multiplier and minimum must be nonnegative, and minimum must be a whole number.`);
      }
      rule[name] = value;
    }
    rule.ability = field(`${prefix}-ability`).value;
    rule.count = field(`${prefix}-count`).value;
    if (!Object.hasOwn(abilities, rule.ability) || !['quantity', 'uses', 'entries'].includes(rule.count)) throw new Error('Invalid capacity ability or counting mode.');
    rule.uuids = parseItemUuids(field(`${prefix}-uuids`).value);
    for (const name of ['categories', 'folders', 'compendiums']) {
      rule[name] = Array.from(field(`${prefix}-${name}`).selectedOptions, option => option.value);
    }
    if (requireSources && rule.enabled && !['uuids', 'categories', 'folders', 'compendiums'].some(name => rule[name].length)) {
      throw new Error(`${CARRY_LABELS[key]}: select at least one item UUID, category, folder, or compendium.`);
    }
  }
  return result;
}

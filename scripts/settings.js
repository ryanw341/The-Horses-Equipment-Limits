import { MODULE_ID, defaultConfig, weaponGroup } from './rules.js';
import { scanCategories, scanCarrySources, prepareCarrySources } from './discovery.js';
import { carryConfig } from './carry.js';
import { carrySections, readCarryForm } from './carry-ui.js';
import { escapeHtml as esc } from './messages.js';
import { INITIAL_AUDIT_SETTING, capacityReportOptions, showCapacityReport } from './audit.js';

export function getConfig() {
  const config = game.settings.get(MODULE_ID, 'rules');
  return { lightCountsHalf: false, ...config, carry: carryConfig(config) };
}

const checked = value => value ? ' checked' : '';

function equipmentRows(categories, config) {
  return categories.equipment.map(({ key, label }, index) => {
    const rule = config.equipment[key] ?? { enabled: false, limit: 1 };
    return `<tr><td><label><input type="checkbox" name="equipment-${index}-enabled"${checked(rule.enabled)}>
      ${esc(label)}</label><small>${esc(key || 'No type set')}</small></td>
      <td><input aria-label="${esc(label)} limit" type="number" name="equipment-${index}-limit"
        value="${rule.limit}" min="0" step="1" required></td></tr>`;
  }).join('') || '<tr><td colspan="2">No equipment categories found.</td></tr>';
}

function weaponRows(categories, config) {
  return categories.weapons.map(({ key, label }, index) => {
    const group = weaponGroup({ system: { type: { value: key } } }, config, CONFIG.DND5E.weaponTypeMap);
    const options = [['melee', 'Melee'], ['ranged', 'Ranged'], ['ignore', 'Not counted']]
      .map(([value, text]) => `<option value="${value}"${value === (group ?? 'ignore') ? ' selected' : ''}>${text}</option>`).join('');
    return `<tr><td><label for="hel-weapon-${index}">${esc(label)}</label><small>${esc(key)}</small></td>
      <td><select id="hel-weapon-${index}" name="weapon-type-${index}">${options}</select></td></tr>`;
  }).join('');
}

function weaponSection(group, config) {
  const rule = config.weapons[group];
  const label = group === 'melee' ? 'Melee weapons' : 'Ranged weapons';
  return `<fieldset><legend>${label}</legend>
    <label class="hel-check"><input type="checkbox" name="${group}-enabled"${checked(rule.enabled)}> Enable limit</label>
    <label class="hel-limit">Maximum equipped slots <input type="number" name="${group}-limit"
      value="${rule.limit}" min="0" step="1" required></label>
  </fieldset>`;
}

function content(categories, config, sources) {
  return `<div class="hel-settings">
    <p>Choose which categories to limit. Disabled categories are unrestricted. Limits apply separately to each actor.</p>
    <fieldset><legend>Behavior</legend>
      <label class="hel-check"><input type="checkbox" name="enabled"${checked(config.enabled)}> Enable equipment limits, carried capacity, and reminders</label>
      <label class="hel-limit">When equipment or carried capacity exceeds a limit
        <select name="mode"><option value="block"${config.mode === 'block' ? ' selected' : ''}>Block the change</option>
          <option value="warn"${config.mode === 'warn' ? ' selected' : ''}>Warn only</option></select></label>
      <label class="hel-check"><input type="checkbox" name="applyToGM"${checked(config.applyToGM)}> Apply to GM actions too</label>
      <label class="hel-check"><input type="checkbox" name="attunementReminder"${checked(config.attunementReminder)}> Remind when attunement exceeds the actor's maximum</label>
      <p class="hel-hint">Attunement reminders always allow the change. GM actions bypass limits and reminders unless selected above.</p>
    </fieldset>
    <div class="hel-section-heading"><h3>Equipment categories</h3>
      <button type="button" class="hel-rescan"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Scan again</button></div>
    <p class="hel-hint">Scans registered 5e categories, world items, and actor inventories, including unlinked tokens.
      New categories start disabled. Set a limit of 0 to prevent equipping that category.</p>
    <table><thead><tr><th>Enable category</th><th>Maximum items</th></tr></thead>
      <tbody class="hel-equipment-rows">${equipmentRows(categories, config)}</tbody></table>
    <div class="hel-weapons">${weaponSection('melee', config)}${weaponSection('ranged', config)}</div>
    <fieldset><legend>Weapon counting</legend>
      <label class="hel-check"><input type="checkbox" name="heavyCountsTwo"${checked(config.heavyCountsTwo)}> Heavy weapons count as two slots</label>
      <label class="hel-check"><input type="checkbox" name="twoHandedCountsTwo"${checked(config.twoHandedCountsTwo)}> Two-Handed weapons count as two slots</label>
      <label class="hel-check"><input type="checkbox" name="lightCountsHalf"${checked(config.lightCountsHalf)}> Light weapons count as half a slot (0.5)</label>
      <p class="hel-hint">Applies to both weapon groups. Enabled Heavy or Two-Handed rules take priority over Light and cost two slots total.
        Each equipped entry uses its slot cost regardless of stack quantity. Two Light weapons use one slot when the Light option applies.</p>
    </fieldset>
    <details><summary>Weapon type assignments, including custom types</summary>
      <p class="hel-hint">Thrown melee weapons stay in the melee group. Types without a system melee/ranged assignment
        are not counted until you assign them here.</p>
      <table><thead><tr><th>Weapon type</th><th>Count toward</th></tr></thead>
        <tbody class="hel-weapon-rows">${weaponRows(categories, config)}</tbody></table>
    </details>
    <div class="hel-carry-sections">${carrySections(config, sources)}</div>
  </div>`;
}

/** Indexed field names avoid dots or punctuation in custom category IDs becoming paths. */
export function readForm(form, categories, previous, options = {}) {
  const field = name => form.elements.namedItem(name);
  const number = name => {
    const value = field(name).value;
    const result = value.trim() === '' ? NaN : Number(value);
    if (!Number.isSafeInteger(result) || result < 0) throw new Error('Limits must be whole numbers of zero or greater.');
    return result;
  };
  return {
    ...previous,
    enabled: field('enabled').checked,
    mode: field('mode').value === 'warn' ? 'warn' : 'block',
    applyToGM: field('applyToGM').checked,
    attunementReminder: field('attunementReminder').checked,
    heavyCountsTwo: field('heavyCountsTwo').checked,
    twoHandedCountsTwo: field('twoHandedCountsTwo').checked,
    lightCountsHalf: field('lightCountsHalf')?.checked ?? previous.lightCountsHalf ?? false,
    equipment: Object.fromEntries(categories.equipment.map(({ key, label }, index) => [key, {
      label, enabled: field(`equipment-${index}-enabled`).checked, limit: number(`equipment-${index}-limit`)
    }])),
    weapons: Object.fromEntries(['melee', 'ranged'].map(group => [group, {
      enabled: field(`${group}-enabled`).checked, limit: number(`${group}-limit`)
    }])),
    weaponTypes: Object.fromEntries(categories.weapons.map(({ key }, index) => [key, field(`weapon-type-${index}`).value])),
    carry: readCarryForm(form, previous, options)
  };
}

// Define the class at init, after Foundry's application API is available.
export function registerSettings() {
  game.settings.register(MODULE_ID, 'rules', {
    scope: 'world', config: false, type: Object, default: defaultConfig()
  });
  game.settings.register(MODULE_ID, INITIAL_AUDIT_SETTING, {
    scope: 'world', config: false, type: Boolean, default: false
  });

  class EquipmentLimitsConfig extends foundry.applications.api.DialogV2 {
    constructor(options = {}) {
      const config = getConfig();
      const categories = scanCategories(config);
      const sources = scanCarrySources(config);
      super({
        ...options,
        window: { title: "The Horse's Equipment Limits" },
        position: { width: 720 },
        content: content(categories, config, sources),
        buttons: [{
          action: 'save', label: 'Save limits', default: true,
          callback: async (event, button, dialog) => {
            if (!game.user.isGM) throw new Error('Only a GM can change equipment limits.');
            const next = await prepareCarrySources(readForm(button.form, dialog.categories, getConfig()));
            await game.settings.set(MODULE_ID, 'rules', next);
            ui.notifications.info('Equipment limits saved.');
            await showCapacityReport(next, { remember: true });
          }
        }, { action: 'cancel', label: 'Cancel' }]
      });
      this.categories = categories;
    }

    _onRender(context, options) {
      super._onRender(context, options);
      this.element.querySelector('.hel-rescan').addEventListener('click', () => {
        try {
          const draft = readForm(this.form, this.categories, getConfig(), { requireSources: false });
          this.categories = scanCategories(draft);
          this.element.querySelector('.hel-equipment-rows').innerHTML = equipmentRows(this.categories, draft);
          this.element.querySelector('.hel-weapon-rows').innerHTML = weaponRows(this.categories, draft);
          this.element.querySelector('.hel-carry-sections').innerHTML = carrySections(draft, scanCarrySources(draft));
          ui.notifications.info('Categories refreshed. Save limits to keep your changes.');
        } catch (error) {
          ui.notifications.warn(error.message);
        }
      });
    }
  }

  game.settings.registerMenu(MODULE_ID, 'configure', {
    name: 'Equipment Limits', label: 'Configure Equipment Limits',
    hint: 'Set equipment limits, ammo/aid/implant capacities, and attunement reminders.',
    icon: 'fa-solid fa-shield-halved', type: EquipmentLimitsConfig, restricted: true
  });

  class PlayerCapacityReport extends foundry.applications.api.DialogV2 {
    constructor(options = {}) { super({ ...options, ...capacityReportOptions() }); }
  }
  game.settings.registerMenu(MODULE_ID, 'capacityReport', {
    name: 'Player Equipment Capacity', label: 'View Player Capacity',
    hint: 'Review players exceeding equipment, carried capacity, or attunement limits and see the excess items.',
    icon: 'fa-solid fa-list-check', type: PlayerCapacityReport, restricted: true
  });
}

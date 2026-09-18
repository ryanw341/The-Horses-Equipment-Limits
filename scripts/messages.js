import { CARRY_LABELS, COUNT_LABELS } from './carry.js';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function categoryLabel(key, categories) {
  if (key === 'weapon:melee') return 'Melee weapons';
  if (key === 'weapon:ranged') return 'Ranged weapons';
  if (key.startsWith('carry:')) return CARRY_LABELS[key.slice(6)] ?? key;
  const type = key.slice('equipment:'.length);
  return categories.equipment.find(category => category.key === type)?.label || type || 'Uncategorized';
}

function itemList(items) {
  return items.length ? `<ul>${items.map(item => `<li>${escapeHtml(item.name)}${item.cost > 1
    ? ` <span>(counts as ${item.cost})</span>` : ''}</li>`).join('')}</ul>` : '<p>None.</p>';
}

export function reportHtml(actorName, violations, attunement, blocked, categories) {
  const equipment = violations.map(violation => `<section>
    <h3>${escapeHtml(categoryLabel(violation.key, categories))}</h3>
    <p>Limit: <strong>${violation.limit}</strong>. Currently ${violation.count ? `carried (${COUNT_LABELS[violation.count]})` : 'equipped'}: ${violation.before}.
      This change would use <strong>${violation.after}</strong>.</p>
    <h4>Already ${violation.count ? 'carried' : 'equipped'}</h4>${itemList(violation.existing)}
    <h4>${violation.count ? 'Carried' : 'Equipped'} after the requested change</h4>${itemList(violation.proposed)}
  </section>`).join('');
  const reminder = attunement ? `<section><h3>Attunement reminder</h3>
    <p>Attunement limit: <strong>${attunement.limit}</strong>. This change would attune
      <strong>${attunement.after}</strong> items. Attunement reminders do not block changes.</p>
    <h4>Already attuned</h4>${itemList(attunement.existing)}
    <h4>Attuned after the requested change</h4>${itemList(attunement.proposed)}
  </section>` : '';
  return `<div class="hel-report"><p><strong>${escapeHtml(actorName)}</strong>: ${blocked
    ? `This change was blocked. ${violations.some(violation => violation.count) ? 'Remove or reduce carried items to free capacity. Unequipping does not reduce carried totals.' : 'Unequip an item in the category first.'}`
    : 'This change is allowed. Please check the limits below.'}</p>${equipment}${reminder}</div>`;
}

export function showReport(actor, violations, attunement, blocked, categories) {
  const title = blocked ? 'Equipment limit reached' : 'Equipment reminder';
  const content = reportHtml(actor.name, violations, attunement, blocked, categories);
  new foundry.applications.api.DialogV2({
    window: { title }, position: { width: 520 },
    content,
    buttons: [{ action: 'ok', label: 'OK', default: true }]
  }).render({ force: true });
}

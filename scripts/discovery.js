import { discoverCategories } from './rules.js';
import { carrySourceOptions, resolveCarrySources } from './carry-sources.js';

function allItems() {
  const items = [...game.items];
  const actors = new Set(game.actors);
  // Include synthetic actors, which may have different items from their base actor.
  for (const scene of game.scenes) {
    for (const token of scene.tokens) if (token.actor) actors.add(token.actor);
  }
  for (const actor of actors) items.push(...actor.items);
  return items;
}

export function scanCategories(config) {
  return discoverCategories(CONFIG.DND5E, allItems(), config, value => game.i18n.localize(value));
}

export function scanCarrySources(config) {
  return carrySourceOptions(config, CONFIG.DND5E, allItems(), Array.from(game.folders ?? []),
    Array.from(game.packs ?? []), value => game.i18n.localize(value));
}

export function prepareCarrySources(config) {
  return resolveCarrySources(config, {
    items: allItems(), folders: Array.from(game.folders ?? []),
    resolve: uuid => fromUuid(uuid)
  });
}

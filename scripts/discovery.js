import { discoverCategories } from './rules.js';

export function scanCategories(config) {
  const items = [...game.items];
  const actors = new Set(game.actors);
  // Include synthetic actors, which may have different items from their base actor.
  for (const scene of game.scenes) {
    for (const token of scene.tokens) if (token.actor) actors.add(token.actor);
  }
  for (const actor of actors) items.push(...actor.items);
  return discoverCategories(CONFIG.DND5E, items, config, value => game.i18n.localize(value));
}

import { MODULE_ID } from './rules.js';
import { registerSettings } from './settings.js';
import { registerEnforcement } from './enforcement.js';

Hooks.once('init', () => {
  if (game.system.id === 'dnd5e') registerSettings();
});

Hooks.once('ready', () => {
  if (game.system.id !== 'dnd5e') {
    ui.notifications.error("The Horse's Equipment Limits requires the D&D 5e system.", { permanent: true });
    return;
  }
  try {
    registerEnforcement();
    console.info(`${MODULE_ID} | Equipment limits ready.`);
  } catch (error) {
    console.error(`${MODULE_ID} | Startup failed`, error);
    ui.notifications.error(error.message, { permanent: true });
  }
});

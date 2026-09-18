import { MODULE_ID } from './rules.js';
import { registerSettings } from './settings.js';
import { registerEnforcement } from './enforcement.js';
import { showInitialCapacityReport } from './audit.js';

Hooks.once('init', () => {
  if (game.system.id === 'dnd5e') registerSettings();
});

Hooks.once('ready', async () => {
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
  try {
    await showInitialCapacityReport();
  } catch (error) {
    console.error(`${MODULE_ID} | Initial capacity report failed`, error);
    ui.notifications.error('Could not show the player capacity report. Try View Player Capacity in module settings.');
  }
});

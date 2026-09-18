# Changelog

## 0.3.0

- Add independently enabled Ammo, Aid, and Implant carried-capacity sections, including unequipped inventory.
- Default to `max(2, 1 + PROF + STR mod)` for ammo, `max(4, (1 + PROF + STR mod) * 2)` for aid, and `max(0, CON mod + PROF)` for implants.
- Let GMs customize each formula's base, proficiency contribution, ability, ability contribution, total multiplier, and minimum.
- Match items by UUID/source UUID, item categories and subtypes including custom types, world Item folders with subfolders, or Item compendium.
- Count by Quantity, Remaining Uses, or one per item entry, independently for each section.
- Apply Block/Warn behavior to inventory additions, quantity increases, uses refills, and category changes using complete Item batches.
- Include carried-capacity violations in player messages and GM reports, marking the excess portion of stacks.
- Preserve existing equipment settings on upgrade; new sections start disabled.

## 0.2.0

- Show a GM-only player capacity report on first activation in each world and after saving limits.
- Group violations by player and actor, with category totals, limits, and excess item candidates.
- Include offline players, shared ownership, player-owned NPCs, and distinct unlinked token inventories.
- Respect weighted weapons and optionally include excess attunement against actor-specific maxima.
- Add a View Player Capacity settings menu and refresh/configuration buttons.
- Show clear states for no enabled limits, no controlled actors, and no excess equipment. Inventory is never changed by the report.

## 0.1.0

- Per-category equipment limits with custom category discovery.
- Separate melee/ranged limits and custom weapon type assignments.
- Independent Heavy and Two-Handed weighting options, capped at two slots per weapon.
- GM-selectable block or warning behavior, with current and proposed equipment lists.
- Optional attunement reminders using each actor's maximum.
- Batch checks for equipment swaps, bulk equips, and already-equipped item creation.
- GM bypass, automated tests, CI checks, and a local packaging command.

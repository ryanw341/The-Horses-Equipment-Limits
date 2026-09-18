# Changelog

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

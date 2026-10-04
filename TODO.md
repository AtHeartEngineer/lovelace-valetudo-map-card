# Remaining integration work

- Connect a persistent Home Assistant last-clean sensor after the owner's recording preference is settled. The robot exposes no HistoryCapability, and the inspected Home Assistant history contained no recent cleaning transitions.
- Validate the recording boundaries during a real completed clean, including vacuum-then-mop, pauses, mop washing, and recharge. Do not label a manual return or an interim dock visit as a completed clean.
- Install the built card in Home Assistant and enable the optional controls on the requested dashboard after configuration is ready.

---
name: standup-rota
description: Generate the Midas standup rota for a week from Azure DevOps capacity. Picks one random host per working day, leaving out people with no capacity, their days off and the team's days off, and renders it as an image (Day, Date, Lead, Off) to paste into Slack. Use when the user asks for a standup rota, who runs standup next week, or invokes /standup-rota.
argument-hint: "[this|next|YYYY-MM-DD]"
---

# Standup rota

Pick one standup host per working day (Monday to Friday) of a week from the Midas team's capacity in Azure DevOps. Nothing is written to ADO.

1. Take the week from `$ARGUMENTS`: `this`, `next`, or any date in the week as `YYYY-MM-DD`. Default `next`.
2. Run:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/standup-rota/rota.mjs <week>
   ```

   It reads the team's iterations, capacity and days off with the az CLI, for every iteration the week touches. Only people with capacity above 0 per day are in the rota. Each run draws a new random order, and nobody hosts twice in a week while someone else free that day hasn't hosted yet.
3. It prints the rota as text, then `Image: <path>`: a PNG of the rota rendered with headless Chrome (or Edge). On macOS the PNG is already on the clipboard, so tell the user to paste it into Slack. If you can send files to the user, send the PNG too. Show the text lines in chat, and if a day says `no standup (…)`, say why in one line. With no Chrome or Edge, the script gives an HTML file instead: pass its path on.
4. If az fails, show its error as it came back. When it says the user isn't signed in, tell them to run `az login`.

To redraw, run it again. When the user wants to swap two people, edit the text for them instead of redrawing.

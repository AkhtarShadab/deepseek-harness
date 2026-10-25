# MyPresets

Portable user presets and skills for DeepSeek Harness. This directory is tracked on the `MyPresets` branch of the user's deepseek-harness fork; it is not part of the upstream product build.

## Contents

- `bundles/viralclip-preset` — ViralClip agent preset, Everygen guidance, and local skill-provider configuration.
- `bundles/everygen-mcp` — Everygen Streamable HTTP MCP connection and cross-platform OAuth helper.
- `bundles/studypartner-preset`, `bundles/researcher-preset`, `bundles/system-design-preset` — user agent presets.
- `skills/yt-*` — eleven MIT-licensed YouTube workflow skills from [youtube-agent-skill](https://github.com/Jakeschincariol/youtube-agent-skill).

ViralClip resolves the skill directory relative to its own bundle, so the checkout can live at any path. Each skill's Python helpers are stored beside its `SKILL.md`; Python 3 is required to run those helpers.

## Install on a machine

1. Clone this fork and check out the `MyPresets` branch.
2. In the target DSH profile, install each directory under `mypresets/bundles/` as a bundle using the Harness Plugin Manager (`install_bundle` with the absolute directory path). Keep all five bundle directories in the same checkout.
3. Select ViralClip, StudyPartner, Researcher, or System Design from the preset picker. The YouTube skills are loaded by the ViralClip preset's filesystem skill provider.
4. For Everygen, run `node mypresets/bundles/everygen-mcp/everygen-auth.mjs login` once and approve access in the browser. Tokens are stored outside the repository under `~/.everygen/tokens.json`. Run the same helper with `refresh` when the access token expires; restart or reload the MCP bundle so it reads the refreshed token.

The Everygen MCP endpoint requires OAuth. Never commit token files or paste access/refresh tokens into Git or chat. The MCP client sends the bearer token from the home token file at startup; no environment variable is needed.

## Updating the YouTube skills

The skills are copied from the MIT-licensed upstream repository. To update them, replace the corresponding directories under `skills/` with the desired upstream versions, review the changes, then commit them to `MyPresets`.

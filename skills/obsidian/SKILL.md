---
name: obsidian
description: Work with Obsidian vaults (plain Markdown notes) and automate via obsidian-cli.
homepage: https://help.obsidian.md
metadata: {"clawdbot":{"emoji":"💎","requires":{"bins":["obsidian-cli"]},"install":[{"id":"brew","kind":"brew","formula":"yakitrak/yakitrak/obsidian-cli","bins":["obsidian-cli"],"label":"Install obsidian-cli (brew)"}]}}
---

# Obsidian

Obsidian vault = a normal folder on disk.

## Vault Structure (typical)

- Notes: `*.md` (plain text Markdown; edit with any editor)
- Config: `.obsidian/` (workspace + plugin settings)
- Canvases: `*.canvas` (JSON)
- Attachments: whatever folder you chose in Obsidian settings

## Find the active vault(s)

Obsidian desktop tracks vaults here:
- `~/Library/Application Support/obsidian/obsidian.json`

`obsidian-cli` resolves vaults from that file; vault name is typically the **folder name** (path suffix).

Fast "what vault is active / where are the notes?":
- If you've already set a default: `obsidian-cli print-default --path-only`
- Otherwise, read `~/Library/Application Support/obsidian/obsidian.json` and use the vault entry with `"open": true`.

Notes:
- Multiple vaults common (iCloud vs `~/Documents`, work/personal, etc.). Don't guess; read config.
- Avoid writing hardcoded vault paths into scripts; prefer reading the config or using `print-default`.

## obsidian-cli quick start

Pick a default vault (once):
- `obsidian-cli set-default "<vault-folder-name>"`
- `obsidian-cli print-default` / `obsidian-cli print-default --path-only`

**Search:**
- `obsidian-cli search "query"` (note names)
- `obsidian-cli search-content "query"` (inside notes; shows snippets + lines)

**Create:**
- `obsidian-cli create "Folder/New note" --content "..." --open`
- Requires Obsidian URI handler (`obsidian://…`) working (Obsidian installed).
- Avoid creating notes under "hidden" dot-folders via URI.

**Move/rename** (safe refactor - updates wikilinks):
- `obsidian-cli move "old/path/note" "new/path/note"`

**Delete:**
- `obsidian-cli delete "path/note"`

Prefer direct edits when appropriate: open the `.md` file and change it; Obsidian will pick it up.

# Mealie Shopping List Sync

A Joplin plugin that synchronizes one Mealie shopping list with one Markdown note. Mealie owns list content and ordering; checkbox changes made in Joplin are sent back to Mealie.

## Requirements

- Joplin 3.5 or newer on desktop or mobile
- Mealie 2.0 or newer
- A Mealie long-lived API token
- Network access from every Joplin device to the Mealie server

Use HTTPS with a certificate trusted by each device for production installations. HTTP is supported for trusted local development networks.

## Setup

1. Open Joplin settings and select **Mealie Shopping List Sync**.
2. Enter the Mealie base URL and API token.
3. Optionally change automatic sync or its interval (five minutes by default).
4. On desktop, run **Tools → Connect Mealie Shopping List** and select a list. On mobile, open any note in edit mode and tap the link button in the editor toolbar.

The plugin creates the target note in the selected notebook, or reuses a unique existing note for that Mealie list. Use **Sync Mealie Shopping List Now**, the desktop note-toolbar button, or the **Sync with Mealie** button in the rendered note for an immediate sync. Checked items are hidden in the rendered note by default; use **Show checked (N)** to reveal or collapse them without changing the Markdown.

Only checkboxes on generated, identified rows are written back to Mealie. Text edits, additions, deletion, movement, and regrouping inside the managed block are restored from Mealie. Content outside the managed block is preserved.

## Development

This repository uses the official Joplin plugin-generator framework.

```sh
npm install
npm test
npm run lint
npm run dist
```

`npm run dist` creates `publish/mealie.joplin.shopping-list-sync.jpl`. Load the repository directory as a development plugin in Joplin, or install the `.jpl` manually.

## Mobile notes

On Android or iOS, open any note in edit mode and tap the link button in the editor toolbar to connect a shopping list. The adjacent sync button triggers a manual sync while the connected note is open. Android also supports manual `.jpl` installation. iOS only installs plugins approved for Joplin's recommended catalogue, so public iOS availability depends on that review.

## License

MIT

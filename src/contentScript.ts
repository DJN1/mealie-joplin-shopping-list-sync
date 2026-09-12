function escapeHtml(value: unknown): string {
	return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

interface RenderedItem {
	id: string;
	checked: boolean;
	display: string;
	group: string;
	groupPosition: number;
	position: number;
}

function isRenderedItem(item: unknown): item is RenderedItem {
	if (!item || typeof item !== 'object') return false;
	const value = item as Partial<RenderedItem>;
	return typeof value.id === 'string' && typeof value.checked === 'boolean'
		&& typeof value.display === 'string' && typeof value.group === 'string'
		&& typeof value.groupPosition === 'number' && Number.isFinite(value.groupPosition)
		&& typeof value.position === 'number' && Number.isFinite(value.position);
}

module.exports = {
	default: function(context: { contentScriptId: string }) {
		return {
			plugin: function(markdownIt: any) {
				const fallback = markdownIt.renderer.rules.fence || ((tokens: any[], index: number, options: unknown, env: unknown, self: any) => self.renderToken(tokens, index, options));
				markdownIt.renderer.rules.fence = (tokens: any[], index: number, options: unknown, env: unknown, self: any) => {
					const token = tokens[index];
					if (String(token.info || '').trim() !== 'mealie-shopping-list') return fallback(tokens, index, options, env, self);
					let document: { version?: number; items?: RenderedItem[] };
					try { document = JSON.parse(String(token.content || '')); } catch { return fallback(tokens, index, options, env, self); }
					if (document.version !== 2 || !Array.isArray(document.items) || !document.items.every(isRenderedItem)) return fallback(tokens, index, options, env, self);

					const groups = new Map<string, { position: number; items: RenderedItem[] }>();
					for (const item of document.items) {
						if (!groups.has(item.group)) groups.set(item.group, { position: item.groupPosition, items: [] });
						groups.get(item.group)!.items.push(item);
					}
					const listHtml = [...groups.entries()]
						.sort(([aName, a], [bName, b]) => a.position - b.position || aName.localeCompare(bName))
						.map(([name, group]) => `<section><h2>${escapeHtml(name)}</h2><ul class="mealie-items">${group.items
							.sort((a, b) => a.position - b.position || a.display.localeCompare(b.display) || a.id.localeCompare(b.id))
							.map(item => `<li${item.checked ? ' class="mealie-sync-checked-item"' : ''}><label><input type="checkbox" data-mealie-item-id="${escapeHtml(item.id)}"${item.checked ? ' checked' : ''}> ${escapeHtml(item.display)}</label></li>`).join('')}</ul></section>`).join('');
					const checkedCount = document.items.filter(item => item.checked).length;
					const source = markdownIt.utils.escapeHtml(String(token.content || '').trimEnd());
					return `<div class="joplin-editable">
						<pre class="joplin-source" hidden data-joplin-language="mealie-shopping-list" data-joplin-source-open="\`\`\`mealie-shopping-list&#10;" data-joplin-source-close="&#10;\`\`\`&#10;">${source}</pre>
						<div class="mealie-shopping-list" data-content-script-id="${escapeHtml(context.contentScriptId)}">
							<div class="mealie-sync-control"><button type="button" class="mealie-sync-button">Sync with Mealie</button><button type="button" class="mealie-checked-toggle" aria-expanded="false"${checkedCount ? '' : ' hidden'}>Show checked (${checkedCount})</button><span class="mealie-sync-status" role="status" aria-live="polite"></span></div>
							${listHtml}
						</div>
					</div>`;
				};
			},
			assets: () => [{ name: './syncButton.css' }, { name: './syncButton.js' }],
		};
	},
};

const START_PATTERN = /^<!-- mealie-sync:start:v1 list-id=([0-9a-f-]+) -->\s*$/i;
const END_PATTERN = /^<!-- mealie-sync:end:v1 -->\s*$/i;

module.exports = {
	default: function(context: { contentScriptId: string }) {
		return {
			plugin: function(markdownIt: any, pluginOptions: { settingValue: (key: string) => unknown }) {
				let renderingManagedList = false;
				for (const ruleName of ['html_block', 'html_inline']) {
					const original = markdownIt.renderer.rules[ruleName] || ((tokens: any[], index: number) => tokens[index].content);
					markdownIt.renderer.rules[ruleName] = (tokens: any[], index: number, options: unknown, env: unknown, self: unknown) => {
						const rendered = original(tokens, index, options, env, self);
						const content = String(tokens[index].content || '').trim();
						const match = content.match(START_PATTERN);
						const configuredListId = String(pluginOptions.settingValue('shoppingListId') || '');
						if (match && configuredListId && match[1] === configuredListId) {
							renderingManagedList = true;
							return `${rendered}<div class="mealie-sync-control"><button type="button" class="mealie-sync-button" data-content-script-id="${context.contentScriptId}">Sync with Mealie</button><button type="button" class="mealie-checked-toggle" aria-expanded="false" hidden></button><span class="mealie-sync-status" role="status" aria-live="polite"></span></div>`;
						}
						if (renderingManagedList && END_PATTERN.test(content)) {
							renderingManagedList = false;
							return `${rendered}<span class="mealie-sync-end-boundary" hidden></span>`;
						}
						return rendered;
					};
				}
			},
			assets: () => [{ name: './syncButton.css' }, { name: './syncButton.js' }],
		};
	},
};

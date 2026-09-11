const contentScript = require('../src/contentScript');

function render(listId: string, configuredListId: string): string {
	const markdownIt = { renderer: { rules: {} as Record<string, (...args: any[]) => string> } };
	contentScript.default({ contentScriptId: 'mealieSyncButton' }).plugin(markdownIt, { settingValue: () => configuredListId });
	const token = { content: `<!-- mealie-sync:start:v1 list-id=${listId} -->` };
	return markdownIt.renderer.rules.html_block([token], 0, {}, {}, {});
}

test('renders the in-note sync button only for the configured list', () => {
	const listId = '11111111-1111-4111-8111-111111111111';
	expect(render(listId, listId)).toContain('Sync with Mealie');
	expect(render(listId, listId)).toContain('mealie-checked-toggle');
	expect(render(listId, '22222222-2222-4222-8222-222222222222')).not.toContain('Sync with Mealie');
});

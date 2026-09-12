import { managedDocument } from '../src/markdown';
import { ShoppingList } from '../src/types';

const contentScript = require('../src/contentScript');

const list: ShoppingList = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Weekly',
	listItems: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', checked: true, display: '<Milk>', label: { name: 'Dairy', position: 1 } }],
};

test('renders a rich-text-safe editable fence with interactive controls', () => {
	const fallback = jest.fn(() => 'fallback');
	const markdownIt = { utils: { escapeHtml: (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;') }, renderer: { rules: { fence: fallback } } };
	contentScript.default({ contentScriptId: 'mealieSyncButton' }).plugin(markdownIt);
	const renderFence = markdownIt.renderer.rules.fence as (...args: any[]) => string;
	const html = renderFence([{ info: 'mealie-shopping-list', content: JSON.stringify(managedDocument(list)) }], 0, {}, {}, {});
	expect(html).toContain('class="joplin-editable"');
	expect(html).toContain('class="joplin-source"');
	expect(html).toContain('data-joplin-source-open="```mealie-shopping-list&#10;"');
	expect(html).toContain('Sync with Mealie');
	expect(html).toContain('data-mealie-item-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"');
	expect(html).toContain('&lt;Milk&gt;');
});

test('leaves unrelated fences alone', () => {
	const fallback = jest.fn(() => 'fallback');
	const markdownIt = { renderer: { rules: { fence: fallback } } };
	contentScript.default({ contentScriptId: 'mealieSyncButton' }).plugin(markdownIt);
	const renderFence = markdownIt.renderer.rules.fence as (...args: any[]) => string;
	expect(renderFence([{ info: 'javascript', content: 'x' }], 0, {}, {}, {})).toBe('fallback');
});

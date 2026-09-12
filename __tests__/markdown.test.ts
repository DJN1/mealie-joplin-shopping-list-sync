import { checkboxUpdates, createNoteBody, displayItem, managedDocument, parseManagedBlock, renderManagedBlock, replaceManagedBlock } from '../src/markdown';
import { ShoppingList } from '../src/types';

const list: ShoppingList = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Weekly',
	listItems: [
		{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', checked: false, position: 2, display: 'Milk', label: { id: '1', name: 'Dairy', position: 1 } },
		{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', checked: true, position: 1, display: 'Bread', label: null },
	],
};

describe('managed Markdown', () => {
	test('renders parseable, ordered, idempotent Markdown', () => {
		const body = createNoteBody(list);
		const parsed = parseManagedBlock(body);
		expect(parsed.listId).toBe(list.id);
		expect(parsed.baseline).toEqual({
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': false,
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb': true,
		});
		expect(body).toContain('```mealie-shopping-list');
		expect(replaceManagedBlock(body, list)).toBe(body);
	});

	test('preserves content outside the managed block', () => {
		const body = `before\n${renderManagedBlock(list)}\nafter`;
		expect(replaceManagedBlock(body, { ...list, name: 'Changed' })).toMatch(/^before\n[\s\S]+\nafter$/);
	});

	test('detects only local checkbox changes', () => {
		const document = managedDocument(list);
		document.items[0].checked = true;
		document.items[1].checked = false;
		const body = `\`\`\`mealie-shopping-list\n${JSON.stringify(document)}\n\`\`\`\n`;
		const updates = checkboxUpdates(parseManagedBlock(body), list);
		expect(updates.map(item => [item.id, item.checked])).toEqual([
			['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true],
			['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false],
		]);
	});

	test('ignores deleted and unknown rows', () => {
		const document = managedDocument(list);
		document.items = [{ ...document.items[0], id: 'unknown', checked: true }];
		const body = `\`\`\`mealie-shopping-list\n${JSON.stringify(document)}\n\`\`\`\n`;
		expect(checkboxUpdates(parseManagedBlock(body), list)).toEqual([]);
	});

	test('rejects duplicate or malformed blocks', () => {
		const block = renderManagedBlock(list);
		expect(() => parseManagedBlock(`${block}\n${block}`)).toThrow(/exactly one/);
		expect(() => parseManagedBlock('plain note')).toThrow(/exactly one/);
	});

	test('escapes remote Markdown and creates deterministic fallback displays', () => {
		expect(displayItem({ id: 'x', checked: false, display: '# [Milk]\n<!-- bad -->' })).toBe('# [Milk] <!-- bad -->');
		expect(displayItem({ id: 'x', checked: false, quantity: 2, unit: { name: 'kg' }, food: { name: 'Flour' }, note: 'Flour' })).toBe('2 kg Flour');
	});

	test('parses legacy blocks so they can be migrated on sync', () => {
		const legacy = '<!-- mealie-sync:start:v1 list-id=11111111-1111-4111-8111-111111111111 -->\n<!-- mealie-sync:state:v1 {"items":{"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa":false}} -->\n- [x] Milk <!-- mealie-sync:item:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa -->\n<!-- mealie-sync:end:v1 -->';
		expect(parseManagedBlock(legacy).checkboxes['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']).toBe(true);
		expect(replaceManagedBlock(legacy, list)).toContain('```mealie-shopping-list');
	});
});

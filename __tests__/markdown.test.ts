import { checkboxUpdates, createNoteBody, displayItem, parseManagedBlock, renderManagedBlock, replaceManagedBlock } from '../src/markdown';
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
		expect(body.indexOf('## Dairy')).toBeLessThan(body.indexOf('## Other'));
		expect(replaceManagedBlock(body, list)).toBe(body);
	});

	test('preserves content outside the managed block', () => {
		const body = `before\n${renderManagedBlock(list)}\nafter`;
		expect(replaceManagedBlock(body, { ...list, name: 'Changed' })).toMatch(/^before\n[\s\S]+\nafter$/);
	});

	test('detects only local checkbox changes', () => {
		const body = createNoteBody(list).replace('- [ ] Milk', '- [x] Milk').replace('- [x] Bread', '- [ ] Bread');
		const updates = checkboxUpdates(parseManagedBlock(body), list);
		expect(updates.map(item => [item.id, item.checked])).toEqual([
			['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true],
			['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false],
		]);
	});

	test('ignores deleted and unknown rows', () => {
		const body = createNoteBody(list).replace(/^- \[ \] Milk .*aaaaaaaa.*\n/m, '') + '- [x] Unknown\n';
		expect(checkboxUpdates(parseManagedBlock(body), list)).toEqual([]);
	});

	test('rejects duplicate or malformed blocks', () => {
		const block = renderManagedBlock(list);
		expect(() => parseManagedBlock(`${block}\n${block}`)).toThrow(/exactly one/);
		expect(() => parseManagedBlock('plain note')).toThrow(/exactly one/);
	});

	test('escapes remote Markdown and creates deterministic fallback displays', () => {
		expect(displayItem({ id: 'x', checked: false, display: '# [Milk]\n<!-- bad -->' })).toBe('\\# \\[Milk\\] \\<!-- bad --\\>');
		expect(displayItem({ id: 'x', checked: false, quantity: 2, unit: { name: 'kg' }, food: { name: 'Flour' }, note: 'Flour' })).toBe('2 kg Flour');
	});
});

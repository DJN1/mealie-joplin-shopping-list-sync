import { createNoteBody } from '../src/markdown';
import { SyncEngine } from '../src/syncEngine';
import { ShoppingList } from '../src/types';

test('pushes a local checkbox and then renders the refetched remote list', async () => {
	const initial: ShoppingList = { id: '11111111-1111-4111-8111-111111111111', name: 'List', listItems: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', checked: false, display: 'Milk' }] };
	const localBody = createNoteBody(initial).replace('- [ ] Milk', '- [x] Milk');
	const note = { id: 'note', title: 'Old', body: localBody };
	const notes = { getNote: jest.fn(async () => note), updateNote: jest.fn(async () => undefined) };
	const updated = { ...initial, name: 'Renamed', listItems: [{ ...initial.listItems[0], checked: true }] };
	const client = { getList: jest.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(updated), updateItems: jest.fn(async () => undefined) };
	const result = await new SyncEngine(notes, client as never).sync(note.id, initial.id);
	expect(client.updateItems).toHaveBeenCalledWith([expect.objectContaining({ checked: true, display: 'Milk' })]);
	expect(notes.updateNote).toHaveBeenCalledWith('note', expect.objectContaining({ title: 'Mealie – Renamed', body: expect.stringContaining('- [x] Milk') }));
	expect(result.changed).toBe(true);
});

test('does not modify the note when a remote update fails', async () => {
	const list: ShoppingList = { id: '11111111-1111-4111-8111-111111111111', name: 'List', listItems: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', checked: false, display: 'Milk' }] };
	const note = { id: 'note', title: 'Mealie – List', body: createNoteBody(list).replace('- [ ] Milk', '- [x] Milk') };
	const notes = { getNote: jest.fn(async () => note), updateNote: jest.fn(async () => undefined) };
	const client = { getList: jest.fn(async () => list), updateItems: jest.fn(async () => { throw new Error('offline'); }) };
	await expect(new SyncEngine(notes, client as never).sync(note.id, list.id)).rejects.toThrow('offline');
	expect(notes.updateNote).not.toHaveBeenCalled();
});

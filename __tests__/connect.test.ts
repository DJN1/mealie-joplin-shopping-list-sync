const damagedNote = { id: 'shared-note', title: 'Mealie – Shared', body: '&nbsp;\n\n- [ ] Milk', parent_id: 'shared-folder' };
const joplinMock = {
	views: { dialogs: {
		create: jest.fn(async () => 'dialog'),
		setHtml: jest.fn(async () => undefined),
		setButtons: jest.fn(async () => undefined),
		open: jest.fn(async () => ({ id: 'ok', formData: { connect: { listId: 'list-id' } } })),
	} },
	data: {
		get: jest.fn(async () => ({ items: [damagedNote], has_more: false })),
		post: jest.fn(async () => { throw new Error('A duplicate note should not be created.'); }),
		userDataGet: jest.fn(async () => ({ version: 2, listId: 'list-id', items: {} })),
		userDataSet: jest.fn(async () => undefined),
	},
	settings: { setValue: jest.fn(async () => undefined) },
	workspace: { selectedFolder: jest.fn(async () => ({ id: 'folder' })) },
};

jest.mock('api', () => ({ __esModule: true, default: joplinMock }));

import { connect } from '../src/connect';

test('reuses a damaged shared note identified by synchronized user data', async () => {
	const client = {
		getLists: jest.fn(async () => [{ id: 'list-id', name: 'Shared' }]),
		getList: jest.fn(async () => ({ id: 'list-id', name: 'Shared', listItems: [] })),
	};
	await expect(connect(client as never)).resolves.toEqual(damagedNote);
	expect(joplinMock.data.userDataGet).toHaveBeenCalled();
	expect(joplinMock.data.post).not.toHaveBeenCalled();
	expect(joplinMock.settings.setValue).toHaveBeenCalledWith('shoppingListId', 'list-id');
});

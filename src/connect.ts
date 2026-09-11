import joplin from 'api';
import { MealieClient } from './mealie';
import { createNoteBody, listMarker, parseManagedBlock } from './markdown';
import { saveConnection } from './settings';
import { JoplinNote, ShoppingListSummary } from './types';
import { SyncError } from './errors';

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function chooseList(lists: ShoppingListSummary[]): Promise<string | null> {
	if (!lists.length) throw new SyncError('not-found', 'No Mealie shopping lists are available.');
	const dialog = await joplin.views.dialogs.create('mealieConnectDialog');
	await joplin.views.dialogs.setHtml(dialog, `<form name="connect"><label for="listId">Shopping list</label><select id="listId" name="listId" required>${lists.map(list => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)}</option>`).join('')}</select></form>`);
	await joplin.views.dialogs.setButtons(dialog, [{ id: 'cancel', title: 'Cancel' }, { id: 'ok', title: 'Connect' }]);
	const result = await joplin.views.dialogs.open(dialog);
	if (result.id !== 'ok') return null;
	return String(result.formData?.connect?.listId || '');
}

async function findExistingNotes(listId: string): Promise<JoplinNote[]> {
	const found: JoplinNote[] = [];
	let page = 1;
	for (;;) {
		const response = await joplin.data.get(['search'], { query: 'mealie-sync', type: 'note', fields: ['id', 'title', 'body', 'parent_id'], page, limit: 100 });
		for (const note of response.items || []) if (String(note.body || '').includes(listMarker(listId))) found.push(note as JoplinNote);
		if (!response.has_more) break;
		page += 1;
	}
	return found;
}

export async function connect(client: MealieClient): Promise<JoplinNote | null> {
	const listId = await chooseList(await client.getLists());
	if (!listId) return null;
	const list = await client.getList(listId);
	const matches = await findExistingNotes(listId);
	if (matches.length > 1) throw new SyncError('validation', 'Multiple notes are connected to this Mealie list. Remove the duplicate sync block and try again.');
	let note: JoplinNote;
	if (matches.length === 1) {
		note = matches[0];
		parseManagedBlock(note.body);
	} else {
		const folder = await joplin.workspace.selectedFolder();
		note = await joplin.data.post(['notes'], null, { parent_id: folder?.id, title: `Mealie – ${list.name}`, body: createNoteBody(list) }) as JoplinNote;
	}
	await saveConnection(listId, note.id);
	return note;
}

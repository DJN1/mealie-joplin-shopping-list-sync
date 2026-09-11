import { SyncError } from './errors';
import { checkboxUpdates, parseManagedBlock, replaceManagedBlock } from './markdown';
import { MealieClient } from './mealie';
import { JoplinNote, SyncResult } from './types';

export interface NoteStore {
	getNote(id: string): Promise<JoplinNote | null>;
	updateNote(id: string, changes: { title?: string; body?: string }): Promise<void>;
}

export class SyncEngine {
	public constructor(private readonly notes: NoteStore, private readonly client: MealieClient) {}

	public async sync(noteId: string, listId: string): Promise<SyncResult> {
		const note = await this.notes.getNote(noteId);
		if (!note) throw new SyncError('not-found', 'The connected Joplin note no longer exists.');
		const parsed = parseManagedBlock(note.body);
		if (parsed.listId !== listId) throw new SyncError('validation', 'The connected note belongs to a different Mealie list.');
		let list = await this.client.getList(listId);
		const updates = checkboxUpdates(parsed, list);
		if (updates.length) {
			await this.client.updateItems(updates);
			list = await this.client.getList(listId);
		}
		const body = replaceManagedBlock(note.body, list);
		const title = `Mealie – ${list.name.replace(/[\r\n\t]+/g, ' ').trim()}`;
		if (body === note.body && title === note.title) return { changed: false, message: 'Already up to date.' };
		await this.notes.updateNote(noteId, { body, title });
		return { changed: true, message: updates.length ? `Synced ${updates.length} checkbox change${updates.length === 1 ? '' : 's'}.` : 'Shopping list refreshed.' };
	}
}

import { SyncError } from './errors';
import { checkboxUpdates, createNoteBody, looksLikeDamagedManagedNote, parseManagedBlock, replaceManagedBlock } from './markdown';
import type { NoteSyncState } from './joplinStore';
import { MealieClient } from './mealie';
import { JoplinNote, ShoppingList, SyncResult } from './types';

export interface NoteStore {
	getNote(id: string): Promise<JoplinNote | null>;
	updateNote(id: string, changes: { title?: string; body?: string }): Promise<void>;
	getSyncState?(id: string): Promise<NoteSyncState | null>;
	setSyncState?(id: string, state: NoteSyncState): Promise<void>;
}

export class SyncEngine {
	public constructor(private readonly notes: NoteStore, private readonly client: MealieClient) {}

	public async sync(noteId: string, listId: string): Promise<SyncResult> {
		const note = await this.notes.getNote(noteId);
		if (!note) throw new SyncError('not-found', 'The connected Joplin note no longer exists.');
		let parsed;
		try { parsed = parseManagedBlock(note.body); }
		catch (error) {
			const recovery = await this.notes.getSyncState?.(noteId);
			if (recovery?.listId !== listId && !looksLikeDamagedManagedNote(note)) throw error;
			const list = await this.client.getList(listId);
			const body = createNoteBody(list);
			const title = `Mealie – ${list.name.replace(/[\r\n\t]+/g, ' ').trim()}`;
			await this.notes.updateNote(noteId, { body, title });
			await this.saveState(noteId, list);
			return { changed: true, message: 'Repaired the shopping-list note and refreshed it from Mealie.' };
		}
		if (parsed.listId !== listId) throw new SyncError('validation', 'The connected note belongs to a different Mealie list.');
		let list = await this.client.getList(listId);
		const updates = checkboxUpdates(parsed, list);
		if (updates.length) {
			await this.client.updateItems(updates);
			list = await this.client.getList(listId);
		}
		const body = replaceManagedBlock(note.body, list);
		const title = `Mealie – ${list.name.replace(/[\r\n\t]+/g, ' ').trim()}`;
		if (body === note.body && title === note.title) {
			await this.saveState(noteId, list);
			return { changed: false, message: 'Already up to date.' };
		}
		await this.notes.updateNote(noteId, { body, title });
		await this.saveState(noteId, list);
		return { changed: true, message: updates.length ? `Synced ${updates.length} checkbox change${updates.length === 1 ? '' : 's'}.` : 'Shopping list refreshed.' };
	}

	private async saveState(noteId: string, list: ShoppingList): Promise<void> {
		await this.notes.setSyncState?.(noteId, { version: 2, listId: list.id, items: Object.fromEntries(list.listItems.map(item => [item.id, item.checked])) });
	}
}

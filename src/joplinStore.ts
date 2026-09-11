import joplin from 'api';
import { JoplinNote } from './types';
import { NoteStore } from './syncEngine';

export class JoplinNoteStore implements NoteStore {
	public lastWrittenHash = '';

	public async getNote(id: string): Promise<JoplinNote | null> {
		try {
			return await joplin.data.get(['notes', id], { fields: ['id', 'title', 'body', 'parent_id'] }) as JoplinNote;
		} catch (error) {
			if (String(error).includes('404') || String(error).toLowerCase().includes('not found')) return null;
			throw error;
		}
	}

	public async updateNote(id: string, changes: { title?: string; body?: string }): Promise<void> {
		this.lastWrittenHash = simpleHash(`${changes.title ?? ''}\u0000${changes.body ?? ''}`);
		await joplin.data.put(['notes', id], null, changes);
	}
}

export function simpleHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16);
}

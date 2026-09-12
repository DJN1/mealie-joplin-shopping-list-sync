import { SyncError } from './errors';
import { ShoppingList, ShoppingListItem } from './types';

export const SHOPPING_MARKER = '```mealie-shopping-list';
const FENCE_RE = /^```mealie-shopping-list[ \t]*\n([\s\S]*?)\n```[ \t]*$/gim;
const LEGACY_START_RE = /^<!-- mealie-sync:start:v1 list-id=([0-9a-f-]+) -->$/gim;
const LEGACY_END_RE = /^<!-- mealie-sync:end:v1 -->$/gim;
const LEGACY_STATE_RE = /^<!-- mealie-sync:state:v1 (\{.*\}) -->$/gim;
const LEGACY_ITEM_RE = /^\s*[-*+]\s+\[([ xX])\]\s+.*?<!-- mealie-sync:item:([0-9a-f-]+) -->\s*$/gm;

export interface ManagedItem {
	id: string;
	checked: boolean;
	baseline: boolean;
	display: string;
	group: string;
	groupPosition: number;
	position: number;
}

export interface ManagedDocument {
	version: 2;
	listId: string;
	items: ManagedItem[];
}

export interface ParsedManagedBlock {
	listId: string;
	baseline: Record<string, boolean>;
	checkboxes: Record<string, boolean>;
	start: number;
	end: number;
}

function matches(regex: RegExp, text: string): RegExpMatchArray[] {
	regex.lastIndex = 0;
	return Array.from(text.matchAll(regex));
}

function parseDocument(value: unknown): ManagedDocument {
	if (!value || typeof value !== 'object') throw new SyncError('validation', 'The Mealie shopping-list block is malformed.');
	const document = value as Partial<ManagedDocument>;
	if (document.version !== 2 || typeof document.listId !== 'string' || !Array.isArray(document.items)) {
		throw new SyncError('validation', 'The Mealie shopping-list block is malformed.');
	}
	for (const item of document.items) {
		if (!item || typeof item.id !== 'string' || typeof item.checked !== 'boolean' || typeof item.baseline !== 'boolean'
			|| typeof item.display !== 'string' || typeof item.group !== 'string'
			|| typeof item.groupPosition !== 'number' || !Number.isFinite(item.groupPosition)
			|| typeof item.position !== 'number' || !Number.isFinite(item.position)) {
			throw new SyncError('validation', 'The Mealie shopping-list block contains an invalid item.');
		}
	}
	return document as ManagedDocument;
}

function parseFencedBlock(body: string): ParsedManagedBlock | null {
	const fences = matches(FENCE_RE, body);
	if (!fences.length) return null;
	if (fences.length !== 1) throw new SyncError('validation', 'The note must contain exactly one Mealie shopping-list block.');
	let decoded: unknown;
	try { decoded = JSON.parse(fences[0][1]); } catch { throw new SyncError('validation', 'The Mealie shopping-list block is malformed.'); }
	const document = parseDocument(decoded);
	const baseline: Record<string, boolean> = {};
	const checkboxes: Record<string, boolean> = {};
	for (const item of document.items) {
		if (item.id in checkboxes) throw new SyncError('validation', `The note contains duplicate Mealie item ${item.id}.`);
		baseline[item.id] = item.baseline;
		checkboxes[item.id] = item.checked;
	}
	return { listId: document.listId, baseline, checkboxes, start: fences[0].index!, end: fences[0].index! + fences[0][0].length };
}

function parseLegacyBlock(body: string): ParsedManagedBlock {
	const starts = matches(LEGACY_START_RE, body);
	const ends = matches(LEGACY_END_RE, body);
	if (starts.length !== 1 || ends.length !== 1) throw new SyncError('validation', 'The note must contain exactly one valid Mealie sync block.');
	const start = starts[0].index!;
	const end = ends[0].index! + ends[0][0].length;
	if (ends[0].index! <= start) throw new SyncError('validation', 'The Mealie sync markers are out of order.');
	const block = body.slice(start, end);
	const states = matches(LEGACY_STATE_RE, block);
	if (states.length !== 1) throw new SyncError('validation', 'The Mealie sync block must contain exactly one state marker.');
	let decoded: unknown;
	try { decoded = JSON.parse(states[0][1]); } catch { throw new SyncError('validation', 'The Mealie sync state is malformed.'); }
	if (!decoded || typeof decoded !== 'object' || !('items' in decoded) || typeof (decoded as { items: unknown }).items !== 'object') {
		throw new SyncError('validation', 'The Mealie sync state is malformed.');
	}
	const baseline: Record<string, boolean> = {};
	for (const [id, checked] of Object.entries((decoded as { items: Record<string, unknown> }).items)) {
		if (typeof checked !== 'boolean') throw new SyncError('validation', 'The Mealie sync state contains an invalid checkbox value.');
		baseline[id] = checked;
	}
	const checkboxes: Record<string, boolean> = {};
	for (const match of matches(LEGACY_ITEM_RE, block)) {
		if (match[2] in checkboxes) throw new SyncError('validation', `The note contains duplicate Mealie item ${match[2]}.`);
		checkboxes[match[2]] = match[1].toLowerCase() === 'x';
	}
	return { listId: starts[0][1], baseline, checkboxes, start, end };
}

export function parseManagedBlock(body: string): ParsedManagedBlock {
	return parseFencedBlock(body) || parseLegacyBlock(body);
}

function cleanInline(value: unknown): string {
	return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function displayItem(item: ShoppingListItem): string {
	if (cleanInline(item.display)) return cleanInline(item.display);
	const values = [item.quantity, item.unit?.name, item.food?.name, item.note].map(cleanInline).filter(Boolean);
	return values.filter((value, index) => values.indexOf(value) === index).join(' ') || 'Unnamed item';
}

function position(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function managedDocument(list: ShoppingList): ManagedDocument {
	return {
		version: 2,
		listId: list.id,
		items: list.listItems.map(item => ({
			id: item.id,
			checked: item.checked,
			baseline: item.checked,
			display: displayItem(item),
			group: cleanInline(item.label?.name) || 'Other',
			groupPosition: item.label?.name ? position(item.label?.position) : Number.MAX_SAFE_INTEGER,
			position: position(item.position),
		})),
	};
}

export function renderManagedBlock(list: ShoppingList): string {
	return `${SHOPPING_MARKER}\n${JSON.stringify(managedDocument(list))}\n\`\`\``;
}

export function createNoteBody(list: ShoppingList): string {
	return `${renderManagedBlock(list)}\n`;
}

export function replaceManagedBlock(body: string, list: ShoppingList): string {
	const parsed = parseManagedBlock(body);
	return body.slice(0, parsed.start) + renderManagedBlock(list) + body.slice(parsed.end);
}

export function checkboxUpdates(parsed: ParsedManagedBlock, list: ShoppingList): ShoppingListItem[] {
	const remote = new Map(list.listItems.map(item => [item.id, item]));
	const updates: ShoppingListItem[] = [];
	for (const [id, checked] of Object.entries(parsed.checkboxes)) {
		const item = remote.get(id);
		if (item && id in parsed.baseline && checked !== parsed.baseline[id]) updates.push({ ...item, checked });
	}
	return updates;
}

export function listMarker(listId: string): string {
	return `"listId":"${listId}"`;
}

export function looksLikeDamagedManagedNote(note: { title: string; body: string }): boolean {
	return /^Mealie\s+[–-]/i.test(note.title) && (/&nbsp;|\[\s*[xX ]\s*\]|type=["']checkbox/i.test(note.body));
}

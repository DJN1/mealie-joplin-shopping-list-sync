import { SyncError } from './errors';
import { ShoppingList, ShoppingListItem } from './types';

export const SHOPPING_MARKER = '<!-- shopping-list -->';
const START_RE = /^<!-- mealie-sync:start:v1 list-id=([0-9a-f-]+) -->$/gim;
const END_RE = /^<!-- mealie-sync:end:v1 -->$/gim;
const STATE_RE = /^<!-- mealie-sync:state:v1 (\{.*\}) -->$/gim;
const ITEM_RE = /^\s*[-*+]\s+\[([ xX])\]\s+.*?<!-- mealie-sync:item:([0-9a-f-]+) -->\s*$/gm;

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

export function parseManagedBlock(body: string): ParsedManagedBlock {
	const starts = matches(START_RE, body);
	const ends = matches(END_RE, body);
	if (starts.length !== 1 || ends.length !== 1) throw new SyncError('validation', 'The note must contain exactly one valid Mealie sync block.');
	const start = starts[0].index!;
	const end = ends[0].index! + ends[0][0].length;
	if (ends[0].index! <= start) throw new SyncError('validation', 'The Mealie sync markers are out of order.');
	const block = body.slice(start, end);
	const states = matches(STATE_RE, block);
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
	for (const match of matches(ITEM_RE, block)) {
		const id = match[2];
		if (id in checkboxes) throw new SyncError('validation', `The note contains duplicate Mealie item ${id}.`);
		checkboxes[id] = match[1].toLowerCase() === 'x';
	}
	return { listId: starts[0][1], baseline, checkboxes, start, end };
}

function cleanInline(value: unknown): string {
	return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeMarkdown(value: unknown): string {
	return cleanInline(value).replace(/([\\`*_[\]<>#])/g, '\\$1');
}

export function displayItem(item: ShoppingListItem): string {
	if (cleanInline(item.display)) return escapeMarkdown(item.display);
	const values = [item.quantity, item.unit?.name, item.food?.name, item.note].map(cleanInline).filter(Boolean);
	return escapeMarkdown(values.filter((value, index) => values.indexOf(value) === index).join(' ') || 'Unnamed item');
}

function position(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function renderManagedBlock(list: ShoppingList): string {
	const baseline = Object.fromEntries(list.listItems.map(item => [item.id, item.checked]));
	const groups = new Map<string, { name: string; position: number; items: ShoppingListItem[] }>();
	for (const item of list.listItems) {
		const name = cleanInline(item.label?.name) || 'Other';
		const key = item.label?.id || (name === 'Other' ? '__other__' : name);
		if (!groups.has(key)) groups.set(key, { name, position: name === 'Other' ? Number.MAX_SAFE_INTEGER : position(item.label?.position), items: [] });
		groups.get(key)!.items.push(item);
	}
	const lines = [
		`<!-- mealie-sync:start:v1 list-id=${list.id} -->`,
		`<!-- mealie-sync:state:v1 ${JSON.stringify({ items: baseline })} -->`,
	];
	for (const group of [...groups.values()].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))) {
		lines.push(`## ${escapeMarkdown(group.name)}`);
		for (const item of group.items.sort((a, b) => position(a.position) - position(b.position) || displayItem(a).localeCompare(displayItem(b)) || a.id.localeCompare(b.id))) {
			lines.push(`- [${item.checked ? 'x' : ' '}] ${displayItem(item)} <!-- mealie-sync:item:${item.id} -->`);
		}
	}
	lines.push('<!-- mealie-sync:end:v1 -->');
	return lines.join('\n');
}

export function createNoteBody(list: ShoppingList): string {
	return `${SHOPPING_MARKER}\n${renderManagedBlock(list)}\n`;
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
	return `<!-- mealie-sync:start:v1 list-id=${listId} -->`;
}

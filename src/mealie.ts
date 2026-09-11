import { SyncError } from './errors';
import { ShoppingList, ShoppingListItem, ShoppingListSummary } from './types';

export function normalizeBaseUrl(input: string): string {
	const value = input.trim();
	if (!value) throw new SyncError('configuration', 'Enter the Mealie base URL in plugin settings.');
	let url: URL;
	try { url = new URL(value); } catch { throw new SyncError('configuration', 'The Mealie base URL is not valid.'); }
	if (!['http:', 'https:'].includes(url.protocol)) throw new SyncError('configuration', 'The Mealie base URL must use HTTP or HTTPS.');
	if (url.username || url.password || url.search || url.hash) throw new SyncError('configuration', 'The Mealie base URL cannot contain credentials, a query, or a fragment.');
	url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/api$/i, '');
	return url.toString().replace(/\/$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSummary(value: unknown): ShoppingListSummary {
	if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
		throw new SyncError('validation', 'Mealie returned an invalid shopping list.');
	}
	return { id: value.id, name: value.name };
}

function parseItem(value: unknown): ShoppingListItem {
	if (!isRecord(value) || typeof value.id !== 'string' || typeof value.checked !== 'boolean') {
		throw new SyncError('validation', 'Mealie returned an invalid shopping list item.');
	}
	return value as ShoppingListItem;
}

export class MealieClient {
	private readonly baseUrl: string;

	public constructor(baseUrl: string, private readonly token: string, private readonly timeoutMs = 15_000) {
		this.baseUrl = normalizeBaseUrl(baseUrl);
		if (!token.trim()) throw new SyncError('configuration', 'Enter a Mealie API token in plugin settings.');
	}

	private async request(path: string, init: RequestInit = {}): Promise<unknown> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const response = await fetch(`${this.baseUrl}/api${path}`, {
				...init,
				signal: controller.signal,
				headers: { Accept: 'application/json', Authorization: `Bearer ${this.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
			});
			if (!response.ok) {
				if (response.status === 401 || response.status === 403) throw new SyncError('authentication', 'Mealie rejected the API token.', response.status);
				if (response.status === 404) throw new SyncError('not-found', 'The connected Mealie shopping list no longer exists.', response.status);
				if (response.status === 422) throw new SyncError('validation', 'Mealie rejected the shopping list update.', response.status);
				throw new SyncError('server', `Mealie returned HTTP ${response.status}.`, response.status);
			}
			if (response.status === 204) return null;
			try { return await response.json(); } catch { throw new SyncError('validation', 'Mealie returned malformed JSON.'); }
		} catch (error) {
			if (error instanceof SyncError) throw error;
			if (error instanceof Error && error.name === 'AbortError') throw new SyncError('timeout', 'The Mealie request timed out.');
			throw new SyncError('network', 'Could not reach Mealie.');
		} finally {
			clearTimeout(timer);
		}
	}

	public async getLists(): Promise<ShoppingListSummary[]> {
		const output: ShoppingListSummary[] = [];
		for (let page = 1; ; page += 1) {
			const data = await this.request(`/households/shopping/lists?page=${page}&perPage=100&orderBy=name&orderDirection=asc`);
			if (!isRecord(data) || !Array.isArray(data.items)) throw new SyncError('validation', 'Mealie returned an invalid shopping-list page.');
			output.push(...data.items.map(parseSummary));
			const totalPages = typeof data.totalPages === 'number' ? data.totalPages : page;
			if (page >= totalPages || data.items.length === 0) break;
		}
		return output;
	}

	public async getList(id: string): Promise<ShoppingList> {
		const data = await this.request(`/households/shopping/lists/${encodeURIComponent(id)}`);
		const summary = parseSummary(data);
		if (!isRecord(data)) throw new SyncError('validation', 'Mealie returned an invalid shopping list.');
		const rawItems = Array.isArray(data.listItems) ? data.listItems : (Array.isArray(data.items) ? data.items : null);
		if (!rawItems) throw new SyncError('validation', 'Mealie returned a shopping list without items.');
		return { ...summary, listItems: rawItems.map(parseItem) };
	}

	public async updateItems(items: ShoppingListItem[]): Promise<void> {
		if (!items.length) return;
		await this.request('/households/shopping/items', { method: 'PUT', body: JSON.stringify(items) });
	}
}

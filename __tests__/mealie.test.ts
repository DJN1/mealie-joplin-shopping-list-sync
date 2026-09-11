import { MealieClient, normalizeBaseUrl } from '../src/mealie';

describe('Mealie client', () => {
	afterEach(() => jest.restoreAllMocks());

	test('normalizes server URLs', () => {
		expect(normalizeBaseUrl(' https://example.test/mealie/api/ ')).toBe('https://example.test/mealie');
		expect(() => normalizeBaseUrl('ftp://example.test')).toThrow(/HTTP/);
		expect(() => normalizeBaseUrl('https://user@example.test')).toThrow(/credentials/);
	});

	test('paginates shopping lists', async () => {
		const fetchMock = jest.spyOn(global, 'fetch' as never).mockImplementation((async (url: string) => ({
			ok: true, status: 200,
			json: async () => url.includes('page=1')
				? { items: [{ id: '1', name: 'A' }], totalPages: 2 }
				: { items: [{ id: '2', name: 'B' }], totalPages: 2 },
		})) as never);
		await expect(new MealieClient('https://example.test', 'token').getLists()).resolves.toEqual([{ id: '1', name: 'A' }, { id: '2', name: 'B' }]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test('sends full fresh item objects in one bulk update', async () => {
		const fetchMock = jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: true, status: 200, json: async () => [] } as never);
		const item = { id: 'item', checked: true, quantity: 2, extras: { source: 'recipe' } };
		await new MealieClient('https://example.test', 'token').updateItems([item]);
		expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/households/shopping/items', expect.objectContaining({ method: 'PUT', body: JSON.stringify([item]) }));
	});

	test('maps authentication errors', async () => {
		jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: false, status: 401 } as never);
		await expect(new MealieClient('https://example.test', 'bad').getLists()).rejects.toMatchObject({ kind: 'authentication', status: 401 });
	});
});

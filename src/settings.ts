import joplin from 'api';
import { SettingItemType } from 'api/types';

export const SETTINGS_SECTION = 'mealieShoppingListSync';
export const SETTING = {
	baseUrl: 'mealieBaseUrl',
	apiToken: 'mealieApiToken',
	automatic: 'automaticSyncEnabled',
	interval: 'syncIntervalMinutes',
	listId: 'shoppingListId',
	noteId: 'targetNoteId',
} as const;

export interface PluginSettings {
	baseUrl: string;
	apiToken: string;
	automatic: boolean;
	interval: number;
	listId: string;
	noteId: string;
}

export async function registerSettings(): Promise<void> {
	await joplin.settings.registerSection(SETTINGS_SECTION, {
		label: 'Mealie Shopping List Sync',
		iconName: 'fas fa-cart-shopping',
	});
	await joplin.settings.registerSettings({
		[SETTING.baseUrl]: { value: '', type: SettingItemType.String, section: SETTINGS_SECTION, public: true, label: 'Mealie base URL', description: 'For example: https://mealie.example.com' },
		[SETTING.apiToken]: { value: '', type: SettingItemType.String, section: SETTINGS_SECTION, public: true, secure: true, label: 'Mealie API token' },
		[SETTING.automatic]: { value: true, type: SettingItemType.Bool, section: SETTINGS_SECTION, public: true, label: 'Enable automatic sync' },
		[SETTING.interval]: { value: 5, type: SettingItemType.Int, section: SETTINGS_SECTION, public: true, label: 'Automatic sync interval (minutes)', minimum: 1, maximum: 1440, step: 1 },
		[SETTING.listId]: { value: '', type: SettingItemType.String, section: SETTINGS_SECTION, public: false, label: 'Connected Mealie list ID' },
		[SETTING.noteId]: { value: '', type: SettingItemType.String, section: SETTINGS_SECTION, public: false, label: 'Connected Joplin note ID' },
	});
}

export async function readSettings(): Promise<PluginSettings> {
	const values = await joplin.settings.values(Object.values(SETTING));
	return {
		baseUrl: String(values[SETTING.baseUrl] || ''),
		apiToken: String(values[SETTING.apiToken] || ''),
		automatic: Boolean(values[SETTING.automatic]),
		interval: Math.min(1440, Math.max(1, Number(values[SETTING.interval]) || 5)),
		listId: String(values[SETTING.listId] || ''),
		noteId: String(values[SETTING.noteId] || ''),
	};
}

export async function saveConnection(listId: string, noteId: string): Promise<void> {
	await joplin.settings.setValue(SETTING.listId, listId);
	await joplin.settings.setValue(SETTING.noteId, noteId);
}

export async function clearConnection(): Promise<void> {
	await saveConnection('', '');
}

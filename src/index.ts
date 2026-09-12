import joplin from 'api';
import { ContentScriptType, MenuItemLocation, ToastType, ToolbarButtonLocation } from 'api/types';
import { SingleFlight } from './coordinator';
import { connect } from './connect';
import { errorMessage, SyncError } from './errors';
import { JoplinNoteStore, simpleHash } from './joplinStore';
import { MealieClient } from './mealie';
import { clearConnection, readSettings, registerSettings } from './settings';
import { SyncEngine } from './syncEngine';
import { SyncResult } from './types';

const CONTENT_SCRIPT_ID = 'mealieSyncButton';
const SYNC_COMMAND = 'mealieSyncShoppingListNow';
const CONNECT_COMMAND = 'mealieConnectShoppingList';
const REPAIR_COMMAND = 'mealieRepairShoppingList';

class PluginController {
	private timer: ReturnType<typeof setInterval> | null = null;
	private debounce: ReturnType<typeof setTimeout> | null = null;
	private readonly store = new JoplinNoteStore();
	private readonly flight = new SingleFlight(() => this.syncOnce());
	private lastBackgroundError = '';

	public async start(): Promise<void> {
		await registerSettings();
		await this.registerCommands();
		await joplin.contentScripts.register(ContentScriptType.MarkdownItPlugin, CONTENT_SCRIPT_ID, './contentScript.js');
		await joplin.contentScripts.onMessage(CONTENT_SCRIPT_ID, async (message: { type?: string; itemId?: string; checked?: boolean }) => {
			try {
				if (message?.type === 'syncNow') return { ok: true, ...(await this.manualSync()) };
				if (message?.type === 'toggleItem' && typeof message.itemId === 'string' && typeof message.checked === 'boolean') {
					return { ok: true, ...(await this.toggleItem(message.itemId, message.checked)) };
				}
				return { ok: false, message: 'Unknown action.' };
			}
			catch (error) { return { ok: false, message: errorMessage(error) }; }
		});
		await joplin.workspace.onNoteChange(event => { void this.onNoteChange(event.id); });
		await joplin.workspace.onSyncComplete(() => { void this.backgroundSync(); });
		await joplin.settings.onChange(() => { void this.configureTimer(); });
		await this.configureTimer();
		void this.backgroundSync();
	}

	private async registerCommands(): Promise<void> {
		await joplin.commands.register({
			name: CONNECT_COMMAND, label: 'Connect Mealie Shopping List', iconName: 'fas fa-link',
			execute: async () => {
				try {
					const settings = await readSettings();
					const note = await connect(new MealieClient(settings.baseUrl, settings.apiToken));
					if (note) {
						await this.configureTimer();
						const result = await this.flight.run();
						await this.toast(`Mealie shopping list connected. ${result.message}`, ToastType.Success);
					}
				} catch (error) { await this.toast(errorMessage(error), ToastType.Error); }
			},
		});
		await joplin.commands.register({
			name: SYNC_COMMAND, label: 'Sync Mealie Shopping List Now', iconName: 'fas fa-sync', enabledCondition: 'oneNoteSelected',
			execute: async () => {
				try { const result = await this.manualSync(); await this.toast(result.message, ToastType.Success); }
				catch (error) { await this.toast(errorMessage(error), ToastType.Error); }
			},
		});
		await joplin.commands.register({
			name: REPAIR_COMMAND, label: 'Repair Mealie Shopping List', iconName: 'fas fa-wrench', enabledCondition: 'oneNoteSelected',
			execute: async () => {
				try {
					const result = await this.repairSelectedNote();
					if (result) await this.toast(result.message, ToastType.Success);
				} catch (error) { await this.toast(errorMessage(error), ToastType.Error); }
			},
		});
		await joplin.views.menuItems.create('mealieConnectMenu', CONNECT_COMMAND, MenuItemLocation.Tools);
		await joplin.views.menuItems.create('mealieSyncMenu', SYNC_COMMAND, MenuItemLocation.Tools);
		await joplin.views.menuItems.create('mealieRepairMenu', REPAIR_COMMAND, MenuItemLocation.Tools);
		await joplin.views.toolbarButtons.create('mealieConnectEditorToolbar', CONNECT_COMMAND, ToolbarButtonLocation.EditorToolbar);
		await joplin.views.toolbarButtons.create('mealieSyncEditorToolbar', SYNC_COMMAND, ToolbarButtonLocation.EditorToolbar);
		await joplin.views.toolbarButtons.create('mealieRepairEditorToolbar', REPAIR_COMMAND, ToolbarButtonLocation.EditorToolbar);
		await joplin.views.toolbarButtons.create('mealieSyncToolbar', SYNC_COMMAND, ToolbarButtonLocation.NoteToolbar);
	}

	private async manualSync(): Promise<SyncResult> {
		const settings = await readSettings();
		if (!settings.noteId || !settings.listId) throw new SyncError('configuration', 'Connect a Mealie shopping list first.');
		const selected = await joplin.workspace.selectedNote();
		if (!selected || selected.id !== settings.noteId) throw new SyncError('configuration', 'Open the connected Mealie shopping-list note before syncing.');
		return this.flight.run();
	}

	private async toggleItem(itemId: string, checked: boolean): Promise<SyncResult> {
		const settings = await readSettings();
		if (!settings.noteId || !settings.listId) throw new SyncError('configuration', 'Connect a Mealie shopping list first.');
		const selected = await joplin.workspace.selectedNote();
		if (!selected || selected.id !== settings.noteId) throw new SyncError('configuration', 'Open the connected Mealie shopping-list note before updating it.');
		const client = new MealieClient(settings.baseUrl, settings.apiToken);
		const list = await client.getList(settings.listId);
		const item = list.listItems.find(candidate => candidate.id === itemId);
		if (!item) throw new SyncError('not-found', 'The Mealie shopping-list item no longer exists.');
		if (item.checked !== checked) await client.updateItems([{ ...item, checked }]);
		try { await this.flight.run(); }
		catch (error) {
			const prefix = item.checked !== checked ? 'Item updated in Mealie' : 'Item is already up to date in Mealie';
			return { changed: item.checked !== checked, message: `${prefix}, but the note could not refresh: ${errorMessage(error)}` };
		}
		return { changed: item.checked !== checked, message: item.checked === checked ? 'Already up to date.' : 'Item updated.' };
	}

	private async repairSelectedNote(): Promise<SyncResult | null> {
		const settings = await readSettings();
		if (!settings.noteId || !settings.listId) throw new SyncError('configuration', 'Connect a Mealie shopping list first.');
		const selected = await joplin.workspace.selectedNote();
		if (!selected || selected.id !== settings.noteId) throw new SyncError('configuration', 'Open the connected Mealie shopping-list note before repairing it.');
		const choice = await joplin.views.dialogs.showMessageBox('Repair this shopping-list note from Mealie? Joplin will create a backup copy of the current note first.');
		if (choice !== 0) return null;
		const engine = new SyncEngine(this.store, new MealieClient(settings.baseUrl, settings.apiToken));
		return engine.repair(settings.noteId, settings.listId);
	}

	private async syncOnce(): Promise<SyncResult> {
		const settings = await readSettings();
		if (!settings.noteId || !settings.listId) throw new SyncError('configuration', 'Connect a Mealie shopping list first.');
		const engine = new SyncEngine(this.store, new MealieClient(settings.baseUrl, settings.apiToken));
		try { return await engine.sync(settings.noteId, settings.listId); }
		catch (error) {
			if (error instanceof SyncError && error.kind === 'not-found') await clearConnection();
			throw error;
		}
	}

	private async backgroundSync(): Promise<void> {
		const settings = await readSettings();
		if (!settings.automatic || !settings.noteId || !settings.listId) return;
		try {
			await this.flight.run();
			if (this.lastBackgroundError) await this.toast('Mealie shopping-list sync recovered.', ToastType.Success);
			this.lastBackgroundError = '';
		} catch (error) {
			const message = errorMessage(error);
			console.error(`Mealie Shopping List Sync: ${message}`);
			if (message !== this.lastBackgroundError) await this.toast(message, ToastType.Error);
			this.lastBackgroundError = message;
		}
	}

	private async configureTimer(): Promise<void> {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		const settings = await readSettings();
		if (settings.automatic && settings.noteId && settings.listId) this.timer = setInterval(() => { void this.backgroundSync(); }, settings.interval * 60_000);
	}

	private async onNoteChange(noteId: string): Promise<void> {
		const settings = await readSettings();
		if (!settings.automatic || noteId !== settings.noteId) return;
		const note = await this.store.getNote(noteId);
		if (note && simpleHash(`${note.title}\u0000${note.body}`) === this.store.lastWrittenHash) return;
		if (this.debounce) clearTimeout(this.debounce);
		this.debounce = setTimeout(() => { void this.backgroundSync(); }, 1_500);
	}

	private async toast(message: string, type: ToastType): Promise<void> {
		await joplin.views.dialogs.showToast({ message, type, duration: 5000 });
	}
}

joplin.plugins.register({ onStart: async () => { await new PluginController().start(); } });

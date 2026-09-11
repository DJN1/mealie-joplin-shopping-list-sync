export interface MealieLabel {
	id?: string;
	name?: string;
	position?: number;
}

export interface NamedEntity {
	id?: string;
	name?: string;
}

export interface ShoppingListItem {
	id: string;
	checked: boolean;
	position?: number;
	display?: string | null;
	note?: string | null;
	quantity?: number | string | null;
	unit?: NamedEntity | null;
	food?: NamedEntity | null;
	label?: MealieLabel | null;
	labelId?: string | null;
	[key: string]: unknown;
}

export interface ShoppingListSummary {
	id: string;
	name: string;
}

export interface ShoppingList extends ShoppingListSummary {
	listItems: ShoppingListItem[];
}

export interface JoplinNote {
	id: string;
	title: string;
	body: string;
	parent_id?: string;
}

export interface SyncResult {
	changed: boolean;
	message: string;
}

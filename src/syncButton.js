function managedComments() {
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
	let start = null;
	let end = null;
	while (walker.nextNode()) {
		const value = walker.currentNode.nodeValue.trim();
		if (!start && /^mealie-sync:start:v1 list-id=/i.test(value)) start = walker.currentNode;
		else if (start && /^mealie-sync:end:v1$/i.test(value)) { end = walker.currentNode; break; }
	}
	return { start, end };
}

function isBetween(node, start, end) {
	return Boolean(start.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
		&& Boolean(end.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING);
}

function initializeCheckedItems() {
	const control = document.querySelector('.mealie-sync-control');
	if (!control) return;
	if (control.dataset.checkedItemsInitialized === 'true') return;
	const comments = managedComments();
	const start = control || comments.start;
	const end = document.querySelector('.mealie-sync-end-boundary') || comments.end;
	if (!start || !end) return;
	control.dataset.checkedItemsInitialized = 'true';
	const items = [...document.querySelectorAll('input[type="checkbox"]:checked')]
		.map(input => input.closest('li'))
		.filter(item => item && isBetween(item, start, end));
	for (const item of items) item.classList.add('mealie-sync-checked-item');
	const toggle = control.querySelector('.mealie-checked-toggle');
	if (items.length) {
		toggle.hidden = false;
		toggle.textContent = `Show checked (${items.length})`;
	}
}

initializeCheckedItems();
document.addEventListener('DOMContentLoaded', initializeCheckedItems, { once: true });
document.addEventListener('joplin-noteDidUpdate', () => {
	for (const item of document.querySelectorAll('.mealie-sync-checked-item')) item.classList.remove('mealie-sync-checked-item');
	for (const control of document.querySelectorAll('.mealie-sync-control')) delete control.dataset.checkedItemsInitialized;
	document.documentElement.classList.remove('mealie-sync-show-checked');
	initializeCheckedItems();
});
if (document.body) {
	new MutationObserver(() => initializeCheckedItems()).observe(document.body, { childList: true, subtree: true });
}

document.addEventListener('click', async event => {
	const target = event.target.closest && event.target.closest('button');
	if (!target) return;
	if (target.classList.contains('mealie-checked-toggle')) {
		const expanded = target.getAttribute('aria-expanded') === 'true';
		document.documentElement.classList.toggle('mealie-sync-show-checked', !expanded);
		target.setAttribute('aria-expanded', String(!expanded));
		const count = document.querySelectorAll('.mealie-sync-checked-item').length;
		target.textContent = `${expanded ? 'Show' : 'Hide'} checked (${count})`;
		return;
	}
	const button = target.closest('.mealie-sync-button');
	if (!button) return;
	const status = button.parentElement.querySelector('.mealie-sync-status');
	button.disabled = true;
	status.textContent = ' Syncing…';
	try {
		const result = await webviewApi.postMessage(button.dataset.contentScriptId, { type: 'syncNow' });
		status.textContent = ` ${result.message || (result.ok ? 'Synced.' : 'Sync failed.')}`;
	} catch (error) { status.textContent = ' Sync failed.'; }
	finally { button.disabled = false; }
});

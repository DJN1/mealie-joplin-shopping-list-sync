function statusFor(root) {
	return root.querySelector('.mealie-sync-status');
}

document.addEventListener('click', async event => {
	const button = event.target.closest && event.target.closest('button');
	if (!button) return;
	const root = button.closest('.mealie-shopping-list');
	if (!root) return;
	if (button.classList.contains('mealie-checked-toggle')) {
		const expanded = button.getAttribute('aria-expanded') === 'true';
		root.classList.toggle('mealie-sync-show-checked', !expanded);
		button.setAttribute('aria-expanded', String(!expanded));
		const count = root.querySelectorAll('.mealie-sync-checked-item').length;
		button.textContent = `${expanded ? 'Show' : 'Hide'} checked (${count})`;
		return;
	}
	if (!button.classList.contains('mealie-sync-button')) return;
	button.disabled = true;
	statusFor(root).textContent = ' Syncing…';
	try {
		const result = await webviewApi.postMessage(root.dataset.contentScriptId, { type: 'syncNow' });
		statusFor(root).textContent = ` ${result.message || (result.ok ? 'Synced.' : 'Sync failed.')}`;
	} catch { statusFor(root).textContent = ' Sync failed.'; }
	finally { button.disabled = false; }
});

document.addEventListener('change', async event => {
	const checkbox = event.target.closest && event.target.closest('input[data-mealie-item-id]');
	if (!checkbox) return;
	const root = checkbox.closest('.mealie-shopping-list');
	if (!root) return;
	checkbox.disabled = true;
	statusFor(root).textContent = ' Updating…';
	try {
		const result = await webviewApi.postMessage(root.dataset.contentScriptId, { type: 'toggleItem', itemId: checkbox.dataset.mealieItemId, checked: checkbox.checked });
		if (!result.ok) throw new Error(result.message || 'Update failed.');
		statusFor(root).textContent = ` ${result.message || 'Updated.'}`;
	} catch (error) {
		checkbox.checked = !checkbox.checked;
		statusFor(root).textContent = ` ${error.message || 'Update failed.'}`;
	} finally { checkbox.disabled = false; }
});

import { SingleFlight } from '../src/coordinator';

test('coalesces overlapping triggers into one pending run', async () => {
	let release: (() => void) | undefined;
	let calls = 0;
	const operation = jest.fn(async () => {
		calls += 1;
		if (calls === 1) await new Promise<void>(resolve => { release = resolve; });
		return calls;
	});
	const flight = new SingleFlight(operation);
	const first = flight.run();
	const second = flight.run();
	const third = flight.run();
	release!();
	await expect(first).resolves.toBe(2);
	await expect(second).resolves.toBe(2);
	await expect(third).resolves.toBe(2);
	expect(operation).toHaveBeenCalledTimes(2);
});

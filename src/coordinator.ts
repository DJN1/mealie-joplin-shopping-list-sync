export class SingleFlight<T> {
	private running: Promise<T> | null = null;
	private pending = false;

	public constructor(private readonly operation: () => Promise<T>) {}

	public run(): Promise<T> {
		if (this.running) {
			this.pending = true;
			return this.running;
		}
		this.running = this.drain();
		return this.running;
	}

	private async drain(): Promise<T> {
		try {
			let result = await this.operation();
			while (this.pending) {
				this.pending = false;
				result = await this.operation();
			}
			return result;
		} finally {
			this.running = null;
		}
	}
}

export type SyncErrorKind = 'configuration' | 'authentication' | 'not-found' | 'network' | 'timeout' | 'validation' | 'server';

export class SyncError extends Error {
	public constructor(public readonly kind: SyncErrorKind, message: string, public readonly status?: number) {
		super(message);
		this.name = 'SyncError';
	}
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class InsufficientAvailabilityError extends Error {
  readonly code = 'INSUFFICIENT_AVAILABILITY' as const;
  constructor(
    readonly menuItemId: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(
      `Only ${available} portion(s) available, ${requested} requested.`,
    );
    this.name = 'InsufficientAvailabilityError';
  }
}

export class AvailabilityConflictError extends Error {
  readonly code = 'AVAILABILITY_CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AvailabilityConflictError';
  }
}

/** The owner tried to drop `configured` below what has already been reserved. */
export class ConfiguredBelowReservedError extends Error {
  readonly code = 'CONFIGURED_BELOW_RESERVED' as const;
  constructor(
    readonly configured: number,
    readonly reserved: number,
  ) {
    super(
      `Cannot reduce configured quantity below ${reserved} (already reserved).`,
    );
    this.name = 'ConfiguredBelowReservedError';
  }
}

export class OrderError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'OrderError';
    this.code = code;
  }
}
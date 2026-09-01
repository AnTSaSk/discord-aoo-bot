import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

vi.mock('@/config/logger.js', () => ({
  getLogger: (): typeof mockLogger => mockLogger,
}));

import { ErrorListener } from '@/listeners/error.js';
import { WarnListener } from '@/listeners/warn.js';

describe('ErrorListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs the client error at error level with structured context (AC-1)', () => {
    const listener = new ErrorListener(
      {} as ConstructorParameters<typeof ErrorListener>[0],
      {
        event: 'error',
      },
    );
    const clientError = new Error('client connection failed');

    listener.run(clientError);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: clientError }),
      expect.any(String),
    );
  });
});

describe('WarnListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs the warning message at warn level with structured context (AC-1)', () => {
    const listener = new WarnListener(
      {} as ConstructorParameters<typeof WarnListener>[0],
      {
        event: 'warn',
      },
    );
    const message = 'deprecated intent used';

    listener.run(message);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ message }),
      expect.any(String),
    );
  });
});

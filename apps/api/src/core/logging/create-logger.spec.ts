import { ConsoleLogger } from '@nestjs/common';
import { createLogger } from './create-logger.js';

describe('createLogger', () => {
  it.each(['json', 'pretty'] as const)('создаёт ConsoleLogger для формата %s', (format) => {
    expect(createLogger(format)).toBeInstanceOf(ConsoleLogger);
  });

  it('json: пишет одну JSON-строку и маскирует секреты', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    createLogger('json').log({ message: 'hi', password: 'hunter2' });
    const output = write.mock.calls.map((call) => String(call[0])).join('');
    write.mockRestore();
    expect(output).not.toContain('hunter2');
  });
});

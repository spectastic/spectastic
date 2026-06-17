import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  StubAIProvider,
  StubAIProviderError,
} from '@spectastic/core/providers/stub';

describe('StubAIProvider', () => {
  it('consumes chat responses sequentially', async () => {
    const provider = new StubAIProvider({
      chat: ['first', 'second', 'third'],
    });
    expect(await provider.chat('p1')).toBe('first');
    expect(await provider.chat('p2')).toBe('second');
    expect(await provider.chat('p3')).toBe('third');
  });

  it('throws a descriptive error when chat() overflows the script', async () => {
    const provider = new StubAIProvider({ chat: ['only one'] });
    await provider.chat('p1');
    await expect(provider.chat('p2')).rejects.toThrow(StubAIProviderError);
    await expect(provider.chat('p3')).rejects.toThrow(
      /chat\(\) invoked .* times; script only defines 1 response/,
    );
  });

  it('consumes ask() responses sequentially', async () => {
    const provider = new StubAIProvider({
      ask: [{ Choice: 'A' }, { Choice: 'B' }],
    });
    const r1 = await provider.ask<{ Choice: string }>([]);
    const r2 = await provider.ask<{ Choice: string }>([]);
    expect(r1.Choice).toBe('A');
    expect(r2.Choice).toBe('B');
  });

  it('throws when ask() overflows the script', async () => {
    const provider = new StubAIProvider({ ask: [] });
    await expect(provider.ask([])).rejects.toThrow(
      /ask\(\) invoked 1 times; script only defines 0/,
    );
  });

  it('consumes subagent() responses sequentially', async () => {
    const provider = new StubAIProvider({
      subagent: [{ output: 'critic-1' }, { output: 'critic-2' }],
    });
    expect((await provider.subagent('p')).output).toBe('critic-1');
    expect((await provider.subagent('p')).output).toBe('critic-2');
  });

  it('loads a script from a JSON file on disk', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'stub-script-'));
    const scriptPath = join(cwd, 'script.json');
    writeFileSync(scriptPath, JSON.stringify({ chat: ['from-disk'] }));

    const provider = new StubAIProvider(scriptPath);
    expect(await provider.chat('p')).toBe('from-disk');
  });

  it('throws a descriptive error when the script file is missing', () => {
    expect(() => new StubAIProvider('/no/such/file.json')).toThrow(
      /failed to read script.*\/no\/such\/file\.json/,
    );
  });

  it('throws a descriptive error when the script file is not valid JSON', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'stub-script-'));
    const scriptPath = join(cwd, 'bad.json');
    writeFileSync(scriptPath, '{ not valid json');

    expect(() => new StubAIProvider(scriptPath)).toThrow(/is not valid JSON/);
  });

  it('defaults missing script sections to empty arrays', async () => {
    // Caller only provides "chat"; ask + subagent overflow immediately on use.
    const provider = new StubAIProvider({ chat: ['x'] });
    expect(await provider.chat('p')).toBe('x');
    await expect(provider.ask([])).rejects.toThrow(/script only defines 0/);
    await expect(provider.subagent('p')).rejects.toThrow(/script only defines 0/);
  });

  // Schema-validation tests per FR-005 of specs/015-ai-stub-injection/spec.html
  // (validateStubScript walker runs at load time, throws with the offending JSON path).
  describe('schema validation', () => {
    it('throws when the root is not an object', () => {
      expect(() => new StubAIProvider(['not', 'an', 'object'] as unknown as { chat: string[] })).toThrow(
        /script root must be an object \(got array\)/,
      );
    });

    it('throws when chat is not an array', () => {
      expect(() => new StubAIProvider({ chat: 'a single string' as unknown as string[] })).toThrow(
        /script chat must be an array \(got string\)/,
      );
    });

    it('throws when chat[i] is not a string, naming the index', () => {
      expect(
        () => new StubAIProvider({ chat: ['ok', 42 as unknown as string, 'also ok'] }),
      ).toThrow(/script chat\[1\] must be a string \(got number\)/);
    });

    it('throws when ask[i] is not an object, naming the index', () => {
      expect(
        () => new StubAIProvider({ ask: [null as unknown as Record<string, string>] }),
      ).toThrow(/script ask\[0\] must be an object \(got null\)/);
    });

    it('throws when ask[i].field is not a string, naming the path', () => {
      expect(
        () =>
          new StubAIProvider({
            ask: [{ Header: 'fine' }, { Header: 99 as unknown as string }],
          }),
      ).toThrow(/script ask\[1\]\.Header must be a string \(got number\)/);
    });

    it('throws when subagent[i].output is missing or not a string', () => {
      expect(
        () =>
          new StubAIProvider({
            subagent: [{ output: 'ok' }, {} as unknown as { output: string }],
          }),
      ).toThrow(/script subagent\[1\]\.output must be a string \(got undefined\)/);
    });
  });
});

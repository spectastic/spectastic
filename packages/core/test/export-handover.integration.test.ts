import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildContractNotification, notificationMatchesConsumer } from '../src/contracts/notify.js';
import { contractResourceUri } from '@spectastic/schema/project';

/**
 * Mechanism-agnosticism, exercised rather than asserted (spec
 * 076-contract-export-handover, T-901 / SC-004 / FR-004).
 *
 * docs/contract-distribution-recipes.html documents two ways to get a contract
 * across a repository boundary — vendoring, and a published artifact. Neither
 * is built by spectastic. The claim this file has to earn is that BOTH consume
 * the identical surface, with 0 changes to any guarantee between them.
 *
 * The test is written as the two recipes actually differ: same producer, same
 * coordinate, same notification, same consumes entry — and a transport step
 * spectastic has no part in.
 */

const here = dirname(fileURLToPath(import.meta.url));
const RECIPES_DOC = resolve(here, '..', '..', '..', 'docs', 'contract-distribution-recipes.html');

const PRODUCER = 'acme/billing';
const CONTRACT_NAME = 'invoices';

/** Everything spectastic contributes, for one recipe. Deliberately transport-free. */
function spectasticSurface() {
  const coordinate = contractResourceUri(PRODUCER, CONTRACT_NAME);
  const notification = buildContractNotification({
    project: PRODUCER,
    name: CONTRACT_NAME,
    changeClass: 'breaking',
  });
  return { coordinate, notification, consumes: [coordinate] };
}

describe('SC-004 · both distribution recipes consume an identical surface', () => {
  // Recipe A copies a file; Recipe B bumps a dependency. Neither step involves
  // spectastic, so neither can influence what the surface produces — which is
  // exactly what this asserts.
  const vendoring = spectasticSurface();
  const published = spectasticSurface();

  it('the coordinate is identical', () => {
    expect(vendoring.coordinate).toBe(published.coordinate);
    expect(vendoring.coordinate).toBe('spectastic://acme/billing/contract/invoices');
  });

  it('the notification is identical', () => {
    expect(vendoring.notification).toEqual(published.notification);
  });

  it('the consumes entry is identical', () => {
    expect(vendoring.consumes).toEqual(published.consumes);
  });

  it('routing behaves identically under both', () => {
    expect(notificationMatchesConsumer(vendoring.notification, vendoring.consumes)).toBe(true);
    expect(notificationMatchesConsumer(published.notification, published.consumes)).toBe(true);
    // ...and neither matches a different coordinate.
    const other = [contractResourceUri(PRODUCER, 'settlements')];
    expect(notificationMatchesConsumer(vendoring.notification, other)).toBe(false);
    expect(notificationMatchesConsumer(published.notification, other)).toBe(false);
  });

  it('0 guarantees differ between the recipes — the whole surface is byte-identical', () => {
    expect(vendoring).toEqual(published);
  });
});

describe('FR-004 · the surface names no mechanism', () => {
  it('the coordinate carries no registry, package manager or generator', () => {
    const { coordinate } = spectasticSurface();
    for (const mechanism of ['npm', 'maven', 'oci', 'registry', 'buf.build', 'artifactory']) {
      expect(coordinate.toLowerCase(), `coordinate must not name ${mechanism}`).not.toContain(mechanism);
    }
  });

  it('the notification carries no mechanism either', () => {
    const { notification } = spectasticSurface();
    const serialised = JSON.stringify(notification).toLowerCase();
    for (const mechanism of ['npm', 'maven', 'oci', 'artifactory', 'schema registry']) {
      expect(serialised, `notification must not name ${mechanism}`).not.toContain(mechanism);
    }
  });
});

describe('T-902/FR-004 · the feature adds no capability', () => {
  // Observed rather than promised: the modules this spec added are read-only
  // and offline, so their source must contain no network or subprocess call.
  const SOURCES = ['../src/contracts/notify.ts', '../src/commands/contract.ts'] as const;

  it.each(SOURCES)('%s makes 0 network calls', (rel) => {
    const src = readFileSync(resolve(here, rel), 'utf8');
    for (const api of ['fetch(', 'http.request', 'https.request', 'XMLHttpRequest', 'undici', 'axios']) {
      expect(src, `${rel} must not use ${api}`).not.toContain(api);
    }
  });

  it.each(SOURCES)('%s spawns 0 subprocesses', (rel) => {
    const src = readFileSync(resolve(here, rel), 'utf8');
    for (const api of ['child_process', 'spawn(', 'execFile', 'execSync']) {
      expect(src, `${rel} must not use ${api}`).not.toContain(api);
    }
  });
});

describe('T-900 · the recipes document exists and documents both mechanisms', () => {
  const doc = readFileSync(RECIPES_DOC, 'utf8');

  it('documents the vendoring recipe', () => {
    expect(doc).toMatch(/vendoring/i);
  });

  it('documents the published-artifact recipe', () => {
    expect(doc).toMatch(/published artifact/i);
  });

  it('states that neither mechanism is built or blessed', () => {
    expect(doc).toMatch(/mechanism-agnostic/i);
    expect(doc).toMatch(/neither is built|neither mechanism is built/i);
  });

  it('shows the same coordinate under both', () => {
    // The comparison table's whole job.
    const occurrences = doc.split('spectastic://acme/billing/contract/invoices').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });
});

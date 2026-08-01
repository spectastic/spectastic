import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectTooling, exposesInterface, interfaceEvidence } from '../src/enforce/detect.js';

/**
 * Broker/managed-bus interface detection (spec 073-interface-detection-widening,
 * US1 / FR-001). Written before the signals exist (T-100) — failing until T-110
 * lands.
 *
 * The gap this closes: INTERFACE_SIGNALS held ~40 entries across six ecosystems
 * and not one message broker, so a service whose entire public surface is
 * published topics was marked *covered* at every tier, enterprise included.
 */

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-detect-brokers-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

/** One broker client per ecosystem — the deliberately-declared dependency. */
const BROKER_FIXTURES: ReadonlyArray<readonly [string, Record<string, string>]> = [
  ['js kafkajs', { 'package.json': '{"dependencies":{"kafkajs":"^2.2.0"}}' }],
  ['js amqplib', { 'package.json': '{"dependencies":{"amqplib":"^0.10.0"}}' }],
  ['js nats', { 'package.json': '{"dependencies":{"nats":"^2.19.0"}}' }],
  ['js aws-sdk sqs', { 'package.json': '{"dependencies":{"@aws-sdk/client-sqs":"^3.500.0"}}' }],
  ['python kafka-python', { 'requirements.txt': 'kafka-python==2.0.2\n' }],
  ['python pika (amqp)', { 'pyproject.toml': '[project]\ndependencies = ["pika"]\n' }],
  ['java spring-kafka', { 'pom.xml': '<dependency>spring-kafka</dependency>' }],
  ['java gradle kafka-clients', { 'build.gradle': "implementation 'org.apache.kafka:kafka-clients:3.7.0'" }],
  ['go sarama', { 'go.mod': 'require github.com/IBM/sarama v1.43.0\n' }],
  ['go nats.go', { 'go.mod': 'require github.com/nats-io/nats.go v1.33.0\n' }],
  ['rust rdkafka', { 'Cargo.toml': '[dependencies]\nrdkafka = "0.36"\n' }],
  ['rust lapin (amqp)', { 'Cargo.toml': '[dependencies]\nlapin = "2.3"\n' }],
];

describe('broker signals expose an interface (073, FR-001)', () => {
  it.each(BROKER_FIXTURES.map(([name, files]) => [name, files] as const))(
    '%s is recognised as exposing a public interface',
    (_name, files) => {
      const dir = fixture(files);
      expect(exposesInterface(dir)).toBe(true);
    },
  );

  it.each(BROKER_FIXTURES.map(([name, files]) => [name, files] as const))(
    '%s with no contract is a contract-first gap (SC-001)',
    (_name, files) => {
      const dir = fixture(files);
      expect(detectTooling(dir).has('contract-first')).toBe(false);
    },
  );

  it.each(BROKER_FIXTURES.map(([name, files]) => [name, files] as const))(
    '%s with an asyncapi.yaml is covered (SC-001)',
    (_name, files) => {
      const dir = fixture({ ...files, 'asyncapi.yaml': 'asyncapi: 3.0.0\n' });
      expect(detectTooling(dir).has('contract-first')).toBe(true);
    },
  );
});

describe('interfaceEvidence distinguishes how an interface was recognised (073, D-003)', () => {
  it('a broker-only project reports event evidence and no http evidence', () => {
    const dir = fixture({ 'package.json': '{"dependencies":{"kafkajs":"^2.2.0"}}' });
    expect(interfaceEvidence(dir)).toEqual({ http: false, event: true });
  });

  it('an express-only project reports http evidence and no event evidence', () => {
    const dir = fixture({ 'package.json': '{"dependencies":{"express":"^4.19.0"}}' });
    expect(interfaceEvidence(dir)).toEqual({ http: true, event: false });
  });

  it('a project with both surfaces reports both', () => {
    const dir = fixture({ 'package.json': '{"dependencies":{"express":"^4.19.0","kafkajs":"^2.2.0"}}' });
    expect(interfaceEvidence(dir)).toEqual({ http: true, event: true });
  });

  it('a project with neither reports neither', () => {
    const dir = fixture({ 'package.json': '{"dependencies":{"lodash":"^4"}}' });
    expect(interfaceEvidence(dir)).toEqual({ http: false, event: false });
  });
});

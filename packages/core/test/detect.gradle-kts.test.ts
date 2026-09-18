import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectEcosystems, detectTooling, interfaceEvidence } from '../src/enforce/detect.js';

/**
 * Gradle's Kotlin DSL (inbox I-081). Every Java signal named `build.gradle`,
 * so a project on `build.gradle.kts` — the default `gradle init` has produced
 * since Gradle 8.2 — reported formatter, linter, coverage, observability and
 * test-runner missing forever, wasn't even detected as the `java` ecosystem,
 * and exposed no HTTP or event interface however well wired. And the Groovy
 * file's test-runner signal was the bare substring `test`, which a
 * `testImplementation` line or a comment satisfies.
 */

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-detect-kts-'));
  for (const [name, body] of Object.entries(files)) {
    const target = join(dir, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body, 'utf8');
  }
  return dir;
}

const KTS = `plugins {
  id("com.diffplug.spotless") version "6.25.0"
  id("net.ltgt.errorprone") version "3.1.0"
}
buildscript { dependencies { classpath("org.owasp:dependency-check-gradle:9.0.9") } }
dependencies {
  implementation("org.springframework.boot:spring-boot-starter-web")
  implementation("org.springframework.kafka:spring-kafka")
  implementation("io.micrometer:micrometer-registry-prometheus")
  testImplementation("org.junit.jupiter:junit-jupiter")
}
tasks.test { useJUnitPlatform() }
tasks.jacocoTestCoverageVerification { violationRules { rule { limit { minimum = "0.9".toBigDecimal() } } } }
`;

describe('Gradle Kotlin DSL (build.gradle.kts)', () => {
  it('is detected as the java ecosystem', () => {
    expect(detectEcosystems(fixture({ 'build.gradle.kts': KTS })).has('java')).toBe(true);
  });

  it('classifies every enforce category the Groovy file would', () => {
    const c = detectTooling(fixture({ 'build.gradle.kts': KTS }));
    for (const cat of ['formatter', 'linter', 'security', 'supply-chain', 'test-runner', 'coverage', 'observability']) {
      expect(c.has(cat as never), cat).toBe(true);
    }
  });

  it('exposes the same HTTP and event interface evidence the Groovy file would', () => {
    expect(interfaceEvidence(fixture({ 'build.gradle.kts': KTS }))).toEqual({ http: true, event: true });
  });
});

describe('Java test-runner signal is a platform/task token, not the substring `test`', () => {
  it('a testImplementation line alone is not a test runner', () => {
    const c = detectTooling(fixture({ 'build.gradle': "dependencies { testImplementation 'org.assertj:assertj-core' }\n" }));
    expect(c.has('test-runner')).toBe(false);
  });

  it('the word in a comment is not a test runner', () => {
    expect(detectTooling(fixture({ 'build.gradle': '// TODO: add a test task\n' })).has('test-runner')).toBe(false);
  });

  it.each(['useJUnitPlatform()', "testImplementation 'junit:junit:4.13'", 'testng', 'spock'])(
    'recognises %s in either DSL',
    (token) => {
      expect(detectTooling(fixture({ 'build.gradle': `${token}\n` })).has('test-runner')).toBe(true);
      expect(detectTooling(fixture({ 'build.gradle.kts': `${token}\n` })).has('test-runner')).toBe(true);
    },
  );
});

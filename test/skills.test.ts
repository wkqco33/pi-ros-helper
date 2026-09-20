import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const skillsDir = fileURLToPath(new URL('../skills/', import.meta.url));

type Frontmatter = Record<string, string>;

/** Minimal YAML frontmatter reader for the flat key/value block pi requires. */
function parseFrontmatter(markdown: string): Frontmatter | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(markdown);
  if (!match) return undefined;
  const fields: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (field) fields[field[1]] = field[2].trim();
  }
  return fields;
}

async function skillFiles(): Promise<string[]> {
  const entries = await readdir(skillsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsDir, entry.name, 'SKILL.md'));
}

test('every skill declares valid frontmatter so pi can load it', async () => {
  const files = await skillFiles();
  assert.ok(files.length > 0, 'expected at least one skill directory');

  for (const file of files) {
    const frontmatter = parseFrontmatter(await readFile(file, 'utf8'));
    assert.ok(frontmatter, `${file} must start with a YAML frontmatter block`);

    const name = frontmatter.name;
    assert.ok(name, `${file} must declare a name`);
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${file} has an invalid skill name`);
    assert.ok(name.length <= 64, `${file} name must be at most 64 characters`);

    const description = frontmatter.description;
    assert.ok(description, `${file} must declare a description`);
    assert.ok(
      description.length > 0 && description.length <= 1024,
      `${file} description must be 1-1024 characters`,
    );
  }
});

test('frontmatter parser rejects a document without a block', () => {
  assert.equal(parseFrontmatter('# Title\n\nBody\n'), undefined);
});

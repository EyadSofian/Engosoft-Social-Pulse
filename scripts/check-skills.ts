/** Structural checks for project skills: frontmatter, naming, size and local links. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = '.claude/skills';
const problems: string[] = [];
for (const dir of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
  const file = join(root, dir.name, 'SKILL.md');
  if (!existsSync(file)) { problems.push(`${dir.name}: missing SKILL.md`); continue; }
  const text = readFileSync(file, 'utf8');
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!front) { problems.push(`${dir.name}: missing frontmatter`); continue; }
  const name = /^name:\s*(.+)$/m.exec(front[1])?.[1].trim();
  const description = /^description:\s*(.+)$/m.exec(front[1])?.[1].trim() ?? '';
  if (name !== dir.name) problems.push(`${dir.name}: name "${name}" does not match directory`);
  if (!/^[a-z0-9-]{1,64}$/.test(name ?? '')) problems.push(`${dir.name}: invalid name`);
  if (description.length < 80 || description.length > 1024) problems.push(`${dir.name}: description length ${description.length}`);
  if (!/\bUse (when|for)\b/.test(description)) problems.push(`${dir.name}: description should say when to use it`);
  const lines = text.split('\n').length;
  if (lines > 120) problems.push(`${dir.name}: SKILL.md has ${lines} lines; move detail into supporting files`);
  for (const md of readdirSync(join(root, dir.name)).filter((f) => f.endsWith('.md'))) {
    for (const [, target] of readFileSync(join(root, dir.name, md), 'utf8').matchAll(/\]\(([^)#:]+)\)/g)) {
      if (!existsSync(join(dirname(join(root, dir.name, md)), target))) problems.push(`${dir.name}/${md}: broken link ${target}`);
    }
  }
  console.log(`${dir.name}: ${lines} lines, description ${description.length} chars`);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('All skills pass structural checks.');

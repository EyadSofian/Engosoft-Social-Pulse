/**
 * Saves the courses engosoft.com shows, with their goals, outcomes and audience, as the bundled snapshot
 * (server/data/engosoft-website-courses.json). The server applies it at start-up when it is newer than its
 * last sync, then keeps the library current from the website itself.  Run: npx tsx scripts/refresh-website-courses.ts
 */
import { writeFileSync } from 'node:fs';
import { fetchWebsiteCatalog } from '../server/website-courses.js';

const catalog = await fetchWebsiteCatalog();
if (catalog.courses.length < 30) throw new Error(`Only ${catalog.courses.length} courses came back; not replacing the snapshot.`);
const { failed, ...snapshot } = catalog;
writeFileSync(new URL('../server/data/engosoft-website-courses.json', import.meta.url), `${JSON.stringify(snapshot, null, 1)}\n`);
const empty = (key: 'objectives' | 'outcomes' | 'audience' | 'description') => snapshot.courses.filter((c) => !c[key].length).length;
console.log(`${snapshot.courses.length} of ${snapshot.discovered} courses saved; pages not read: ${failed.length ? failed.join(', ') : 'none'}.`);
console.log(`Without goals: ${empty('objectives')}, without outcomes: ${empty('outcomes')}, without audience: ${empty('audience')}, without overview: ${empty('description')}.`);

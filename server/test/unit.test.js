// Pure-logic unit tests — no database or npm packages required:  npm testunit.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeId, normaliseVideo } from '../src/utils/youtube.js';
import { slugify } from '../src/utils/slugify.js';
import { can, permissionsFor, PERMISSIONS as P } from '../src/config/permissions.js';

test('parseYouTubeId handles every common URL form', () => {
  const id = 'inpok4MKVLM';
  for (const u of [id, `https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`, `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}?feature=share`, `https://m.youtube.com/watch?v=${id}&t=10`, `youtube.com/shorts/${id}`]) {
    assert.equal(parseYouTubeId(u), id, u);
  }
  assert.equal(parseYouTubeId('https://vimeo.com/123'), null);
  assert.equal(parseYouTubeId('not a url'), null);
});

test('normaliseVideo keeps url and id in sync (URL wins)', () => {
  const a = { youtubeUrl: 'https://youtu.be/inpok4MKVLM', youtubeId: 'OLDOLDOLD11' };
  normaliseVideo(a);
  assert.equal(a.youtubeId, 'inpok4MKVLM');
  const b = { youtubeId: 'inpok4MKVLM' };
  normaliseVideo(b);
  assert.equal(b.youtubeUrl, 'https://www.youtube.com/watch?v=inpok4MKVLM');
  const c = { youtubeUrl: 'garbage', youtubeId: '' };
  normaliseVideo(c);
  assert.equal(c.youtubeUrl, '');
});

test('slugify produces SEO-friendly slugs', () => {
  assert.equal(slugify('Awaken Within'), 'awaken-within');
  assert.equal(slugify('  Yoga Nidra: The Art of Rest! '), 'yoga-nidra-the-art-of-rest');
  assert.equal(slugify('Énergie Mindful'), 'energie-mindful');
});

test('RBAC: roles get only their permissions', () => {
  const admin = { role: 'admin' };
  const manager = { role: 'manager' };
  const trainer = { role: 'trainer' };
  const learner = { role: 'learner' };
  assert.ok(can(admin, P.PAYMENTS_REFUND));
  assert.ok(can(manager, P.CONTENT_MANAGE));
  assert.ok(can(manager, P.LIVE_MANAGE_ALL));
  assert.ok(!can(manager, P.USERS_MANAGE), 'manager must not manage users');
  assert.ok(!can(manager, P.PAYMENTS_READ), 'manager must not see payments');
  assert.ok(!can(manager, P.COURSES_MANAGE_ALL));
  assert.ok(can(trainer, P.COURSES_MANAGE_OWN));
  assert.ok(!can(trainer, P.COURSES_MANAGE_ALL));
  assert.deepEqual(permissionsFor(learner), []);
  assert.ok(can({ role: 'manager', extraPermissions: [P.PAYMENTS_READ] }, P.PAYMENTS_READ), 'extra permissions grant access');
});

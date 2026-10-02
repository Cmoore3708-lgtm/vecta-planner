import test from 'node:test';
import assert from 'node:assert/strict';
import { profileOptions } from '../../workers/haynes/profile-options.mjs';

test('Windows uses installed Edge and a dedicated AppData profile', () => {
  const profile = profileOptions({ LOCALAPPDATA: 'C:\\Users\\Chris\\AppData\\Local' }, 'win32');
  assert.equal(profile.directory, 'C:\\Users\\Chris\\AppData\\Local\\VectaHaynes\\EdgeProfile');
  assert.equal(profile.options.channel, 'msedge');
  assert.equal(profile.options.chromiumSandbox, true);
});

test('explicit private profile works on Windows; missing AppData fails closed', () => {
  assert.equal(profileOptions({ HAYNES_PROFILE_DIR: 'D:\\PrivateHaynes' }, 'win32').directory, 'D:\\PrivateHaynes');
  assert.throws(() => profileOptions({}, 'win32'), /LOCALAPPDATA/);
  assert.equal(profileOptions({}, 'linux').directory, './profile');
  assert.equal(profileOptions({}, 'linux').options.channel, undefined);
});

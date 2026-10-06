import path from 'node:path';

export function profileOptions(env = process.env, platform = process.platform) {
  const windows = platform === 'win32';
  if (windows && !env.LOCALAPPDATA && !env.HAYNES_PROFILE_DIR) {
    throw Error('Windows LOCALAPPDATA is unavailable; configure HAYNES_PROFILE_DIR.');
  }
  return {
    directory: env.HAYNES_PROFILE_DIR || (windows
      ? path.win32.join(env.LOCALAPPDATA, 'VectaHaynes', 'EdgeProfile')
      : './profile'),
    options: {
      acceptDownloads: false,
      chromiumSandbox: true,
      ...(windows ? { channel: 'msedge' } : {})
    }
  };
}

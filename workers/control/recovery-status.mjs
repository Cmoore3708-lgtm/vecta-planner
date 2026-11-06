// Telemetry must never interrupt the supervisor's child restart or safe stop.
// Windows readers can briefly deny replacement of an otherwise writable file.
import fs from 'node:fs';

export function recoveryStatusWriter(statusFile, log) {
  const temp = statusFile + '.supervisor.' + process.pid + '.tmp';
  let previousError = '';
  return status => {
    try {
      fs.writeFileSync(temp, JSON.stringify(status), {mode:0o600});
      fs.renameSync(temp, statusFile);
      previousError = '';
    } catch (error) {
      // Keep the previous complete status. Try publication again on the next
      // backoff tick, while the independent restart deadline keeps advancing.
      try { fs.unlinkSync(temp); } catch {}
      const code = error.code || 'WRITE_FAILED';
      if (code !== previousError) log('Worker status update delayed (' + code + '). Automatic recovery continues.');
      previousError = code;
    }
  };
}

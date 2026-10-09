export async function pullServiceTask(rpc, tasks, onUnavailable = () => {}) {
  if (tasks.busy) return;
  try {
    const task = await rpc({action:'pull'}, true);
    if (task.status === 'JOB') tasks.start(task);
  } catch (error) {
    if (error.message === 'PAIRING_REQUIRED') throw error;
    onUnavailable();
  }
}

export async function pollServiceQueue(rpc, tasks, { isStopped, stop, onUnavailable = () => {}, wait = () => new Promise(resolve => setTimeout(resolve, 5000)) }) {
  while (!isStopped()) {
    try { await pullServiceTask(rpc, tasks, onUnavailable); }
    catch (error) {
      if (error.message === 'PAIRING_REQUIRED') { stop(); return; }
      onUnavailable();
    }
    if (!isStopped()) await wait();
  }
}

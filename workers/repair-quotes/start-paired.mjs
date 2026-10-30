import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const data=process.env.VECTA_WORKER_DATA_DIR;
const repairDir=data?path.join(data,'repair-quotes'):here;
const connection=JSON.parse(fs.readFileSync(path.join(repairDir,'repair-connection.local.json'),'utf8'));
if(connection.origin!=='https://vecta-planner.vercel.app'||!/^[a-f0-9]{64}$/.test(connection.token||''))throw Error('Repair quote pairing is invalid.');
process.env.REPAIR_QUOTE_ORIGIN=connection.origin;
process.env.REPAIR_QUOTE_WORKER_TOKEN=connection.token;
process.env.REPAIR_QUOTE_CONFIG_FILE=path.join(repairDir,'repair-config.local.json');
// Optional service connection shares the same signed-in GSF browser and token.
const serviceConfig=data?path.join(data,'gsf/live-service-config.local.json'):path.join(here,'../gsf/live-service-config.local.json');
if(fs.existsSync(serviceConfig)){
 process.env.GSF_WORKSHOP_ORIGIN=connection.origin;
 process.env.GSF_WORKER_TOKEN=connection.token;
 process.env.GSF_CONFIG_FILE=serviceConfig;
}
await import('../gsf/worker.mjs');

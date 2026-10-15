import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
// Stream the response so Vercel's buffered-response payload ceiling cannot
// truncate a growing backup. The database snapshot is validated before sending.
export async function streamBackup(res,backup){
 const bytes=Buffer.from(JSON.stringify(backup),'utf8');
 const chunks=function*(){for(let offset=0;offset<bytes.length;offset+=65536)yield bytes.subarray(offset,offset+65536)};
 res.status(200);
 await pipeline(Readable.from(chunks()),res);
}

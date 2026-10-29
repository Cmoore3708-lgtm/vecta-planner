import {batchRelayHandler} from './handler.mjs';
Deno.serve(batchRelayHandler({env:(name:string)=>Deno.env.get(name)}));

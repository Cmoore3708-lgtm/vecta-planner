import {createPricingCache} from '../../../lib/haynes-pricing-cache.js';
Deno.serve(createPricingCache({env:(key:string)=>Deno.env.get(key)}));

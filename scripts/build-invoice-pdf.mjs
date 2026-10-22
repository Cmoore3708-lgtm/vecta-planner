import {build} from 'esbuild';
await build({entryPoints:['lib/invoice-print-pdf-client.js'],bundle:true,minify:true,platform:'browser',target:'es2020',format:'iife',outfile:'public/js/vecta-invoice-pdf-client.js',legalComments:'none'});

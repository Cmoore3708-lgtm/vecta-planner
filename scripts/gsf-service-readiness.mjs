// Run from the repository, not as a second workshop-PC setup.
import {readFileSync} from 'node:fs';
import {serviceCoverage,serviceCoverageMarkdown} from '../workers/gsf/service-readiness.mjs';
const input=JSON.parse(readFileSync(new URL('../workers/gsf/comparison-input.example.json',import.meta.url),'utf8'));
const config=process.argv[2]?JSON.parse(readFileSync(process.argv[2],'utf8')):null;
process.stdout.write(serviceCoverageMarkdown(serviceCoverage(input,config)));

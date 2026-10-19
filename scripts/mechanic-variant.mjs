import {readFileSync} from 'node:fs';
const original=JSON.parse(readFileSync(new URL('./original-mechanic-variant.json',import.meta.url),'utf8')).recovered;
function once(source,before,after){
 if(!source.includes(before))throw new Error('Mechanics build no longer matches the workshop source: '+before.slice(0,80));
 return source.replace(before,after);
}
export function mechanicVariant(source){
 // Restore the original deployed mechanics fork, carrying current fixes in the core.
 source=source.replace(/function navItems\(\)\{[^\n]*\}/, "function navItems(){return [['planner','Dashboard'],['completedJobs','Completed Jobs']];}\n"+original.mechanicCompletedJobsHtml);
 for(const name of ['plannerHtml','plannerMetricsHtml']){
  const pattern=new RegExp('function '+name+'\\(\\)\\{[\\s\\S]*?\\n\\}');
  const actual=name==='plannerMetricsHtml'?/function plannerMetricsHtml\(mechanics,liveJobs,dayJobs\)\{[\s\S]*?\n\}/:pattern;
  if(!actual.test(source))throw new Error('Cannot restore mechanics '+name);
  source=source.replace(actual,()=>original[name]);
 }
 source=once(source,"if(view==='planner')c.innerHTML=plannerHtml();", "if(view==='planner')c.innerHTML=plannerHtml();if(view==='completedJobs')c.innerHTML=mechanicCompletedJobsHtml();");
 source=once(source,"document.getElementById('currentDate').value=selectedIso();", "if(view!=='planner'&&view!=='completedJobs')view='planner';document.getElementById('currentDate').value=selectedIso();");
 source=source.replace(/<button[^>]*id="dashboardBookedToday"[^>]*>[\s\S]*?<\/button>/,'');
 source=source.replace(/<button[^>]*id="newQuoteTop"[^>]*>[\s\S]*?<\/button>/,'');
 source=source.replace(/<div class="plannerGlobalSearchWrap">[\s\S]*?<\/div>/,'');
 source=once(source,"document.getElementById('newQuoteTop').onclick=function(){openJobModal(null,{status:'quote',technician:'Unallocated'})};",'');
 source=once(source,'bindPlannerGlobalSearch();installFinancialInvoiceNavigation();','bindPlannerGlobalSearch();');
 source=once(source,'          if(!id) return result;', "          if(IS_MECHANIC){['markComplete','markReady','createInvoiceFromJob','deleteJob','undoJobCompletion','returnToMechanic','createQuote','convertQuote'].forEach(function(key){var control=document.getElementById(key);if(control)control.remove();});}\n          if(!id) return result;");

 source=once(source,"jobsForList(jobsListMode).filter(function(j){return !q", "(view==='completedJobs'?jobsForList('completed').concat((app.jobs||[]).filter(function(j){return j.status==='work_complete'})):jobsForList(jobsListMode)).filter(function(j){return !q");
 source=source.replace('<head>','<head>\n<meta name="vecta-mechanic-build" content="restored-v79-current-core">\n<script>window.VECTA_MECHANIC_DEPLOYMENT=true;</script>\n'+original.styles);
 source=source.replace(/<title>[^<]*<\/title>/,'<title>VECTA Mechanics Dashboard</title>');
 return source;
}

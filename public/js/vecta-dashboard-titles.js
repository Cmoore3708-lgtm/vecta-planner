(function(root){
  'use strict';
  function create(dependencies){
    var mechanicWorkView=dependencies.workView,jobTypeLabels=dependencies.labels,esc=dependencies.escape,isWebsiteBookingJob=dependencies.isWebsite,templateDataForType=dependencies.template;
// A dashboard label is separate from the full customer/workshop instructions.
// Overrides use the existing note metadata so they sync with the job offline too.
function dashboardTitleText(value){
  var text=String(value||'').replace(/\s+/g,' ').trim();
  return text.length<=90?text:text.slice(0,87).replace(/\s+\S*$/,'')+'…';
}
function savedDashboardTitle(job){
  var match=String(job&&job.customer_note||'').match(/\[\[VECTA_DASHBOARD_TITLE:([^\]]*)\]\]/);
  try{return match?dashboardTitleText(decodeURIComponent(match[1])):''}catch(e){return ''}
}
function noteWithDashboardTitle(note,value){
  var clean=String(note||'').replace(/\n?\[\[VECTA_DASHBOARD_TITLE:[^\]]*\]\]/g,'');
  var title=dashboardTitleText(value);
  return title?clean+'\n[[VECTA_DASHBOARD_TITLE:'+encodeURIComponent(title)+']]':clean;
}
function automaticDashboardTitle(job){
  var work=mechanicWorkView(job).board;
  var lines=String(work||'').split(/\r?\n|(?<=[.!?])\s+/).map(function(line){return line.trim()}).filter(function(line){
    return line&&!/^(?:pick(?:ing)?\s*up|collect(?:ion|ing)?|drop(?:ping)?\s*off|please (?:call|ring)|call (?:me|before)|booking ref|oil specification)\b/i.test(line)&&!/\[[A-Z0-9-]{4,}\]/i.test(line);
  });
  var text=lines.join(' ').replace(/\s+/g,' ').trim();
  var types=jobTypeLabels(job).filter(function(label){return !/^(?:other|general|repairs?|diagnostics?)$/i.test(label)});
  if(text.length<=90&&lines.length<=1&&text)return dashboardTitleText(types.filter(function(label){return text.toLowerCase().indexOf(label.toLowerCase())<0}).concat(text).join(' · '));
  text=text.replace(/\b(?:not|never) overheat(?:ing|s|ed)?\b/gi,'').replace(/\bno (?:clicking|brake noise|oil leak|coolant leak)\b/gi,'');
  var topics=types.slice(),service=types.some(function(label){return /service/i.test(label)});
  function add(pattern,label){if(pattern.test(text)&&topics.indexOf(label)<0)topics.push(label)}
  // Describe the reported work, never turn a suspected part into a diagnosis.
  add(/\boverheat(?:ing|s|ed)?\b/i,'Overheating');
  add(/\b(?:no (?:warm|hot) air|heater(?:s)? (?:blow(?:ing)? |are |is )?cold|no (?:cabin )?heat)\b/i,'No cabin heat');
  add(/\b(?:engine (?:management|warning) light|EML)\b/i,'Engine warning light');
  if(/\bbrake discs?\b/i.test(text))topics.push(/\bfront brake discs?\b/i.test(text)&&!/\brear brake discs?\b/i.test(text)?'Front brake discs':'Brake discs');
  add(/\bbrake pads?\b/i,'Brake pads');
  add(/\b(?:noisy brakes|brake noise)\b/i,'Brake noise');
  if(/\bclicking\b/i.test(text))topics.push(/\bclicking\b[^.!?]{0,90}\breverse\b/i.test(text)?'Clicking in reverse':'Clicking noise');
  else add(/\bdriveshaft\b/i,'Driveshaft check');
  add(/\b(?:coolant|water) leak\b|\bleak\b[^.!?]{0,40}\b(?:coolant|oil cooler)\b/i,'Coolant leak');
  add(/\boil leak\b/i,'Oil leak');
  add(/\bDPF\b/i,'DPF check / regeneration');
  add(/\b(?:timing|cam)\s*belt\b/i,'Timing belt');
  add(/\bclutch\b/i,'Clutch work');
  add(/\bpuncture\b/i,'Puncture repair');
  if(!/\bpuncture\b/i.test(text))add(/\btyres?\b/i,'Tyre work');
  add(/\bsuspension\b/i,'Suspension check');
  if(!/\b(?:clicking|brake noise|noisy brakes|suspension)\b/i.test(text))add(/\b(?:noise|noisy|rattle|knocking)\b/i,'Investigate noise');
  add(/\b(?:not start|won.t start|non.?start)\b/i,'Starting fault');
  if(!service)add(/\boil (?:and |& )?filter\b|\boil change\b/i,'Oil & filter');
  if(topics.length){
    var unique=topics.filter(function(label,index){return topics.indexOf(label)===index});
    return dashboardTitleText(unique.slice(0,3).join(' · ')+(unique.length>3?' + other work':''));
  }
  // Unfamiliar work gets a short first sentence which the office can refine.
  return dashboardTitleText(text.split(/(?<=[.!?])\s/)[0]||'Job');
}
function dashboardJobTitle(job){
  var routine=jobTypeLabels(job).some(function(label){return /\bservice\b|^(?:six|6)[ -]*month(?:ly)?(?: safety)? check$/i.test(label)});
  return routine?'':savedDashboardTitle(job)||automaticDashboardTitle(job);
}
function dashboardTitleEditorHtml(job){
  return '<div class="field wide"><label for="job_dashboard_title">Dashboard title</label><input id="job_dashboard_title" maxlength="90" value="'+esc(savedDashboardTitle(job))+'" placeholder="'+esc(automaticDashboardTitle(job))+'" aria-describedby="job_dashboard_title_hint"><small id="job_dashboard_title_hint">Short summary for the dashboard. Leave blank to generate from the full description.</small></div>';
}
function bindDashboardTitleEditor(job){
  var document=dependencies.document();
  var title=document.getElementById('job_dashboard_title'),work=document.getElementById('job_work_required'),type=document.getElementById('job_job_type');
  if(!title||!work)return;
  function refresh(){var draft=Object.assign({},job,{work_required:work.value,job_type:type?type.value:job.job_type});delete draft.job_types;title.placeholder=automaticDashboardTitle(draft)}
  work.addEventListener('input',refresh);work.addEventListener('change',refresh);
  if(type)type.addEventListener('change',refresh);
}


function plannerJobDescription(j){
  if(isWebsiteBookingJob(j))return '';
  function key(value){return String(value||'').toLowerCase().replace(/[_–—-]+/g,' ').replace(/\s+/g,' ').replace(/[.!]+$/,'').trim()}
  var labels=jobTypeLabels(j).filter(function(label){return /\bservice\b|^(?:six|6) month(?:ly)?(?: safety)? check$|^mot(?: test)?$/i.test(key(label))}),defaults=[];
  labels.forEach(function(label){
    defaults.push(label);
    if(/^(?:six|6) month/.test(key(label)))defaults.push('6 Month Safety Check','Six Month Safety Check','6 monthly check','Six monthly check');
    if(/^mot(?: test)?$/.test(key(label)))defaults.push('MOT','MOT test','MOT test / MOT preparation');
    var preset=templateDataForType(/^(?:six|6) month/.test(key(label))?'6 Month Safety Check':label);if(preset&&preset.work_required)defaults.push(preset.work_required);
  });
  defaults=defaults.filter(Boolean).sort(function(a,b){return b.length-a.length});
  return String(j.work_required||'').split(/\r?\n/).map(function(line){
    var text=line.trim();if(/^general[.!]?$/i.test(text))return '';
    if(defaults.some(function(value){return key(value)===key(text)}))return '';
    // Remove only a recognised standard prefix followed by an explicit separator.
    // The remainder is additional work and must stay visible.
    for(var i=0;i<text.length;i++){if(!/[:;–—-]/.test(text[i]))continue;var prefix=text.slice(0,i).trim();if(defaults.some(function(value){return key(value)===key(prefix)})){text=text.slice(i+1).trim();break}}
    return text;
  }).filter(Boolean).join('\n').trim();
}
    return {plannerJobDescription,dashboardTitleText,savedDashboardTitle,noteWithDashboardTitle,automaticDashboardTitle,dashboardJobTitle,dashboardTitleEditorHtml,bindDashboardTitleEditor};
  }
  root.VectaDashboardTitles={create:create};
})(typeof window!=='undefined'?window:globalThis);

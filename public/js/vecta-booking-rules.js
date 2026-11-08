(function(root){
  'use strict';

  function statusKey(request){return String(request&&request.status||'awaiting_review').trim().toLowerCase()}
  function isInboxRequest(request){var status=statusKey(request);return status!=='booked'&&status!=='deleted'&&status!=='cancelled'}
  function requestIdFromJob(job){
    var direct=String(job&&job.website_request_id||'').trim();
    if(direct)return direct;
    var match=String(job&&job.customer_note||'').match(/Website request ID:\s*([^|]+?)(?:\s*\|\||$)/i);
    return match?String(match[1]||'').trim():'';
  }
  function requestMatchesJob(request,job,dependencies){
    if(!request||!job)return false;
    var deps=dependencies||{},normalise=typeof deps.normaliseRegistration==='function'?deps.normaliseRegistration:function(value){return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'')};
    var linked=requestIdFromJob(job);
    if(linked&&String(request.id)===linked)return true;
    if(request.job_id&&String(request.job_id)===String(job.id))return true;
    if(typeof deps.isWebsiteJob==='function'&&!deps.isWebsiteJob(job))return false;
    var requestReg=normalise(request.registration||''),jobReg=normalise(job.registration||'');
    var requestName=String(request.customer_name||'').trim().toLowerCase(),jobName=String(job.customer_name||'').trim().toLowerCase();
    var requestWork=String(request.work_required||'').trim(),jobWork=String(job.work_required||'').trim();
    var sameReg=!!requestReg&&requestReg===jobReg,sameName=!!requestName&&requestName===jobName,sameWork=!!requestWork&&requestWork===jobWork;
    return (sameReg&&sameName)||(sameReg&&sameWork)||(sameName&&sameWork);
  }

  var sparkPlugChoices={
    'Customer requests replacement.':'Spark plugs: Yes please, change them.',
    'Check the manufacturer’s guidance; replace if due. If service history is unclear, contact the customer first.':'Spark plugs: Check first — replace if due. If service history is unclear, contact the customer first.'
  };
  function isSparkPlugInstruction(line){return Object.values(sparkPlugChoices).includes(line.trim())}
  function bookingWorkDescription(work){
    // Retain quote details separately from the instructions, including on jobs
    // created before choices appeared in the editable job description.
    var blocks=String(work||'').split(/\r?\n[ \t]*\r?\n/),kept=[],instructions=[],insertAt=-1;
    for(var block of blocks){
      var lines=block.split(/\r?\n/),heading=lines[0].trim(),instruction='';
      if(/^Mini valet · £30 including VAT: snow-foam pressure wash, hoover inside, (?:Dashboard & Media|dash &) screens cleaned\.$/i.test(heading)){
        instruction='Mini Valet';
        lines.shift();
      }else if(/^Optional service item\s*[—–-]\s*Spark plugs$/i.test(heading)&&Object.hasOwn(sparkPlugChoices,(lines[1]||'').trim())){
        instruction=sparkPlugChoices[lines[1].trim()];
        lines.splice(0,2);
      }
      if(insertAt<0&&(instruction||/^(?:Service (?:guide price|price agreed)|Booking guide total):/i.test(heading)))insertAt=kept.length;
      if(instruction&&!instructions.includes(instruction))instructions.push(instruction);
      if(lines.length)kept.push(instruction?lines.join('\n'):block);
    }
    if(!instructions.length)return work;
    var existing=kept.join('\n').split(/\r?\n/).map(function(line){return line.trim().toLowerCase()});
    var added=instructions.filter(function(line){return !existing.includes(line.toLowerCase())});
    if(added.length)kept.splice(insertAt,0,added.join('\n'));
    return kept.join('\n\n');
  }

  var partsChoices={budget:'budget',mid_range:'mid range',oem:'OEM'};
  var repairChoices={change_parts:'Change the parts',book_later:'Put the car back together, I’ll book it back in later.'};
  function validCustomerPreferences(value){
    return !!value&&value.version===1&&typeof value.parts==='string'&&Object.hasOwn(partsChoices,value.parts)&&typeof value.serious_repairs==='string'&&Object.hasOwn(repairChoices,value.serious_repairs);
  }
  function customerPreferences(record){
    if(validCustomerPreferences(record&&record.customer_preferences))return record.customer_preferences;
    // Read the server-created snapshot at the end of the note. A later edit to
    // the job description must not erase the customer's original instructions.
    var matches=Array.from(String(record&&record.customer_note||'').matchAll(/\[\[VECTA_WEB_DETAILS:([^\]]+)\]\]/g));
    try{var details=JSON.parse(decodeURIComponent(matches[matches.length-1][1]));return validCustomerPreferences(details.customer_preferences)?details.customer_preferences:null;}catch(e){return null;}
  }
  function customerPreferenceLines(record){
    var value=customerPreferences(record);if(!value)return [];
    return ['Customer would like '+partsChoices[value.parts]+' parts',
      'If we find anything serious that needs changing and cannot get hold of the customer: '+repairChoices[value.serious_repairs]];
  }
  function customerPreferencesNote(record){
    var value=customerPreferences(record);return value?'\n[[VECTA_WEB_DETAILS:'+encodeURIComponent(JSON.stringify({customer_preferences:value}))+']]':'';
  }
  function customerPartsLabel(record){
    var value=customerPreferences(record);return value?partsChoices[value.parts]:'';
  }
  function customerInstructionsHtml(record){
    // Fixed allow-listed labels only; never include customer-written HTML here.
    var lines=customerPreferenceLines(record);
    return lines.length?'<aside class="jobCustomerInstructions" aria-label="Customer instructions"><h4>Customer instructions</h4>'+lines.map(function(line){return '<p>'+line+'</p>'}).join('')+'</aside>':'';
  }

  root.VectaBookingRules=Object.freeze({
    customerPartsLabel:customerPartsLabel,
    customerInstructionsHtml:customerInstructionsHtml,
    validCustomerPreferences:validCustomerPreferences,
    customerPreferences:customerPreferences,
    customerPreferenceLines:customerPreferenceLines,
    customerPreferencesNote:customerPreferencesNote,
    bookingWorkDescription:bookingWorkDescription,
    isSparkPlugInstruction:isSparkPlugInstruction,
    statusKey:statusKey,
    isInboxRequest:isInboxRequest,
    requestIdFromJob:requestIdFromJob,
    requestMatchesJob:requestMatchesJob
  });
})(typeof window!=='undefined'?window:globalThis);

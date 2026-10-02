(()=>{
  if(globalThis.__vectaHaynesReader)return;globalThis.__vectaHaynesReader=true;
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const visible=el=>!!(el.getClientRects().length);
  const links=()=>Array.from(document.querySelectorAll('a')).filter(visible);
  function snapshot(){
    const text=document.body.innerText;
    const headings=Array.from(document.querySelectorAll('h3')).filter(visible);
    const rows=headings.filter(h=>h.closest('li')?.querySelector('.checker.ok')&&!/^FOLLOW UP\b/.test(clean(h.textContent)));
    const oilHeading=rows.find(h=>/^Renew the engine oil/i.test(clean(h.textContent)));
    const oilList=oilHeading?.closest('ul');
    const oilRow=oilHeading?.closest('li');
    let lubricant=oilRow?.querySelector('a[href*="/lubricants?"]');
    // Smart links may be in the next list row rather than the heading row.
    if(!lubricant&&oilList)lubricant=oilList.querySelector('a[href*="/lubricants?"]');
    const selected=document.querySelector('#selectedPeriod');
    const partsList=document.querySelector('#partsList,.partsList');
    const allLinks=links();
    const modelLink=allLinks.find(a=>/\/modelDetail\?/.test(a.href)&&/\d{4}/.test(a.textContent));
    const engineSections=Array.from(document.querySelectorAll('h2')).filter(h=>visible(h)&&/^Engine\b/.test(clean(h.textContent))).map(h=>({label:clean(h.textContent),lines:Array.from(h.parentElement.querySelectorAll('li')).map(li=>clean(li.textContent))}));
    return {
      login:!!document.querySelector('input[type="password"]'),blocked:/Verify you are human|Checking your browser|unusual traffic|automated traffic/i.test(text),
      registrationInput:!!document.querySelector('#numberPlate,input[name="numberPlate"]'),
      registration:(text.match(/Vehicle Registration Number:\s*([A-Z0-9 ]+)/)?.[1]||'').replace(/\s/g,''),
      registrationDate:text.match(/Registration Date:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1]||'',
      model:location.pathname.endsWith('/modelDetail'),typeId:new URL(location.href).searchParams.get('typeId'),
      vehicle:clean(document.querySelector('h2')?.textContent||modelLink?.textContent),
      systems:allLinks.filter(a=>/^maintenanceSystem_/.test(a.id)).map(a=>({id:a.id,label:clean(a.textContent)})),
      periods:allLinks.filter(a=>/^([\d,]+) miles\/\d+ months$/.test(clean(a.textContent))).map(a=>({label:clean(a.textContent),url:a.href})),
      period:clean(selected?.selectedOptions[0]?.textContent),sourceUrl:location.href,
      operations:rows.map(h=>clean(h.textContent)),
      parts:partsList?Array.from(partsList.querySelectorAll('h3')).map(h=>clean(h.textContent)):[],
      additionalWork:headings.filter(h=>h.closest('li')?.querySelector('input[id^="addSentence_"]')).map(h=>clean(h.textContent)),
      labourHours:text.match(/STANDARD TIME\s+(\d+(?:\.\d+)?)/)?.[1]||null,
      lubricantUrl:lubricant?.href||'',engineSections,engineLinks:allLinks.filter(a=>/^Engine\b/.test(clean(a.textContent))).map(a=>({label:clean(a.textContent)}))
    };
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    try{
      const {command,payload={}}=message;
      if(command==='snapshot'){respond(snapshot());return;}
      if(command==='registration'){
        const input=document.querySelector('#numberPlate,input[name="numberPlate"]'),button=document.querySelector('#licencePlateBtn');
        if(!input||!button)throw Error('Registration search is unavailable.');
        input.value=payload.registration;input.dispatchEvent(new Event('input',{bubbles:true}));button.click();
      }else if(command==='maintenance'){
        const link=links().find(a=>clean(a.textContent)==='Maintenance');if(!link)throw Error('Maintenance data is unavailable.');link.click();
      }else if(command==='system'){
        const link=document.getElementById(payload.id);if(!link||!/^maintenanceSystem_/.test(link.id))throw Error('Maintenance system is unavailable.');link.click();
      }else if(command==='lubricants'){
        const engine=VectaHaynesRules.ukEngine(links().filter(a=>/^Engine\b/.test(clean(a.textContent))).map(a=>({label:clean(a.textContent),link:a})));
        engine.link.click();
      }else throw Error('Unsupported browser action.');
      respond({ok:true});
    }catch(e){respond({error:e.message});}
  });
})();

(function(root){
 'use strict';
 const positions=['Front passenger','Rear passenger','Front driver','Rear driver'];
 // Optional refinements to approved illustrations, in original viewBox units.
 // Every other model is measured from its drawing below; this is not an allowlist.
 const profiles={
  '319106279':[[170,157,20,34],[261.8,132.2,11,27],[78,148,17,29],[169.8,133.2,10,24]],
  '319004648':[[170,164,19,33],[263,138,9,22],[58.5,152.4,16,29],[158,136.4,9,21]],
  '319004664':[[169.3,164.1,18.5,33],[263.7,138,9,22],[56,151,16,29],[150.4,134.9,8,21]],
  '319005881':[[174.2,166.1,15,29],[255,143.4,8,19],[67,155,14,25],[147.8,142.3,7,18]],
  '319118141':[[151.6,169.2,17,28],[272.6,127.8,10,19],[52,154,15,24],[173,122.6,9,17]],
  '319002225':[[160.7,163,20,32],[260,131.8,10,23],[70,145,19,27],[169.3,123.8,9,21]],
  '319009548':[[156.3,166.2,19,32],[258.1,135.3,11,24],[64,152,17,27],[165.8,131.1,10,21]]
 };
 const measured=new Map();
 const watchers=new WeakMap();
 function projectWheels(front,rear,hidden,body){
  const direction=front[0]<rear[0]?1:-1;
  const edge=direction===1?body.x:body.x+body.width;
  const across=Math.max(front[2]*2.5,Math.abs(front[0]-edge)*.77);
  const far=hidden?[hidden[0],hidden[1]+hidden[3]*.3,front[2]*.86,front[3]*.86]:[front[0]-direction*across,front[1]-front[3]*.36,front[2]*.86,front[3]*.86];
  return [front,rear,far,[rear[0]+far[0]-front[0],rear[1]+far[1]-front[1]+rear[3]*.5,rear[2]*.9,rear[3]*.9]];
 }
 function measureWheels(svg){
  const layer=svg.querySelector('[id="wheels"]');if(!layer)return null;
  const NS='http://www.w3.org/2000/svg',stage=root.document.createElement('div');
  stage.style.cssText='position:absolute;left:-10000px;top:0;width:600px;visibility:hidden;pointer-events:none';stage.append(svg);root.document.body.append(stage);
  try{
   // SVG groups can have their own transforms. Always measure in root units.
   const box=node=>{const b=node.getBBox(),matrix=svg.getCTM().inverse().multiply(node.getCTM());const corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:matrix.a*x+matrix.c*y+matrix.e,y:matrix.b*x+matrix.d*y+matrix.f}));const x=Math.min(...corners.map(p=>p.x)),y=Math.min(...corners.map(p=>p.y));return{x,y,width:Math.max(...corners.map(p=>p.x))-x,height:Math.max(...corners.map(p=>p.y))-y};};
   const whole=box(layer),paint=svg.querySelector('[id="transparant_colour"],[id="transparent_colour"]');
   const occluded=b=>{if(!paint||!svg.createSVGPoint)return false;const p=svg.createSVGPoint();p.x=b.x+b.width/2;p.y=b.y+b.height/2;const screen=p.matrixTransform(svg.getCTM());return [...paint.querySelectorAll('path,polygon,rect,circle,ellipse')].some(n=>n.getAttribute('fill')!=='none'&&n.isPointInFill?.(screen.matrixTransform(n.getCTM().inverse())));};
   // Several older drawings flatten wheel paths. Cluster those paths before
   // considering groups, so the same detector handles both supplier formats.
   const loose=[...layer.children].filter(n=>['path','polygon','circle','ellipse'].includes(n.localName)).map(node=>({node,box:box(node)})).filter(s=>s.box.width>0&&s.box.width<whole.width*.65).sort((a,b)=>a.box.x+a.box.width/2-b.box.x-b.box.width/2);
   const clusters=[];for(const s of loose){const last=clusters.at(-1),previous=last?.at(-1);if(!previous||s.box.x+s.box.width/2-previous.box.x-previous.box.width/2>whole.width*.12)clusters.push([s]);else last.push(s);}
   for(const cluster of clusters){if(cluster.length<6)continue;const group=root.document.createElementNS(NS,'g');layer.append(group);cluster.forEach(s=>group.append(s.node));}
   const all=[...layer.querySelectorAll('g')].filter(n=>n.querySelectorAll('path,polygon,circle,ellipse').length>=6).map(node=>({node,box:box(node)})).filter(({box:b})=>b.width>2&&b.height>2&&b.width/b.height>.15&&b.width/b.height<1.8&&b.width<whole.width*.7).sort((a,b)=>b.box.width*b.box.height-a.box.width*a.box.height);
   const visible=[];for(const candidate of all){if(occluded(candidate.box)||visible.some(r=>r.node.contains(candidate.node)||candidate.node.contains(r.node)||Math.abs(r.box.x+r.box.width/2-candidate.box.x-candidate.box.width/2)<whole.width*.22))continue;visible.push(candidate);if(visible.length===2)break;}
   if(visible.length!==2)return null;
   function wheel(candidate){const outer=candidate.box,nested=[...candidate.node.querySelectorAll('g')].filter(n=>n.querySelectorAll('path,polygon,circle,ellipse').length>=6).map(box).filter(b=>b.width>2&&b.height>2&&b.width<outer.width*.98&&b.height<outer.height*.98).sort((a,b)=>b.width*b.height-a.width*a.height);let rim=nested[0];
    if(!rim){const metal=[...candidate.node.querySelectorAll('path,polygon,circle,ellipse')].filter(n=>{const fill=n.getAttribute('fill')||'';return /^#[a-f0-9]{6}$/i.test(fill)&&Math.min(...[1,3,5].map(i=>parseInt(fill.slice(i,i+2),16)))>=90;}).map(box);if(metal.length>=6){const x=Math.min(...metal.map(b=>b.x)),y=Math.min(...metal.map(b=>b.y));rim={x,y,width:Math.max(...metal.map(b=>b.x+b.width))-x,height:Math.max(...metal.map(b=>b.y+b.height))-y};}}
    return rim?[rim.x+rim.width/2,rim.y+rim.height/2,Math.min(rim.width*.7,outer.width*.35),Math.min(rim.height*.65,outer.height*.4)]:[outer.x+outer.width/2,outer.y+outer.height/2,outer.width*.38,outer.height*.45];
   }
   const pair=visible.map(wheel).sort((a,b)=>b[3]-a[3]),front=pair[0],rear=pair[1];
   const hidden=all.filter(c=>occluded(c.box)&&!visible.some(v=>v.node.contains(c.node))).sort((a,b)=>Math.abs(a.box.x-front[0])-Math.abs(b.box.x-front[0]))[0];
   const result=projectWheels(front,rear,hidden?wheel(hidden):null,paint?box(paint):whole);
   return result.every(w=>w.every(Number.isFinite))?result:null;
  }finally{stage.remove();}
 }
 const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function selection(form){return positions.filter(p=>Array.isArray(form.tyre_positions)&&form.tyre_positions.includes(p));}
 function initialise(form){if(!Array.isArray(form.tyre_positions)){form.tyre_positions=[];form.tyre_quantity=0;}else{form.tyre_positions=selection(form);form.tyre_quantity=form.tyre_positions.length;}}
 function html(form,vehicle){
  initialise(form);
  if(!form.tyre_prices_checked)return '<div id="tyrePositions" class="tyre-position-selector" hidden></div>';
  const source=vehicle?.imageUrl||'',safe=/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.svgz?$/.test(source);
  return `<div id="tyrePositions" class="tyre-position-selector"><h3 class="tp-prompt">Please select how many tyres you need</h3>${safe?`<div class="tp-scene"><img class="tp-car" data-tyre-car data-vehicle-image data-vehicle-logo="separate" data-vehicle-crop="tight" data-registration="${esc(form.registration)}" data-colour="${esc(form.vehicle_colour)}" data-vehicle-name="${esc([vehicle.make,vehicle.model].filter(Boolean).join(' '))}" data-vehicle-source="${esc(source)}" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="${esc(form.vehicle||'Your vehicle')}"><img class="tp-car-detail" alt="" aria-hidden="true"><div class="tp-wheels"></div></div>`:''}<div class="tp-controls" role="group" aria-label="Choose tyres to replace">${[[positions[2],positions[0]],[positions[3],positions[1]]].map((pair,i)=>`<div class="tp-axle-group" role="group" aria-label="${i?'Rear':'Front'} tyres">${pair.map(p=>`<button type="button" data-tyre-position="${p}" aria-pressed="${selection(form).includes(p)}"><span class="tp-dot" aria-hidden="true">${selection(form).includes(p)?'✓':'+'}</span>${p}</button>`).join('')}</div>`).join('')}</div></div>`;
 }
 function mount(form,onChange){
  const host=root.document.getElementById('tyrePositions');if(!host||host.hidden)return;
  const chosen=selection(form),brand=form.tyre_brand||form.tyre_guide?.brand||'',img=host.querySelector('[data-tyre-car]');
  const bind=()=>host.querySelectorAll('[data-tyre-position]').forEach(button=>{const active=chosen.includes(button.dataset.tyrePosition);button.setAttribute('aria-pressed',String(active));const dot=button.querySelector('.tp-dot');if(dot)dot.textContent=active?'✓':'+';button.onclick=()=>{if(!form.tyre_choice||!form.tyre_brand){root.document.querySelector('.tyre-brand-choice:not(:disabled)')?.focus();return;}const next=selection(form),p=button.dataset.tyrePosition;form.tyre_positions=positions.filter(name=>name===p?!next.includes(name):next.includes(name));form.tyre_quantity=form.tyre_positions.length;form.tyre_guide=null;onChange();};});
  bind();
  if(!img)return;
  const asset=img.dataset.vehicleSource.match(/\/(\d+)\.svgz?$/)?.[1];
  const ready=()=>{
   if(!host.isConnected||!img.src.startsWith('data:image/svg+xml;charset=utf-8,'))return;
   try{
    const svg=new root.DOMParser().parseFromString(decodeURIComponent(img.src.slice(img.src.indexOf(',')+1)),'image/svg+xml').documentElement;
    const vb=(svg.getAttribute('viewBox')||'').split(/[ ,]+/).map(Number);if(vb.length!==4||!vb.every(Number.isFinite)||vb[2]<=0||vb[3]<=0)return;
    let profile=profiles[asset]||measured.get(asset);if(!profile){profile=measureWheels(svg);if(profile)measured.set(asset,profile);}if(!profile)return;
    const artworkWheels=profile.map((wheel,i)=>i===3?[wheel[0],wheel[1],wheel[2]*1.12,wheel[3]*1.12]:wheel);
    const [x,y,w,h]=vb,scene=host.querySelector('.tp-scene');scene.style.aspectRatio=w+'/'+h;
    host.querySelector('.tp-wheels').innerHTML=artworkWheels.map(([cx,cy,rx,ry],i)=>`<button type="button" class="tp-wheel ${i>=2?'tp-far':''} ${i===1||i===3?'tp-rear':''}" data-tyre-position="${positions[i]}" aria-label="${positions[i]} tyre" aria-pressed="${chosen.includes(positions[i])}" style="left:${(cx-x)/w*100}%;top:${(cy-y)/h*100}%;width:${rx*2/w*100}%;height:${ry*2/h*100}%"><span class="tp-ring">${i>=2?'<img class="tp-tyre" src="/assets/tyre-axle-still.webp" alt="">':''}<span class="tp-check" aria-hidden="true">✓</span></span>${brand?`<span class="tp-brand">${root.VectaTyreBooking.brandLogo(brand)}</span>`:''}</button>`).join('');
    const detail=host.querySelector('.tp-car-detail');detail.src=img.src;detail.style.maskImage=detail.style.webkitMaskImage=artworkWheels.slice(2).map(([cx,cy,rx,ry])=>`radial-gradient(ellipse ${(rx+7)/w*100}% ${(ry+7)/h*100}% at ${(cx-x)/w*100}% ${(cy-y)/h*100}%,#000 65%,transparent 100%)`).join(',');
    bind();watchers.get(host)?.disconnect();
   }catch{ /* Keep labelled controls usable if supplier artwork is malformed. */ }
  };
  if(img.dataset.vehicleReady==='1')ready();
  else {
   // Another booking image mount may already own this async render. Its mount
   // promise can resolve before this image finishes, so observe actual readiness.
   if(root.MutationObserver&&!watchers.has(host)){const observer=new root.MutationObserver(()=>{if(!host.isConnected){observer.disconnect();return;}if(img.dataset.vehicleReady==='1')ready();});observer.observe(img,{attributes:true,attributeFilter:['src','data-vehicle-ready']});watchers.set(host,observer);}
   if(root.VectaVehicleImage)root.VectaVehicleImage.mount().then(ready).catch(()=>{});
  }
 }
 root.VectaTyrePositions={positions,profiles,projectWheels,measureWheels,selection,initialise,html,mount};
})(window);

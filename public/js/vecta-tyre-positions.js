(function(root){
 'use strict';
 const positions=['Front passenger','Rear passenger','Front driver','Rear driver'];
 // Original supplier viewBox coordinates. Each artwork is individually aligned;
 // never guess hidden wheel positions for an unverified illustration.
 const profiles={
  '319004648':[[170,164,19,33],[263,138,9,22],[58.5,152.4,16,29],[158,136.4,9,21]],
  '319004664':[[169.3,164.1,18.5,33],[263.7,138,9,22],[56,151,16,29],[150.4,134.9,8,21]],
  '319005881':[[174.2,166.1,15,29],[255,143.4,8,19],[67,155,14,25],[147.8,142.3,7,18]],
  '319118141':[[151.6,169.2,17,28],[272.6,127.8,10,19],[52,154,15,24],[173,122.6,9,17]],
  '319002225':[[160.7,163,20,32],[260,131.8,10,23],[70,145,19,27],[169.3,123.8,9,21]],
  '319009548':[[156.3,166.2,19,32],[258.1,135.3,11,24],[64,152,17,27],[165.8,131.1,10,21]]
 };
 const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function selection(form){return positions.filter(p=>Array.isArray(form.tyre_positions)&&form.tyre_positions.includes(p));}
 function initialise(form){if(!Array.isArray(form.tyre_positions)){form.tyre_positions=[];form.tyre_quantity=0;}else{form.tyre_positions=selection(form);form.tyre_quantity=form.tyre_positions.length;}}
 function html(form,vehicle){
  initialise(form);
  const source=vehicle?.imageUrl||'',safe=/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.svgz?$/.test(source);
  return `<div id="tyrePositions" class="tyre-position-selector">${safe?`<div class="tp-scene"><img class="tp-car" data-tyre-car data-vehicle-image data-vehicle-logo="separate" data-vehicle-crop="tight" data-registration="${esc(form.registration)}" data-colour="${esc(form.vehicle_colour)}" data-vehicle-name="${esc([vehicle.make,vehicle.model].filter(Boolean).join(' '))}" data-vehicle-source="${esc(source)}" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="${esc(form.vehicle||'Your vehicle')}"><img class="tp-car-detail" alt="" aria-hidden="true"><div class="tp-wheels"></div></div>`:''}<div class="tp-controls" role="group" aria-label="Choose tyres to replace">${positions.map(p=>`<button type="button" data-tyre-position="${p}" aria-pressed="${selection(form).includes(p)}"><span class="tp-dot" aria-hidden="true">${selection(form).includes(p)?'✓':'+'}</span>${p}</button>`).join('')}</div></div>`;
 }
 function mount(form,onChange){
  const host=root.document.getElementById('tyrePositions');if(!host)return;
  const chosen=selection(form),brand=form.tyre_brand||'',img=host.querySelector('[data-tyre-car]');
  const bind=()=>host.querySelectorAll('[data-tyre-position]').forEach(button=>{const active=chosen.includes(button.dataset.tyrePosition);button.setAttribute('aria-pressed',String(active));button.onclick=()=>{if(!form.tyre_choice){root.document.querySelector('[data-tyre-choice]')?.focus();return;}const next=selection(form),p=button.dataset.tyrePosition;form.tyre_positions=positions.filter(name=>name===p?!next.includes(name):next.includes(name));form.tyre_quantity=form.tyre_positions.length;form.tyre_guide=null;onChange();};});
  bind();
  if(!img)return;
  const asset=img.dataset.vehicleSource.match(/\/(\d+)\.svgz?$/)?.[1],profile=profiles[asset];
  // The customer's real car still displays when its artwork has not yet been
  // aligned. The same four labelled buttons remain fully functional.
  const ready=()=>{
   if(!host.isConnected||!profile||!img.src.startsWith('data:image/svg+xml;charset=utf-8,'))return;
   try{
    const svg=new root.DOMParser().parseFromString(decodeURIComponent(img.src.slice(img.src.indexOf(',')+1)),'image/svg+xml').documentElement;
    const vb=(svg.getAttribute('viewBox')||'').split(/[ ,]+/).map(Number);if(vb.length!==4||!vb.every(Number.isFinite)||vb[2]<=0||vb[3]<=0)return;
    const [x,y,w,h]=vb,scene=host.querySelector('.tp-scene');scene.style.aspectRatio=w+'/'+h;
    host.querySelector('.tp-wheels').innerHTML=profile.map(([cx,cy,rx,ry],i)=>`<button type="button" class="tp-wheel ${i>=2?'tp-far':''}" data-tyre-position="${positions[i]}" aria-label="${positions[i]} tyre" aria-pressed="${chosen.includes(positions[i])}" style="left:${(cx-x)/w*100}%;top:${(cy-y)/h*100}%;width:${rx*2/w*100}%;height:${ry*2/h*100}%"><span class="tp-ring">${i>=2?'<img class="tp-tyre" src="/assets/tyre-axle-still.webp" alt="">':''}<span class="tp-check" aria-hidden="true">✓</span></span>${brand?`<span class="tp-brand">${root.VectaTyreBooking.brandLogo(brand)}</span>`:''}</button>`).join('');
    const detail=host.querySelector('.tp-car-detail');detail.src=img.src;detail.style.maskImage=detail.style.webkitMaskImage=profile.slice(2).map(([cx,cy,rx,ry])=>`radial-gradient(ellipse ${(rx+7)/w*100}% ${(ry+7)/h*100}% at ${(cx-x)/w*100}% ${(cy-y)/h*100}%,#000 65%,transparent 100%)`).join(',');
    bind();
   }catch{ /* Labelled position buttons are the safe geometry fallback. */ }
  };
  if(img.dataset.vehicleReady==='1')ready();
  else if(root.VectaVehicleImage)root.VectaVehicleImage.mount().then(ready).catch(()=>{});
 }
 root.VectaTyrePositions={positions,profiles,selection,initialise,html,mount};
})(window);

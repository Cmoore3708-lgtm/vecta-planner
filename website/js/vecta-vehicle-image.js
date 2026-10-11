(function(root) {
  const NS = 'http://www.w3.org/2000/svg';
  const colours = {BLACK:'#191b20',WHITE:'#f5f5f2',SILVER:'#bfc3c8',GREY:'#626970',GRAY:'#626970',BLUE:'#235b9a',RED:'#ac1727',GREEN:'#296145',YELLOW:'#e5ba20',ORANGE:'#d56b22',BROWN:'#77513b',BEIGE:'#c1ac88',GOLD:'#b59a50',BRONZE:'#98704c',PURPLE:'#654282',PINK:'#cb7a9b',MAROON:'#641f32',CREAM:'#e9dfc6',TURQUOISE:'#368d96'};
  // Positions verified against these supplier drawings, in SVG viewBox units.
  const platePositions = {
    // Cab-over flatbed: the body includes the load bed, so window offsets misidentify the front.
    '319011515.svgz': {x:29,y:138,width:44,height:9,skew:8},
    '319106279.svgz': {x:35.5,y:141.8,width:32,height:10,skew:8},
    '319009025.svgz': {x:26,y:141,width:45,height:11,skew:8},
    '319118141.svgz': {x:20.5,y:149,width:27,height:10,skew:12}
  };
  const sources = new Map(), images = new Map(), rendering = new Map();
  const manufacturers = ['mercedes-benz','land-rover','volkswagen','mitsubishi','vauxhall','infiniti','hyundai','renault','peugeot','citroen','porsche','nissan','toyota','suzuki','jaguar','lexus','mazda','honda','skoda','volvo','tesla','dacia','audi','ford','seat','fiat','mini','bmw','kia','mg'];
  const logos = new Map();
  function manufacturer(name) {
    const normal = String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const aliases = {'mercedes':'mercedes-benz','vw':'volkswagen','landrover':'land-rover'};
    const first=normal.split(' ')[0];if(aliases[first])return aliases[first];
    return manufacturers.find(slug=>normal===slug.replace(/-/g,' ')||normal.startsWith(slug.replace(/-/g,' ')+' '))||'';
  }
  async function logoFor(slug) {
    if(!slug)return '';
    if(!logos.has(slug)){
      const task=root.fetch('/assets/manufacturers/'+slug+'.svg',{signal:root.AbortSignal.timeout(5000)})
        .then(async response=>{if(!response.ok)throw Error('Logo unavailable');const source=await response.text();if(!source.startsWith('<svg')||!source.includes('data:image/png;base64,')||source.length>300000)throw Error('Invalid logo');const png=source.match(/href="(data:image\/png;base64,[A-Za-z0-9+/=]+)"/);if(!png)throw Error('Invalid logo image');return png[1];});
      logos.set(slug,task);task.catch(()=>logos.delete(slug));
    }
    try{return await logos.get(slug);}catch{return '';}
  }
  const renderKey='vecta_vehicle_rendered_artwork_v1';
  try { for(const [key,result] of JSON.parse(root.localStorage?.getItem(renderKey)||'[]')) {
    if(typeof key==='string'&&typeof result?.url==='string'&&result.url.startsWith('data:image/svg+xml;charset=utf-8,')&&result.url.length<250000)images.set(key,result);
    if(images.size>=32)break;
  } } catch {}
  function saveRenders(){try{const entries=[];let size=0;for(const [key,result] of [...images].reverse()){size+=result.url.length;if(size>2000000)break;entries.push([key,{url:result.url,plateAdded:result.plateAdded,recoloured:result.recoloured}]);}root.localStorage?.setItem(renderKey,JSON.stringify(entries));}catch{}}
  const normaliseReg = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0,8);
  // Customer-confirmed illustration correction; leave official MOT records untouched.
  const confirmedColours = {BD53MUD:'Black',NA63UKO:'Black'};
  function resolveColour(registration, suppliedColour) {
    const reg = normaliseReg(registration);
    try { const saved = root.localStorage?.getItem('vecta-image-colour:'+reg); if (colourHex(saved)) return saved; } catch {}
    return confirmedColours[reg] || suppliedColour || '';
  }
  function rememberColour(registration, colour) {
    if (!colourHex(colour)) return;
    try { root.localStorage?.setItem('vecta-image-colour:'+normaliseReg(registration),colour); } catch {}
  }
  const formatReg = value => /^[A-Z]{2}\d{2}[A-Z]{3}$/.test(value) ? value.slice(0,4)+' '+value.slice(4) : value;
  const colourHex = value => colours[String(value || '').trim().toUpperCase()] || '';
  const allowedTags = new Set(['svg','g','defs','path','polygon','polyline','rect','circle','ellipse','line','linearGradient','radialGradient','stop','filter','feGaussianBlur','clipPath']);
  const allowedAttrs = new Set(['id','d','points','viewBox','width','height','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','fx','fy','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','fill-rule','clip-rule','opacity','fill-opacity','stroke-opacity','transform','gradientTransform','gradientUnits','offset','stop-color','stop-opacity','filter','clip-path','stdDeviation','color-interpolation-filters','display']);
  function sanitiseSvg(source) {
    // Resolve inert Adobe namespace entities before parsing, then rebuild only drawing primitives.
    const start = String(source).indexOf('<svg'); if (start < 0) throw Error('No SVG');
    source = String(source).slice(start).replace(/&ns_([\w]+);/g,'urn:vecta-supplier:$1');
    const document = new root.DOMParser().parseFromString(source, 'image/svg+xml');
    if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') throw Error('Invalid SVG');
    function copy(node) {
      // Illustrator switch wrappers contain the drawing plus an unsafe foreignObject fallback.
      // Retain only allowlisted drawing children inside a neutral group.
      if (!allowedTags.has(node.localName) && node.localName !== 'switch') return null;
      const next = root.document.createElementNS(NS, node.localName === 'switch' ? 'g' : node.localName);
      for (const attr of node.attributes) {
        const name = attr.name, value = attr.value;
        if (allowedAttrs.has(name) && !/[<&]/.test(value) && (!/url\s*\(/i.test(value) || /^url\(#[\w.-]+\)$/.test(value))) next.setAttribute(name,value);
        if (name === 'style') for (const part of value.split(';')) {
          const colon = part.indexOf(':'), property = part.slice(0,colon).trim(), setting = part.slice(colon+1).trim();
          if (allowedAttrs.has(property) && /^(?:#[a-f\d]{3,8}|[\d.]+|none|sRGB|url\(#[\w.-]+\))$/i.test(setting)) next.setAttribute(property,setting);
        }
      }
      for (const child of node.children) { const safe = copy(child); if (safe) next.appendChild(safe); }
      return next;
    }
    return copy(document.documentElement);
  }
  function personaliseSvg(source, registration, colour, asset, logo) {
    const svg = sanitiseSvg(source), paint = svg.querySelector('[id="transparant_colour"], [id="transparent_colour"]');
    const hex = colourHex(colour);
    if (hex && paint) for (const path of paint.querySelectorAll('path, polygon')) {
      if (path.getAttribute('fill') && path.getAttribute('fill') !== 'none') path.setAttribute('fill',hex);
    }
    // Geometry comes from the actual model, rather than a screen-positioned plate.
    const host = root.document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;visibility:hidden;pointer-events:none';
    host.appendChild(svg); root.document.body.appendChild(host);
    let plateAdded = false;
    try {
      const body = paint?.getBBox(), windows = svg.querySelector('[id="windows"]')?.getBBox();
      if (registration && body?.width > 0 && windows?.width > 0) {
        const left = windows.x-body.x > body.x+body.width-windows.x-windows.width;
        const position = platePositions[asset];
        const width = position?.width ?? body.width*.21, height = position?.height ?? body.height*.095;
        const x = position?.x ?? (left ? body.x+body.width*.055 : body.x+body.width*.735);
        const y = position?.y ?? body.y+body.height*.80;
        const skew = position?.skew ?? (left ? 8 : -8);
        const plate = root.document.createElementNS(NS,'g');
        plate.setAttribute('id','vecta-front-registration');
        plate.setAttribute('transform',`translate(${x} ${y}) skewY(${skew})`);
        const rect = root.document.createElementNS(NS,'rect');
        for (const [key,value] of Object.entries({width,height,rx:height*.1,fill:'#ffffff',stroke:'#202020','stroke-width':'.5'})) rect.setAttribute(key,value);
        const text = root.document.createElementNS(NS,'text');
        for (const [key,value] of Object.entries({x:width/2,y:height*.75,fill:'#111111','font-family':'Arial, sans-serif','font-weight':'700','font-size':height*.75,'text-anchor':'middle',textLength:width*.87,lengthAdjust:'spacingAndGlyphs'})) text.setAttribute(key,value);
        text.textContent = formatReg(normaliseReg(registration));
        plate.append(rect,text); svg.appendChild(plate); plateAdded = true;
      }
    } finally { host.remove(); }
    // Keep the badge beside the car inside the same image box and print snapshot.
    const box=String(svg.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
    if(logo&&box.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[3]>0){
      const [x,y,width,height]=box,size=Math.min(width*.16,height*.3),gap=width*.02;
      svg.setAttribute('viewBox',[x-size-gap,y,width+size+gap,height].join(' '));
      const badge=root.document.createElementNS(NS,'g');badge.setAttribute('id','vecta-manufacturer-logo');
      const background=root.document.createElementNS(NS,'rect');
      for(const [k,v] of Object.entries({x:x-size-gap,y:y+(height-size)/2,width:size,height:size,rx:size*.12,fill:'#ffffff'}))background.setAttribute(k,v);
      const mark=root.document.createElementNS(NS,'image');
      for(const [k,v] of Object.entries({x:x-size-gap+size*.08,y:y+(height-size)/2+size*.08,width:size*.84,height:size*.84,href:logo,preserveAspectRatio:'xMidYMid meet'}))mark.setAttribute(k,v);
      badge.append(background,mark);svg.appendChild(badge);
    }
    return {svg:new root.XMLSerializer().serializeToString(svg),plateAdded,recoloured:!!(hex && paint)};
  }
  async function sourceFor(asset) {
    if (!sources.has(asset)) {
      const task = root.fetch('/api/haynes-image?asset='+encodeURIComponent(asset), {signal:root.AbortSignal.timeout(10000)})
        .then(async response => {if (!response.ok) throw Error('Image unavailable'); return (await response.json()).svg;});
      sources.set(asset,task); task.catch(() => sources.delete(asset));
      if (sources.size > 32) sources.delete(sources.keys().next().value);
    }
    return sources.get(asset);
  }
  function mount(scope = root.document) {
    return Promise.all(Array.from(scope.querySelectorAll('img[data-vehicle-image]')).map(async img => {
      if (img.dataset.personalising) return;
      img.dataset.personalising = '1';
      const url = img.getAttribute('src') || '';
      const match = url.match(/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/(\d+\.svgz?)$/);
      if (!match) return;
      const registration = normaliseReg(img.dataset.registration), colour = img.dataset.colour || '';
      const baseKey = match[1]+'|'+registration+'|'+colourHex(colour),brand=manufacturer(img.dataset.vehicleMake||img.dataset.vehicleName);
      let key=brand?baseKey+'|logo-v1:'+brand:baseKey;
      try {
        let result = images.get(key);
        if (!result) {
          const logo=brand?await logoFor(brand):'';
          if(brand&&!logo){key=baseKey;result=images.get(key);}
          if(!result){
          if (!rendering.has(key)) {
            const task = sourceFor(match[1]).then(source => {
              const rendered = personaliseSvg(source,registration,colour,match[1],logo);
              rendered.url = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(rendered.svg);
              images.set(key,rendered); if (images.size > 32) images.delete(images.keys().next().value);
              saveRenders(); return rendered;
            });
            rendering.set(key,task);
          }
          const task = rendering.get(key);
          try { result = await task; } finally { if (rendering.get(key) === task) rendering.delete(key); }
          }
        }
        if (!img.isConnected) return;
        img.src = result.url;
        img.dataset.personalised = String(result.plateAdded);
        img.dataset.recoloured = String(result.recoloured);
        img.alt = [colour, img.dataset.vehicleName, registration,'model illustration'].filter(Boolean).join(' ');
      } catch { delete img.dataset.personalising; /* Retain the element so a later retry can recover. */ }
    }));
  }
  root.VectaVehicleImage = {mount,personaliseSvg,sanitiseSvg,colourHex,normaliseReg,resolveColour,rememberColour,manufacturer,colourNames:Object.keys(colours).filter(name=>name!=='GRAY')};
})(typeof window === 'undefined' ? globalThis : window);

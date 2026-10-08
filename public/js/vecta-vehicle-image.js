(function(root) {
  const NS = 'http://www.w3.org/2000/svg';
  const colours = {BLACK:'#191b20',WHITE:'#f5f5f2',SILVER:'#bfc3c8',GREY:'#626970',GRAY:'#626970',BLUE:'#235b9a',RED:'#ac1727',GREEN:'#296145',YELLOW:'#e5ba20',ORANGE:'#d56b22',BROWN:'#77513b',BEIGE:'#c1ac88',GOLD:'#b59a50',BRONZE:'#98704c',PURPLE:'#654282',PINK:'#cb7a9b',MAROON:'#641f32',CREAM:'#e9dfc6',TURQUOISE:'#368d96'};
  // Positions verified against these supplier drawings, in SVG viewBox units.
  const platePositions = {
    '319106279.svgz': {x:35.5,y:141.8,width:32,height:10,skew:8},
    '319009025.svgz': {x:26,y:141,width:45,height:11,skew:8},
    '319118141.svgz': {x:20.5,y:149,width:27,height:10,skew:12}
  };
  const sources = new Map(), images = new Map();
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
    // Drop the supplier DTD/Adobe entities and rebuild only drawing primitives.
    const start = String(source).indexOf('<svg'); if (start < 0) throw Error('No SVG');
    source = String(source).slice(start).replace(/\sxmlns:[\w-]+="&[^"]*"/g,'');
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
  function personaliseSvg(source, registration, colour, asset) {
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
    scope.querySelectorAll('img[data-vehicle-image]').forEach(async img => {
      if (img.dataset.personalising) return;
      img.dataset.personalising = '1';
      const url = img.getAttribute('src') || '';
      const match = url.match(/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/(\d+\.svgz?)$/);
      if (!match) return;
      const registration = normaliseReg(img.dataset.registration), colour = img.dataset.colour || '';
      const key = match[1]+'|'+registration+'|'+colourHex(colour);
      try {
        let result = images.get(key);
        if (!result) {
          result = personaliseSvg(await sourceFor(match[1]),registration,colour,match[1]);
          result.url = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(result.svg);
          images.set(key,result); if (images.size > 32) images.delete(images.keys().next().value);
        }
        if (!img.isConnected) return;
        img.src = result.url;
        img.dataset.personalised = String(result.plateAdded);
        img.dataset.recoloured = String(result.recoloured);
        img.alt = [colour, img.dataset.vehicleName, registration,'model illustration'].filter(Boolean).join(' ');
      } catch { /* Keep the original model image; booking remains fully usable. */ }
    });
  }
  root.VectaVehicleImage = {mount,personaliseSvg,sanitiseSvg,colourHex,normaliseReg,resolveColour,rememberColour,colourNames:Object.keys(colours).filter(name=>name!=='GRAY')};
})(typeof window === 'undefined' ? globalThis : window);

/* Photo recognition is a convenience; customers must confirm visible sidewall text. */
(function (root) {
 'use strict';
 function candidates(text) {
  const found = new Set();
  // Keep separators and R mandatory: dates, DOT codes and serial numbers are not sizes.
  const pattern = /(?:^|[^A-Z0-9])(\d{3})\s*\/\s*(\d{2})\s*(?:ZR|R)\s*(\d{2})(?!\d)/gi;
  for (const match of String(text || '').matchAll(pattern)) {
   const [width, profile, rim] = match.slice(1).map(Number);
   if (width >= 125 && width <= 355 && width % 5 === 0 &&
       profile >= 20 && profile <= 85 && profile % 5 === 0 && rim >= 10 && rim <= 24) {
    found.add(width + '/' + profile + 'R' + rim);
   }
  }
  return Array.from(found);
 }
 root.VectaTyrePhoto = { candidates, mount };
 if (typeof document === 'undefined') return;
 let loader;
 function loadReader() {
  if (root.Tesseract) return Promise.resolve(root.Tesseract);
  if (!loader) loader = new Promise((resolve, reject) => {
   const script = document.createElement('script');
   script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
   script.crossOrigin = 'anonymous';
   const timer = setTimeout(() => { script.remove(); loader = null; reject(new Error('reader unavailable')); }, 25000);
   script.onload = () => { clearTimeout(timer); if (root.Tesseract) resolve(root.Tesseract); else { loader = null; reject(new Error('reader unavailable')); } };
   script.onerror = () => { clearTimeout(timer); script.remove(); loader = null; reject(new Error('reader unavailable')); };
   document.head.appendChild(script);
  });
  return loader;
 }
 function mount(host, onConfirm) {
  if (!host || host.querySelector('.tyre-photo')) return;
  const panel = document.createElement('section');
  panel.className = 'tyre-photo';
  panel.innerHTML = '<h4>Don’t know your tyre size?</h4><p>Take a close-up of the writing on the side of the tyre. Look for numbers like <strong>225/40 R18</strong>. Keep the whole size sharp, well lit and as level as possible.</p><p class="tyre-photo-hint">Photograph the tyre you want replaced. Front and rear tyres can be different sizes.</p><div class="tyre-photo-actions"><button type="button" data-photo-camera>Take a photo</button><button type="button" data-photo-upload>Choose a photo</button></div><input type="file" data-photo-camera-input accept="image/*" capture="environment" hidden><input type="file" data-photo-upload-input accept="image/*" hidden><img class="tyre-photo-preview" alt="Your tyre sidewall photograph" hidden><p data-photo-status role="status" aria-live="polite">Your photo is read on your device and is not uploaded.</p><div data-photo-results></div><button type="button" data-photo-cancel hidden>Cancel reading</button>';
  host.appendChild(panel);
  const status = panel.querySelector('[data-photo-status]'), results = panel.querySelector('[data-photo-results]');
  const preview = panel.querySelector('img'), cancel = panel.querySelector('[data-photo-cancel]');
  const inputs = Array.from(panel.querySelectorAll('input'));
  let worker = null, imageUrl = null, timer = null, generation = 0, busy = false;
  const observer = new MutationObserver(() => { if (!panel.isConnected) { stop(); observer.disconnect(); } });
  observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  function releaseImage() { if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; } }
  function stop() {
   generation++; busy = false; clearTimeout(timer);
   if (worker) { const old = worker; worker = null; Promise.resolve(old.terminate()).catch(() => {}); }
   releaseImage();
   cancel.hidden = true;
   panel.querySelectorAll('[data-photo-camera],[data-photo-upload]').forEach(button => { button.disabled = false; });
  }
  cancel.onclick = () => { stop(); results.replaceChildren(); status.textContent = 'Reading cancelled. You can enter the size manually or try another photo.'; };
  panel.querySelector('[data-photo-camera]').onclick = () => inputs[0].click();
  panel.querySelector('[data-photo-upload]').onclick = () => inputs[1].click();
  inputs.forEach(input => { input.onchange = () => { const file = input.files[0]; input.value = ''; if (file) read(file); }; });
  async function read(file) {
   stop(); results.replaceChildren(); preview.hidden = true;
   if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
    status.textContent = 'Choose an image smaller than 20 MB, or take a new photo.'; return;
   }
   const token = generation;
   busy = true; cancel.hidden = false;
   panel.querySelectorAll('[data-photo-camera],[data-photo-upload]').forEach(button => { button.disabled = true; });
   status.textContent = 'Preparing the photo reader… The first use may take a little longer.';
   timer = setTimeout(() => {
    if (token !== generation) return;
    stop(); status.textContent = 'Reading took too long. Try a clearer close-up, or enter your size manually.';
   }, 90000);
   try {
    imageUrl = URL.createObjectURL(file);
    preview.src = imageUrl;
    await new Promise((resolve, reject) => { preview.onload = resolve; preview.onerror = reject; if (preview.complete && preview.naturalWidth) resolve(); });
    if (token !== generation || !panel.isConnected) return;
    preview.hidden = false;
    const canvas = document.createElement('canvas'), scale = Math.min(1, 2000 / Math.max(preview.naturalWidth, preview.naturalHeight));
    canvas.width = Math.round(preview.naturalWidth * scale); canvas.height = Math.round(preview.naturalHeight * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(preview, 0, 0, canvas.width, canvas.height);
    const reader = await loadReader();
    if (token !== generation || !panel.isConnected) return;
    const created = await reader.createWorker('eng', 1, {
     workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
     corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
     logger: message => {
      if (token === generation && panel.isConnected && message.status === 'recognizing text')
       status.textContent = 'Reading the tyre size… ' + Math.round(message.progress * 100) + '%';
     }
    });
    if (token !== generation || !panel.isConnected) { await created.terminate(); return; }
    worker = created;
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    let response = await worker.recognize(canvas);
    let sizes = candidates(response.data.text);
    if (!sizes.length) {
     // A second pass improves contrast without substituting characters or inventing digits.
     const pixels = context.getImageData(0, 0, canvas.width, canvas.height), data = pixels.data;
     for (let i = 0; i < data.length; i += 4) {
      const grey = .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, (grey - 128) * 1.8 + 128));
     }
     context.putImageData(pixels, 0, 0);
     response = await worker.recognize(canvas);
     sizes = candidates(response.data.text);
    }
    if (token !== generation || !panel.isConnected) return;
    if (!sizes.length) {
     status.textContent = 'We couldn’t read a complete tyre size. Try a closer, sharper photo of the numbers, or enter the size manually.';
    } else {
     status.textContent = sizes.length > 1 ? 'More than one size was found. Check your tyre and select the correct size.' : 'Check that this matches the numbers on your tyre before continuing.';
     sizes.forEach(size => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'tyre-photo-confirm';
      button.textContent = 'Use ' + size + ' — matches my tyre';
      button.onclick = () => {
       if (!panel.isConnected || busy) return;
       results.replaceChildren();
       onConfirm(size);
       status.textContent = size + ' added. Check live prices when you’re ready.';
      };
      results.appendChild(button);
     });
    }
   } catch (error) {
    if (token === generation && panel.isConnected)
     status.textContent = 'We couldn’t read this photo. Try a new photo, save it as JPEG, or enter the size manually.';
   } finally {
    if (token === generation) stop();
   }
  }
 }
})(typeof window === 'undefined' ? globalThis : window);

(function(root){
 'use strict';
 const MAX=3, MAX_BYTES=300000;
 let busy=false;
 function photos(form){return form.work_photos||(form.work_photos=[]);}
 function html(form,review=false){
  if(!Array.isArray(form.job_types)||!form.job_types.includes('Other'))return '';
  const items=photos(form);
  if(review&&!items.length)return '';
  return '<section class="work-photos" aria-label="Photos of the work required"><strong>'+(review?'Your photos':'If you think it will help, upload a photo.')+'</strong>'+(review?'':'<div class="work-photo-actions"><button type="button" data-work-camera>Take a photo</button><button type="button" data-work-choose>Choose photos</button></div><input type="file" accept="image/*" capture="environment" data-work-camera-input hidden><input type="file" accept="image/*" multiple data-work-choose-input hidden>')+'<div class="work-photo-grid">'+items.map((photo,i)=>'<figure><img src="'+photo.image+'" alt="Work photo '+(i+1)+'">'+(review?'':'<button type="button" data-work-remove="'+i+'" aria-label="Remove photo '+(i+1)+'">Remove</button>')+'</figure>').join('')+'</div>'+(review?'':'<p data-work-photo-status role="status" aria-live="polite"></p>')+'</section>';
 }
 async function compress(file){
  if(!file||file.size>20*1024*1024||!(file.type.startsWith('image/')||/\.(heic|heif)$/i.test(file.name)))throw Error('Choose an image smaller than 20 MB.');
  const url=URL.createObjectURL(file);
  try{
   const image=new Image(); image.src=url;await image.decode();
   if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>60000000)throw Error('This photo is too large. Try a smaller photo.');
   const scale=Math.min(1,1440/Math.max(image.naturalWidth,image.naturalHeight));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
   for(const quality of [.85,.72,.58,.42]){const data=canvas.toDataURL('image/jpeg',quality);if(data.startsWith('data:image/jpeg;base64,')&&(data.length-23)*.75<=MAX_BYTES)return {image:data};}
   throw Error('This photo is too detailed. Try a closer photo of the problem.');
  }catch(error){if(error.name==='EncodingError')throw Error('We couldn’t open this photo. Try a JPEG, PNG or a new camera photo.');throw error;}
  finally{URL.revokeObjectURL(url);}
 }
 function mount(form,rerender,actions){
  const panel=document.querySelector('.work-photos');if(!panel)return;
  const camera=panel.querySelector('[data-work-camera-input]'),choose=panel.querySelector('[data-work-choose-input]');if(!camera)return;
  const status=panel.querySelector('[data-work-photo-status]');
  panel.querySelector('[data-work-camera]').onclick=()=>camera.click();panel.querySelector('[data-work-choose]').onclick=()=>choose.click();
  panel.querySelectorAll('[data-work-remove]').forEach(button=>button.onclick=()=>{photos(form).splice(Number(button.dataset.workRemove),1);rerender();});
  async function add(input){
   if(busy)return;
   const files=Array.from(input.files||[]);input.value='';if(!files.length)return;
   if(files.length+photos(form).length>MAX){status.textContent='You can add up to 3 photos. Remove one first or choose fewer photos.';return;}
   busy=true;if(actions)actions();status.textContent='Preparing your photos…';panel.querySelectorAll('button').forEach(button=>button.disabled=true);
   try{const added=[];for(const file of files)added.push(await compress(file));photos(form).push(...added);rerender();}
   catch(error){status.textContent=error.message||'We couldn’t open this photo. Please try another.';}
   finally{busy=false;if(actions)actions();panel.querySelectorAll('button').forEach(button=>button.disabled=false);}
  }
  camera.onchange=()=>add(camera);choose.onchange=()=>add(choose);
 }
 root.VectaWorkPhotos={html,mount,isBusy:()=>busy};
})(window);

(function(){
 'use strict';
 // Photo bytes are fetched only on demand and are never saved in planner/offline data.
 document.addEventListener('click',async function(event){
  const button=event.target.closest('[data-booking-photos]');if(!button||button.disabled)return;
  event.preventDefault();event.stopPropagation();
  let panel=button.parentElement.querySelector('[data-booking-photo-results]');
  if(!panel){panel=document.createElement('div');panel.dataset.bookingPhotoResults='';button.parentElement.append(panel);}
  button.disabled=true;panel.textContent='Loading photos…';panel.setAttribute('role','status');
  try{
   const r=await fetch('/api/website-booking?photos='+encodeURIComponent(button.dataset.bookingPhotos),{cache:'no-store',signal:AbortSignal.timeout(15000)});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to load photos.');
   panel.replaceChildren();
   if(!data.photos.length){panel.textContent='No photos were attached to this booking.';return;}
   data.photos.forEach(function(photo,i){
    if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.image))return;
    const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');
    image.src=photo.image;image.alt='Customer work photo '+(i+1);image.style.cssText='display:block;width:100%;max-height:65vh;object-fit:contain;border-radius:8px';
    caption.textContent='Photo '+(i+1);figure.style.cssText='margin:14px 0';figure.append(image,caption);panel.append(figure);
   });
   button.hidden=true;
  }catch(error){panel.textContent=error.message||'Unable to load photos. Please try again.';}
  finally{button.disabled=false;}
 });
})();

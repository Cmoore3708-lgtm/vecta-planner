(function(){
'use strict';
const form=document.getElementById('priceForm'),rows=document.getElementById('priceRows'),save=document.getElementById('savePrices'),reload=document.getElementById('reloadPrices'),status=document.getElementById('status');
let version=null,busy=false;
const labels={oil:'Interim / Oil & filter',full:'Full service',major:'Major service'};
function message(text,type=''){status.textContent=text;status.className=type;}
function lock(value){busy=value;save.disabled=value||version===null;reload.disabled=value;form.querySelectorAll('input').forEach(input=>input.disabled=value||version===null);}
function fill(prices){rows.innerHTML=prices.map((row,index)=>'<tr><th scope="row">'+row.band+'</th>'+['oil','full','major'].map(key=>'<td><label class="money"><span aria-hidden="true">£</span><input type="number" min="0.01" max="10000" step="0.01" required inputmode="decimal" data-row="'+index+'" data-price="'+key+'" aria-label="'+labels[key]+' · '+row.band+'" value="'+row[key]+'"></label></td>').join('')+'</tr>').join('');}
function stamp(value){document.getElementById('savedAt').textContent=value?'Last saved: '+new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Current default prices · no changes saved yet';}
async function request(options={}){
 const response=await fetch('/api/admin-website?guidePrices=1',{...options,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-Vecta-Website-Settings':'1'}});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Website prices could not be saved.');return data;
}
async function load(){
 lock(true);message('Loading saved website prices…');
 try{const data=await request();const prices=VectaGuidePrices.validate(data.prices);fill(prices);version=data.version;stamp(data.savedAt);message('Ready to edit. Press Save website prices to apply your changes.');}
 catch(error){message(error.message,'error');}
 finally{lock(false);}
}
form.onsubmit=async event=>{
 event.preventDefault();if(busy||version===null||!form.reportValidity())return;
 let prices;try{prices=VectaGuidePrices.defaults().map((row,index)=>({...row,...Object.fromEntries(['oil','full','major'].map(key=>[key,Number(form.querySelector('[data-row="'+index+'"][data-price="'+key+'"]').value)]))}));prices=VectaGuidePrices.validate(prices);}catch(error){message(error.message,'error');return;}
 lock(true);message('Saving website prices…');
 try{const data=await request({method:'PUT',body:JSON.stringify({prices,version})});version=data.version;stamp(data.savedAt);message('Saved. New website visits will use these guide prices when live pricing is unavailable.','success');}
 catch(error){message(error.message,'error');}
 finally{lock(false);}
};
reload.onclick=load;fill(VectaGuidePrices.defaults());void load();
})();

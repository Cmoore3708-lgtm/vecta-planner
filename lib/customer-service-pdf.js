import {parseHTML} from 'linkedom';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';

const clean=value=>String(value||'').replace(/\s+/g,' ').trim().replace(/[^\x20-\x7e\xa0-\xff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac]/g,'-');
// Render saved customer paperwork as inert text/tables. Never execute stored
// HTML, fetch its resources, or infer a passed check from an unselected circle.
export function serviceSheetSections(record){
 const {document}=parseHTML('<html><body>'+String(record.html||'').slice(0,500000)+'</body></html>');
 const sheet=document.querySelector('.servicePrint');if(!sheet)throw Error('Saved service sheet is unavailable.');
 sheet.querySelectorAll('script,style,button,iframe,object,[hidden],.ssHaynesPanel,.ssHaynesControls').forEach(node=>node.remove());
 for(const input of sheet.querySelectorAll('input,textarea,select'))input.replaceWith(document.createTextNode(input.getAttribute('value')||input.textContent||''));
 for(const cell of sheet.querySelectorAll('td,.ssFluidInline,.ssFluidRow')){
  const dots=[...cell.querySelectorAll('.ssRagDot')];
  if(dots.length){const chosen=dots.find(dot=>dot.classList.contains('selected'));const result=chosen?chosen.classList.contains('green')?'Green':chosen.classList.contains('amber')?'Amber — attention advised':'Red — attention required':'Not recorded';dots[0].replaceWith(document.createTextNode(result));dots.slice(1).forEach(dot=>dot.remove());}
 }
 for(const check of sheet.querySelectorAll('.ssCheck,.ssTickBox'))check.replaceWith(document.createTextNode(check.classList.contains('selected')||check.getAttribute('aria-checked')==='true'?' [Ticked] ':' [Not ticked] '));
 const sections=[];
 for(const section of sheet.querySelectorAll('.ssSection,.ssPreBox,.ssDueSummary,.ssInfo,.ssSignatures')){
  if(section.parentElement?.closest('.ssSection,.ssPreBox,.ssDueSummary,.ssInfo,.ssSignatures'))continue;
  const title=clean(section.querySelector('.ssTitle,.ssPreHead')?.textContent||'');
  const tableRows=[...section.querySelectorAll('tr')].map(row=>[...row.children].map(cell=>clean(cell.textContent)));
  const rows=tableRows.map(row=>row.join(' | '));
  const notes=[...section.querySelectorAll('.editable,.ssPreBody,.ssField,.ssBrakeNotes,.ssFluidInline,.ssFluidRow')].filter(node=>!node.closest('tr')&&!node.parentElement?.closest('.editable,.ssPreBody,.ssField,.ssBrakeNotes,.ssFluidInline,.ssFluidRow')).map(node=>clean(node.textContent)).filter(Boolean);
  const lines=rows.length||notes.length?[...rows,...notes]:[clean(section.textContent).replace(title,'').trim()];
  if(lines.some(Boolean))sections.push({title,lines:lines.filter(Boolean),rows:tableRows,notes:rows.length?notes:lines.filter(Boolean)});
 }
 if(!sections.length)sections.push({title:'Saved paperwork',lines:[clean(sheet.textContent)]});
 return sections;
}
export async function customerServicePdf(record){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const title=clean(record.title||'Service sheet').slice(0,85),registration=clean(record.registration).slice(0,15),rawDate=record.service_date||record.saved_at?.slice(0,10)||'',date=clean(/^\d{4}-\d{2}-\d{2}$/.test(rawDate)?rawDate.slice(8,10)+'/'+rawDate.slice(5,7)+'/'+rawDate.slice(0,4):rawDate||'Date not recorded');
 const ink=rgb(.1,.1,.1),red=rgb(.82,.08,.12),grey=rgb(.93,.93,.93),muted=rgb(.4,.4,.4);let page,y;
 pdf.setTitle('Vecta '+registration+' '+title);pdf.setAuthor('Vecta Motors');
 function wrap(text,width,size=10,face=font){const words=[];for(const word of clean(text).split(' ')){let part='';for(const c of word){if(face.widthOfTextAtSize(part+c,size)>width&&part){words.push(part);part='';}part+=c;}words.push(part);}const lines=[];let line='';for(const word of words){if(face.widthOfTextAtSize(line+(line?' ':'')+word,size)>width&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;}
 function next(){page=pdf.addPage([595.28,841.89]);page.drawRectangle({x:0,y:742,width:595.28,height:100,color:ink});page.drawText('VECTA MOTORS',{x:40,y:791,size:22,font:bold,color:rgb(1,1,1)});page.drawText('WORKSHOP RECORD',{x:41,y:769,size:9,font,color:rgb(.75,.75,.75)});page.drawRectangle({x:402,y:773,width:153,height:35,color:rgb(.96,.81,.13)});page.drawText(registration,{x:412,y:784,size:16,font:bold,color:ink});y=712;for(const line of wrap(title,515,18,bold)){page.drawText(line,{x:40,y,size:18,font:bold,color:ink});y-=24;}page.drawText(clean(record.date_label||'SERVICE DATE')+'  '+date+(record.mileage?'     MILEAGE  '+clean(record.mileage).slice(0,30):''),{x:40,y:y-2,size:9,font,color:muted});y-=30;}
 function text(value,{heading=false}={}){const size=heading?12:10,face=heading?bold:font;for(const line of wrap(value,515,size,face)){if(y<65)next();page.drawText(line,{x:40,y,size,font:face,color:heading?red:ink});y-=15;}}
 function table(rows){const columns=Math.max(...rows.map(r=>r.length));if(!columns)return;const widths=columns===1?[515]:[515*.4,...Array(columns-1).fill(515*.6/(columns-1))];
  for(let index=0;index<rows.length;index++){const row=rows[index],cells=widths.map((w,i)=>wrap(row[i]||'',w-14,9,index===0?bold:font)),height=Math.max(...cells.map(c=>c.length),1)*13+16;if(y-height<60)next();
   // Large free-text cells are rendered as flowing text rather than clipped.
   if(height>550){row.forEach((cell,i)=>text((rows[0]?.[i]||'')+': '+cell));continue;}
   if(index===0||index%2===0)page.drawRectangle({x:40,y:y-height+4,width:515,height,color:grey});
   let x=40;for(let col=0;col<columns;col++){cells[col].forEach((line,lineIndex)=>page.drawText(line,{x:x+7,y:y-10-lineIndex*13,size:9,font:index===0?bold:font,color:ink}));x+=widths[col];}
   y-=height;page.drawLine({start:{x:40,y:y+4},end:{x:555,y:y+4},thickness:.4,color:rgb(.8,.8,.8)});
  }y-=10;
 }
 next();for(const section of serviceSheetSections(record)){if(y<125)next();if(section.title){text(section.title,{heading:true});y-=5;}if(section.rows?.length)table(section.rows);for(const line of section.notes||(!section.rows?.length?section.lines:[]))text(line);y-=14;}
 pdf.getPages().forEach((p,i)=>{p.drawLine({start:{x:40,y:45},end:{x:555,y:45},thickness:.5,color:grey});p.drawText(clean(record.footer_label||'Copy of saved Vecta workshop paperwork'),{x:40,y:28,size:8,font,color:muted});p.drawText((i+1)+' / '+pdf.getPageCount(),{x:525,y:28,size:8,font,color:muted});});return pdf.save();
}

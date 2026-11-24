(function(root){
  'use strict';
  // A small, dependency-free OOXML writer. Dates are explicit text cells so
  // Excel cannot reinterpret day/month according to the computer's locale.
  var encoder=new TextEncoder();
  function xml(value){return String(value==null?'':value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]})}
  function zip(files){
    var chunks=[],central=[],offset=0,size=0;
    function header(length){var bytes=new Uint8Array(length);return {bytes:bytes,view:new DataView(bytes.buffer)}}
    Object.keys(files).forEach(function(path){
      var name=encoder.encode(path),data=encoder.encode(files[path]),crc=0xffffffff;
      data.forEach(function(byte){crc^=byte;for(var i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)});crc=(crc^0xffffffff)>>>0;
      var local=header(30),v=local.view;v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
      var entry=header(46);v=entry.view;v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(14,33,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);
      chunks.push(local.bytes,name,data);central.push(entry.bytes,name);offset+=30+name.length+data.length;size+=46+name.length;
    });
    var end=header(22),v=end.view;v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length/2,true);v.setUint16(10,central.length/2,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
    var result=new Uint8Array(offset+size+22),position=0;chunks.concat(central,[end.bytes]).forEach(function(chunk){result.set(chunk,position);position+=chunk.length});return result;
  }
  function build(month,vehicleRows,extras,totals){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Choose a valid tracker month.');
    var parts=month.split('-'),last=String(new Date(Number(parts[0]),Number(parts[1]),0).getDate()).padStart(2,'0')+'/'+parts[1];
    var label=new Date(Number(parts[0]),Number(parts[1])-1,1).toLocaleDateString('en-GB',{month:'long'})+' '+parts[0].slice(-2);
    var headers=['Date','Registration','NMUK type','Work / Item','Price ex VAT','Cost Centre'];
    function heading(title,button){
      return [{values:[title,'','','','',button],style:1},{values:headers,style:1}];
    }
    var rows=heading('Vecta Monthly Tracker ('+label+')','View by Cost Centre');
    var chargeRows=extras.map(function(line){
      return [last,'',line.section==='internal'?'Internal':'Other',line.description,Number(line.amount||0)];
    });
    vehicleRows.forEach(function(values){rows.push({values:values})});
    rows.push({values:[]});
    chargeRows.forEach(function(values){rows.push({values:values})});
    rows.push({values:[]});
    function totalRow(label,amount){return {values:['','','',label,amount],style:3}}
    rows.push(totalRow('Total:',totals.total),totalRow('Internal Vehicles:',totals.internal),totalRow('MVOS and other work:',totals.other));

    var grouped=heading('Jobs by Cost Centre ('+label+')','Back to Job List');
    var centres=new Map();
    vehicleRows.forEach(function(values){
      var code=String(values[5]||'').trim();
      if(!centres.has(code))centres.set(code,[]);
      centres.get(code).push(values);
    });
    function addGroup(title,items){
      if(!items.length)return;
      var pennies=0;
      items.forEach(function(values){
        grouped.push({values:values});
        pennies+=Math.round(Number(Number(values[4]).toFixed(2))*100);
      });
      grouped.push(totalRow(title,pennies/100),{values:[]});
    }
    Array.from(centres.keys()).filter(Boolean).sort(function(a,b){return a.localeCompare(b,'en-GB')}).forEach(function(code){
      addGroup('Cost Centre '+code+' total',centres.get(code));
    });
    addGroup('No Cost Centre total',centres.get('')||[]);
    addGroup('Monthly charges total',chargeRows);
    grouped.push(totalRow('Grand total',totals.total));
    var ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    function worksheet(sheetRows,destination,filter){
      var widths=[22,19,19,90,20,24];
      var sheet='<worksheet xmlns="'+ns+'"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
      widths.forEach(function(width,i){sheet+='<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+width+'" customWidth="1"/>'});
      sheet+='</cols><sheetData>';
      sheetRows.forEach(function(row,i){
        var lines=row.values.map(function(value,j){return Math.ceil(String(value==null?'':value).length/(widths[j]-2))});
        var height=row.style===1?28:Math.max(19,15*Math.max(0,...lines)+5);
        sheet+='<row r="'+(i+1)+'" ht="'+height+'" customHeight="1">';
        row.values.forEach(function(value,j){
          if(i===0&&j>0&&j<5)return;
          var ref=String.fromCharCode(65+j)+(i+1),numeric=j===4&&value!==''&&Number.isFinite(Number(value));
          var style=ref==='F1'?4:row.style||(numeric?2:0);
          sheet+='<c r="'+ref+'" s="'+style+'"'+(numeric?'':' t="inlineStr"')+'>'+(numeric?'<v>'+Number(value).toFixed(2)+'</v>':'<is><t xml:space="preserve">'+xml(value)+'</t></is>')+'</c>';
        });
        sheet+='</row>';
      });
      sheet+='</sheetData>'+filter+'<mergeCells count="1"><mergeCell ref="A1:E1"/></mergeCells>';
      sheet+='<hyperlinks><hyperlink ref="F1" location="'+xml("'"+destination+"'!A1")+'"/></hyperlinks>';
      return sheet+'<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
    }
    var files={};
    files['[Content_Types].xml']='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
    files['_rels/.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    files['xl/workbook.xml']='<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Monthly Tracker" sheetId="1" r:id="rId1"/><sheet name="By Cost Centre" sheetId="2" r:id="rId3"/></sheets></workbook>';
    files['xl/_rels/workbook.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>';
    files['xl/styles.xml']='<styleSheet xmlns="'+ns+'"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF25282D"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17589A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1"/><xf fontId="1" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    files['xl/worksheets/sheet1.xml']=worksheet(rows,'By Cost Centre','<autoFilter ref="A2:F'+(vehicleRows.length+2)+'"/>');
    files['xl/worksheets/sheet2.xml']=worksheet(grouped,'Monthly Tracker','');
    return {filename:'Vecta Monthly Tracker '+label+'.xlsx',bytes:zip(files),files:files};
  }
  function download(month,rows,extras,totals){var workbook=build(month,rows,extras,totals),url=URL.createObjectURL(new Blob([workbook.bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download=workbook.filename;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000)}
  root.VectaMonthlyTracker={build:build,download:download};
})(window);

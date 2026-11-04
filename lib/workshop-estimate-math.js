// Shared calculation for private job sheets. Costs are ex-VAT pence. A missing
// oil line is a monetary allowance, never a suggested grade or engine capacity.
const names={oil:'Engine oil',oil_filter:'Oil filter',air_filter:'Air filter',cabin_filter:'Cabin filter'};
export function workshopEstimate(request,actual,allowances,policy){
 const kinds=request.service==='Interim Service'?['oil','oil_filter']:request.service==='Full Service'?Object.keys(names):[];
 if(!kinds.length)throw Error('Unsupported service');
 const missingKinds=[],parts=[];let net=policy.labourNetPence[request.service];
 for(const kind of kinds){
  const found=actual.find(p=>p.kind===kind),cost=found?.costNetPence??allowances[kind];
  if(!Number.isSafeInteger(cost)||cost<1||!Number.isSafeInteger(net))throw Error('Invalid service cost');
  if(found){parts.push(found.part);}else{missingKinds.push(kind);parts.push({id:'gsf-estimate-'+kind,description:'ESTIMATED COST £'+(cost/100).toFixed(2)+' ex VAT · '+names[kind]+(kind==='oil'?' service allowance · Confirm grade and fill before ordering':' · Confirm part before ordering'),quantity:1,cost_price:cost/100,ordered:false,arrived:false});}
  net+=Math.round(cost*(10000+(kind==='oil'?policy.oilMarkupBps:policy.markupBps))/10000);
 }
 const totalPence=Math.ceil((net+Math.round(net*policy.vatBps/10000))/policy.roundUpPence)*policy.roundUpPence;
 if(!Number.isSafeInteger(totalPence)||totalPence<=0)throw Error('Invalid service price');
 return {status:'ESTIMATED',request,parts,missingKinds,totalPence};
}

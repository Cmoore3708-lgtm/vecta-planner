// Standard repair scopes, not vehicle/SKU/operation-ID mappings.
const definitions=[
 ['alternator','Alternator','Electrical','none','Starting and charging',['alternator']],
 ['starter-motor','Starter motor','Electrical','none','Starting and charging',['starter motor']],
 ['battery','Battery','Electrical','none','Starting and charging',['battery']],
 ['brake-pads','Brake pads','Brakes','axle','Brakes (Mechanical)',['brake pads']],
 ['brake-discs','Brake discs','Brakes','corner','Brakes (Mechanical)',['brake disc','brake discs']],
 ['brake-caliper','Brake caliper','Brakes','corner','Brakes (Mechanical)',['brake caliper','brake calipers']],
 ['coil-spring','Coil spring','Suspension & steering','corner','Front suspension',['coil spring','coil springs']],
 ['shock-absorber','Shock absorber','Suspension & steering','corner','Front suspension',['shock absorber','shock absorbers']],
 ['suspension-arm','Suspension arm','Suspension & steering','corner','Front suspension',['suspension wishbone arm','suspension wishbone arms','control arm','control arms','suspension link arm','suspension link arms']],
 ['track-rod-end','Track rod end','Suspension & steering','corner','Steering',['track rod end','track rod ends']],
 ['wheel-bearing','Wheel bearing','Suspension & steering','corner','Front suspension',['wheel bearing','wheel bearings','wheel hub assembly','wheel hub assemblies']],
 ['water-pump','Water pump','Engine & cooling','none','Cooling system',['coolant pump','water pump']],
 ['thermostat','Thermostat','Engine & cooling','none','Cooling system',['thermostat']],
 ['radiator','Radiator','Engine & cooling','none','Cooling system',['radiator']],
 ['auxiliary-belt','Auxiliary drive belt','Engine & cooling','none','Engine assembly',['ancillary drive belt','auxiliary drive belt']],
 ['clutch-kit','Clutch kit','Transmission','none','Manual transmission',['clutch assembly']],
 ['drive-shaft','Drive shaft','Transmission','corner','Drivetrain',['drive shaft','drive shafts']],
 ['oil-filter','Oil filter','Filters','none','Lubrication system',['oil filter']],
 ['air-filter','Air filter','Filters','none','Air inlet system',['air filter']],
 ['cabin-filter','Cabin / pollen filter','Filters','none','Interior',['cabin filter','pollen filter','interior ventilation filter']],
 ['fuel-filter','Fuel filter','Filters','none','Fuel system',['fuel filter']]
];
export const REPAIR_OPERATIONS=Object.freeze(definitions.map(([id,label,group,position,section,nouns])=>Object.freeze({id,label,group,position,section,nouns:Object.freeze(nouns)})));
export const repairOperation=id=>REPAIR_OPERATIONS.find(row=>row.id===id)||null;
const fail=code=>{throw Object.assign(Error(code),{code});};
export function structuredRepairSelection(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('INVALID_REQUEST');
 const definition=repairOperation(raw.partId);if(!definition)fail('UNSUPPORTED_OPERATION');
 const quantity=raw.quantity,axle=raw.axle||'',side=raw.side||'';
 if(!Number.isInteger(quantity)||quantity<1||quantity>20||!['','front','rear'].includes(axle)||!['','left','right','both'].includes(side))fail('INVALID_REQUEST');
 if(definition.position==='none'&&(axle||side||quantity!==1))fail('REVIEW_REQUIRED');
 if(definition.position==='axle'&&(!axle||side||quantity!==1))fail('INVALID_REQUEST');
 if(definition.position==='corner'&&(!axle||!side||quantity!==(side==='both'?2:1)))fail('INVALID_REQUEST');
 return {partId:definition.id,quantity,axle,side};
}
export function repairSelectionLabel(raw){const s=structuredRepairSelection(raw),d=repairOperation(s.partId);return ['Supply and fit',s.side==='both'?'both':'',s.axle,s.side==='both'?'':s.side,d.label.toLowerCase()].filter(Boolean).join(' ');}

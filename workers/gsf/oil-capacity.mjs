// Manufacturer capacities are separate from GSF bottle sizes and price evidence.
// Reviewed from Chris's Haynes Lubricants and Fluids screenshot, 28 October 2026.
const reviewed=[{
 registration:'G4WPC',typeId:'t_619041753',source:'HaynesPro: Engine sump, including filter',
 engine:'Defender (L663) D350 (3.0 TD6 MHEV) (DT306), 2024 onwards',
 requiredMl:8800,includingFilter:true,reviewedAt:'2026-10-28',
 matches:text=>/\bLand Rover Defender\b/i.test(text)&&/\bD350\b/i.test(text)&&/\b3\.0\s*\(2996cc\)/i.test(text)&&/\bDiesel\b/i.test(text)
}];
export function oilFillEvidence(capture,registration){
 if(!capture?.selectedRegistration||capture.registration!==registration||capture.truncated)return null;
 const text=String(capture.visibleText||'');
 const progress=text.match(/\bProgress\s+0(?:\.0+)?\s*L\s*\/\s*(\d+(?:\.\d+)?)\s*L\b/i);
 if(progress){const requiredMl=Math.round(Number(progress[1])*1000);if(requiredMl>0&&requiredMl<=30000)return {requiredMl,source:'GSF selected vehicle oil fill',includingFilter:true};return null;}
 const identity=text.split(' Copy VIN')[0];
 const row=reviewed.find(row=>row.registration===registration&&row.includingFilter&&row.matches(identity));
 if(!row)return null;
 const {matches,...evidence}=row;return {...evidence};
}

// Manufacturer capacities are separate from GSF bottle sizes and price evidence.
// Reviewed from Chris's Haynes Lubricants and Fluids screenshot, 28 October 2026.
const reviewed=[{
 registration:'CM14KEL',typeId:'t_619108899',source:'HaynesPro: Engine sump, including filter',
 engine:'NISSAN Qashqai (J12) 1.5 e-Power (KR15DDT), 2023 onwards',
 requiredMl:5100,includingFilter:true,reviewedAt:'2026-10-29',evidenceFetchedAt:'2026-10-14T14:00:46.521Z',
 // Stored manufacturer result has twelve preferred/alternative lubricant rows,
 // all agreeing on this fill. Require the live supplier identity as well as reg.
 matches:text=>/\bNissan Qashqai\b/i.test(text)&&/\b1\.5\b/.test(text)&&/\be[ -]?Power\b/i.test(text)&&/\bPetrol\b/i.test(text)
},{
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
 const liveIdentity=identity.split(' Clear ')[1]?.replace(/(?:\s+\d{2}\/\d{2}\/\d{2})+$/,'').trim();
 const bound=manufacturerBindings.find(row=>row.registration===registration&&row.identity===liveIdentity);
 if(bound)return {...bound};
 const row=reviewed.find(row=>row.registration===registration&&row.includingFilter&&row.matches(identity));
 if(!row)return null;
 const {matches,...evidence}=row;return {...evidence};
}

// Explicit saved-cohort bindings to manufacturer refill tables, including filter.
// Never a model-name-only or engine-size-only fallback.
const manufacturerBindings=[
  {
    "registration": "J8LGH",
    "identity": "Nissan Juke DIG-T 114 Start/Stop N-Connecta 1.0 (999cc) Petrol Manual 5 doors",
    "engineCode": "HR10DDT",
    "requiredMl": 4100,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/juke/0f16/e1/2024/capacities-and-recommended-fluids-lubricants-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OE75TXP",
    "identity": "Nissan Qashqai 1.3 DIG-T 160 MHEV 12v XTronic CVT Auto Start/Stop N-Connecta 1.3 (1332cc) Petrol/Hybrid Electric CVT 5 doors",
    "engineCode": "HR13DDT",
    "requiredMl": 5400,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqai/0j12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OV75FSX",
    "identity": "Nissan Qashqai Hybrid HEV 1.5h 190 e-Power HEV CVT Auto Start/Stop Tekna 1.5 (1497cc) Petrol/Hybrid Electric CVT 5 doors",
    "engineCode": "KR15DDT",
    "requiredMl": 5100,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqaiepower/hj12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OW24UFH",
    "identity": "Nissan Qashqai Hybrid HEV 1.5h 190 e-Power HEV CVT Auto Start/Stop N-Connecta 1.5 (1497cc) Petrol/Hybrid Electric CVT 5 doors",
    "engineCode": "KR15DDT",
    "requiredMl": 5100,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqaiepower/hj12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OW24UFL",
    "identity": "Nissan Qashqai 1.3 DIG-T 160 MHEV 12v Start/Stop N-Connecta 1.3 (1332cc) Petrol/Hybrid Electric Manual 5 doors",
    "engineCode": "HR13DDT",
    "requiredMl": 5400,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqai/0j12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OW24UFM",
    "identity": "Nissan Qashqai 1.3 DIG-T 160 MHEV 12v XTronic CVT Auto Start/Stop Tekna+ 1.3 (1332cc) Petrol/Hybrid Electric CVT 5 doors",
    "engineCode": "HR13DDT",
    "requiredMl": 5400,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqai/0j12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OW24UFR",
    "identity": "Nissan Qashqai Hybrid HEV 1.5h 190 e-Power HEV CVT Auto Start/Stop Tekna 1.5 (1497cc) Petrol/Hybrid Electric CVT 5 doors",
    "engineCode": "KR15DDT",
    "requiredMl": 5100,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqaiepower/hj12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OW26DXM",
    "identity": "Nissan Qashqai 1.3 DIG-T 160 MHEV 12v XTronic CVT Auto Start/Stop Tekna+ 1.3 (1332cc) Petrol/Hybrid Electric CVT 5 doors",
    "engineCode": "HR13DDT",
    "requiredMl": 5400,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqai/0j12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OW26YMA",
    "identity": "Nissan Qashqai 1.3 DIG-T 160 MHEV 12v Start/Stop Acenta Premium 1.3 (1332cc) Petrol/Hybrid Electric Manual 5 doors",
    "engineCode": "HR13DDT",
    "requiredMl": 5400,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqai/0j12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OW75HZM",
    "identity": "Nissan Qashqai Hybrid HEV 1.5h 190 e-Power HEV CVT Auto Start/Stop Acenta Premium 1.5 (1497cc) Petrol/Hybrid Electric CVT 5 doors",
    "engineCode": "KR15DDT",
    "requiredMl": 5100,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqaiepower/hj12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OX26LXA",
    "identity": "Nissan Qashqai 1.3 DIG-T 160 MHEV 12v Start/Stop N-Design 1.3 (1332cc) Petrol/Hybrid Electric Manual 5 doors",
    "engineCode": "HR13DDT",
    "requiredMl": 5400,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqai/0j12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OX75MWA",
    "identity": "Nissan Qashqai 1.3 DIG-T 160 MHEV 12v XTronic CVT Auto Start/Stop Tekna 1.3 (1332cc) Petrol/Hybrid Electric CVT 5 doors",
    "engineCode": "HR13DDT",
    "requiredMl": 5400,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqai/0j12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  },
  {
    "registration": "OY75KKO",
    "identity": "Nissan Qashqai 1.3 DIG-T 160 MHEV 12v XTronic CVT Auto Start/Stop Tekna+ 1.3 (1332cc) Petrol/Hybrid Electric CVT 5 doors",
    "engineCode": "HR13DDT",
    "requiredMl": 5400,
    "includingFilter": true,
    "source": "https://www.nissan.co.uk/owners/car-repair/car-owner-manual/manuals/iom/qashqai/0j12/e1/2024/recommended-fluids-lubricants-and-capacities-1.shtml",
    "reviewedAt": "2026-10-30"
  }
];

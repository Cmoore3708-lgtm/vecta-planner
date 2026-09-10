(function(root){
  'use strict';

  function maintenanceCategory(value){
    var text=String(value||'').toLowerCase();
    if(/six[- ]?month|6[- ]?month|safety check/.test(text))return 'safety';
    if(/\bmot\b/.test(text))return 'mot';
    if(/\btax\b|road tax/.test(text))return 'tax';
    if(/service/.test(text)&&!/on[- ]?site/.test(text))return 'service';
    return text.trim();
  }

  function maintenanceKind(plan){
    var text=String(plan&&plan.type||'').toLowerCase();
    if(text.indexOf('mot')>-1)return 'mot';
    if(text.indexOf('tax')>-1)return 'tax';
    if(text.indexOf('safety')>-1||text.indexOf('6 month')>-1||text.indexOf('six-month')>-1)return 'safety';
    if(text.indexOf('service')>-1)return 'service';
    return text||String(plan&&plan.id||'maintenance');
  }

  function isActiveVehicle(vehicle){
    return !!vehicle&&String(vehicle.status||'Active').trim().toLowerCase()!=='archived';
  }

  root.VectaFleetRules=Object.freeze({
    maintenanceCategory:maintenanceCategory,
    maintenanceKind:maintenanceKind,
    isActiveVehicle:isActiveVehicle
  });
})(typeof window!=='undefined'?window:globalThis);

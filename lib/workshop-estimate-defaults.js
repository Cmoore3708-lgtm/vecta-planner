import {FILTER_ALLOWANCES} from './service-guide-costs.js';
// A net oil allowance for one service, based on the 5L pack on the 4 Nov job
// sheet. It is not a claim about the oil grade or the vehicle's actual fill.
export const workshopAllowances={oil:4341,...FILTER_ALLOWANCES};
// Only used when the authenticated pricing service is unreachable.
export const offlineWorkshopPolicy={markupBps:5000,oilMarkupBps:3000,vatBps:2000,roundUpPence:500,labourNetPence:{'Interim Service':3000,'Full Service':6000}};

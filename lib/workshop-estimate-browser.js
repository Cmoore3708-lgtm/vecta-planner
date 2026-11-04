import {workshopEstimate} from './workshop-estimate-math.js';
import {workshopAllowances,offlineWorkshopPolicy} from './workshop-estimate-defaults.js';
window.vectaOfflineServiceEstimate=request=>workshopEstimate(request,[],workshopAllowances,offlineWorkshopPolicy);

// Record a bounded error code, never the raw browser message (may contain URLs).
export function repairBrowserReason(error){
 const code=error?.code||error?.message;
 if(['LOGIN_REQUIRED','SETTINGS_REQUIRED','LABOUR_REVIEW_REQUIRED','REVIEW_REQUIRED','GSF_MORE_DID_NOT_LOAD','GSF_MORE_LIMIT'].includes(code))return code;
 const message=String(error?.message||'');
 if(/profile.*in use|ProcessSingleton/i.test(message))return 'TEST_PROFILE_ALREADY_OPEN';
 if(/page, context or browser has been closed|target.*closed|page.*closed/i.test(message))return 'BROWSER_WINDOW_CLOSED';
 if(/Execution context was destroyed|Cannot find context/i.test(message))return 'DOCUMENT_CHANGED';
 if(/net::ERR_ABORTED|navigation.*interrupted/i.test(message))return 'NAVIGATION_INTERRUPTED';
 if(/unsafe-eval|content security policy|refused to evaluate/i.test(message))return 'SCRIPT_POLICY';
 if(/net::ERR_/i.test(message))return 'NETWORK_ERROR';
 return error?.name==='TimeoutError'?'PAGE_TIMEOUT':'BROWSER_ERROR';
}

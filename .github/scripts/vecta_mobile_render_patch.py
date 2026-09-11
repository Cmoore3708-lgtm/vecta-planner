from pathlib import Path

path = Path("index.html")
source = path.read_text(encoding="utf-8")

unsafe = '<div class="foot">Generated from the currently selected Fleet Manager tab and filters.</div><script>window.onload=function(){setTimeout(function(){window.print()},150)}<\\/script></body></html>\';'
safe = '<div class="foot">Generated from the currently selected Fleet Manager tab and filters.</div></body></html>\';'
old_print = "w.document.write(html);w.document.close();w.focus()}catch(err)"
new_print = "w.document.write(html);w.document.close();w.focus();setTimeout(function(){try{w.print()}catch(e){}},150)}catch(err)"

if source.count(unsafe) == 1:
    source = source.replace(unsafe, safe, 1)
elif '<script>window.onload=function(){setTimeout(function(){window.print()' in source:
    raise SystemExit("Unexpected unsafe nested print-script shape")

if source.count(old_print) == 1:
    source = source.replace(old_print, new_print, 1)
elif new_print not in source:
    raise SystemExit("Safe Fleet print trigger missing")

anchor = '  <!-- VECTA V320: combined Service + MOT completion asks whether MOT was actually completed; No keeps MOT outstanding -->'
bootstrap = "  <!-- VECTA V339: recover clients trapped behind a stale service worker before the main app runs. -->\n  <script>\n  (function(){\n    if(!('serviceWorker' in navigator))return;\n    var reloaded=false;\n    navigator.serviceWorker.addEventListener('controllerchange',function(){\n      if(reloaded)return;\n      reloaded=true;\n      try{\n        if(sessionStorage.getItem('vecta-v339-sw-reload')==='1')return;\n        sessionStorage.setItem('vecta-v339-sw-reload','1');\n      }catch(_e){}\n      location.reload();\n    });\n    navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'})\n      .then(function(reg){return reg.update()})\n      .catch(function(e){console.warn('Early offline repair update skipped',e)});\n  })();\n  </script>\n"
if 'vecta-v339-sw-reload' not in source:
    if source.count(anchor) != 1:
        raise SystemExit(f"Expected one early recovery anchor, found {source.count(anchor)}")
    source = source.replace(anchor, bootstrap + anchor, 1)

if '<script>window.onload=function(){setTimeout(function(){window.print()' in source:
    raise SystemExit("Unsafe nested print script remains")
if "setTimeout(function(){try{w.print()}catch(e){}},150)" not in source:
    raise SystemExit("Safe parent-window print trigger missing")
if 'vecta-v339-sw-reload' not in source:
    raise SystemExit("Early stale-worker recovery missing")

path.write_text(source, encoding="utf-8")

from pathlib import Path

path = Path("index.html")
source = path.read_text(encoding="utf-8")

unsafe = '<div class="foot">Generated from the currently selected Fleet Manager tab and filters.</div><script>window.onload=function(){setTimeout(function(){window.print()},150)}<\\/script></body></html>\';'
safe = '<div class="foot">Generated from the currently selected Fleet Manager tab and filters.</div></body></html>\';'

old_print = "w.document.write(html);w.document.close();w.focus()}catch(err)"
new_print = "w.document.write(html);w.document.close();w.focus();setTimeout(function(){try{w.print()}catch(e){}},150)}catch(err)"

if source.count(unsafe) != 1:
    raise SystemExit(f"Expected exactly one unsafe embedded print script, found {source.count(unsafe)}")
if source.count(old_print) != 1:
    raise SystemExit(f"Expected exactly one Fleet print close sequence, found {source.count(old_print)}")

source = source.replace(unsafe, safe, 1).replace(old_print, new_print, 1)

if '<script>window.onload=function(){setTimeout(function(){window.print()' in source:
    raise SystemExit("Unsafe nested print script remains")
if "setTimeout(function(){try{w.print()}catch(e){}},150)" not in source:
    raise SystemExit("Safe parent-window print trigger missing")

path.write_text(source, encoding="utf-8")

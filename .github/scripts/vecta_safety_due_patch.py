from pathlib import Path

path = Path("index.html")
text = path.read_text(encoding="utf-8")
old = "if(category==='safety'&&kind==='safety')addDate(rec.saved_at||rec.created_at);"
new = "if(category==='safety'&&kind==='safety'){var recordJobId=String(rec.job_id||''),linkedSafetyJob=(app.jobs||[]).find(function(j){return j&&String(j.id)===recordJobId;});if(linkedSafetyJob&&completedJobCanUpdateFleet(linkedSafetyJob))addDate(completedJobDateForFleet(linkedSafetyJob)||linkedSafetyJob.booking_date);}"
if new in text:
    print("Booked safety-paperwork rule already installed")
    raise SystemExit(0)
if text.count(old) != 1:
    raise SystemExit(f"Expected one unsafe safety-paperwork rule, found {text.count(old)}")
text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
assert new in path.read_text(encoding="utf-8")
print("Booked safety-paperwork rule installed")

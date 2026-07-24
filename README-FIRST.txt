Vecta Planner consolidated v7

Fixes in this release:
- Fleet maintenance Complete now marks the item complete immediately, with no completion-date prompt.
- The existing maintenance due date is used as the completion date.
- The next due date rolls forward by the plan interval from the existing due date.
- Due dates remain editable with Save due date.
- A render re-entry guard prevents the Maximum call stack size exceeded fault from disabling the page.

Deploy the contents of this folder to the repository root, redeploy on Vercel, then hard refresh once (Ctrl+F5).

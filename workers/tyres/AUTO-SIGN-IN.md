# Automatic supplier sign-in

This update must be installed on the workshop PC; deploying the website does not update the local worker.

1. Close the existing tyre worker and its separate supplier Edge window. Leave Haynes running.
2. Update the `workers/tyres` files from this amendment. Keep the existing package and pairing.
3. In that folder, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\save-login.ps1` as the same Windows user that runs the worker. Enter the supplier username and password into the black setup window (password input is hidden), never into chat.
4. Start the usual `START-LIVE-TYRE-PRICES.cmd` launcher.

The login is stored in `%LOCALAPPDATA%\VectaTyres\supplier-login.xml`, with the password encrypted by Windows DPAPI for the current Windows user on this PC. It is not stored in GitHub, the website, or Supabase. The worker decrypts it in memory only when needed, using a captured local child-process pipe. Do not run `read-login.ps1` manually or include its output in diagnostics.

The worker selects Remember me when signing in, checks the session every minute and also recovers on a customer lookup. Sign-in attempts are limited to one per five minutes. Missing credentials preserve manual sign-in. Incorrect credentials, changed login controls or additional verification can still require manual intervention. Existing Vecta/Sellout/VAT/multiplier checks remain mandatory before prices are returned.

Remove `supplier-login.xml` to disable automatic sign-in. Run `save-login.ps1` again if the supplier password changes.

Verification: run `node --test workers/tyres/session-recovery.test.mjs`. Live Windows verification still required: save credentials, start the worker, perform a price search, sign out of the supplier without closing the worker, confirm automatic recovery and a fresh price result. Do not declare it installed or working live until that succeeds.

Signing in independently on a phone does not share the worker's session. Phone control would require a separately configured remote-access application on the PC.

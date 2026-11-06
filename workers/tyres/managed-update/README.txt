VECTA | Managed tyre connection repair

1. Extract the ZIP on the workshop PC. Run CHECK-FIRST.cmd using the usual
   Windows account. This prints the active release, the tyre reader count,
   the last recorded result and whether this launcher uses saved ESP sign-in.
   It does not change the installation or display any passwords.
2. If the managed reader is missing, try Start all in Workshop Connections
   and check one tyre price. If it pauses for Enter or asks for ESP repeatedly,
   note the diagnostic output before installing.
3. To install, choose Stop safely in Workshop Connections and wait for all
   three readers to stop. Close the panel, then run APPLY-REPAIR.cmd.
   The panel reopens. The update uses the installed ESP catalogue reader
   and preserves the existing Haynes and GSF files, profiles and pairing.
4. If ESP requests verification, complete it in the tyre Edge window. To opt
   into automatic supplier sign-in, run SAVE-ESP-LOGIN.cmd under the same
   Windows account, then safely restart the managed reader. Do not send login
   information to anyone. Use just the managed launcher.
5. Look up 205/55R16 on the website, check the prices against ESP, then test
   another size for an uncached result. No tyres are ordered. A successful
   match proves the connection. After Windows next restarts, sign into the
   normal account, check for one reader and repeat an uncached lookup.

Rollback: Stop safely, then Restore previous in Workshop Connections.
If this update created VECTA Workshop Connections.lnk in the current Windows
user's Startup folder, deleting that shortcut undoes the sign-in startup.
An unrecognised installation is left in place. In that case share only the
CHECK-FIRST window output so the active version can be identified.

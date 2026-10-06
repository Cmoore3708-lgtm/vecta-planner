# Haynes Test Windows startup

Test only. Existing DVSA lookup and advisory choices are unchanged.

On the chosen worker PC, sign into Haynes with `workers/haynes/windows-login.cmd`, then pair with `windows-connect.cmd` if that PC has not already been paired. Tokens and Edge sessions belong to the current Windows account and must not be copied from another PC.

After a successful lookup, stop the worker with Ctrl+C and close its window. Run `windows-startup.cmd` from an extracted download. It installs a fixed worker copy under `%LOCALAPPDATA%\VectaHaynes\app` and creates a shortcut in the current user's Windows Startup folder. It requires neither administrator access nor a saved Windows password. The existing encrypted pairing token and Edge profile remain in `%LOCALAPPDATA%\VectaHaynes`.

At the next Windows sign-in the visible worker window opens automatically. Leave the PC switched on, signed in, awake and online. The startup worker retries after a connection failure. A Windows mutex prevents two helpers from running the worker at once. Closing the window stops it. An expired Haynes login still requires running the login helper manually, with the worker stopped.

To disable automatic startup run `windows-stop-startup.cmd`, then close any running worker window. This removes only the startup shortcut.

Validation on 6 October 2026: the live Test API matched FX69XWU and the user confirmed its image, engine code and model range were displayed. A second vehicle also matched, with about six seconds to display Haynes details. Automated form checks simulate Haynes connection failure, unknown vehicle and ambiguous vehicle while retaining DVSA data and advisories. The startup installer must still be verified on the user's Windows PC; Linux tests cannot prove Windows startup or DPAPI operation. Main is unchanged.

"""Build the Windows update for Haynes sign-in and tyre worker recovery."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys

source = Path(__file__).resolve().parent
worker = source.parents[1] / "workers" / "haynes"
with ZipFile(sys.argv[1], "w", compression=ZIP_DEFLATED) as archive:
    for name in ("install.mjs", "managed-repair.mjs", "install.ps1", "START-HERE.cmd", "SAVE-LOGIN.cmd"):
        archive.write(source / name, name)
    for name in ("dom.mjs", "vehicle-browser.mjs", "service-browser.mjs", "session-recovery.mjs",
                 "saved-login.mjs", "save-login.ps1"):
        archive.write(worker / name, "workers/haynes/" + name)
    for name in ("control/recovery-status.mjs", "tyres/open-supplier.mjs"):
        archive.write(worker.parent / name, "workers/" + name)
    archive.writestr("READ-ME.txt", (
        "This revision repairs the Tyres.json restart failure and the ESP startup timeout.\r\n"
        "On the workshop PC, use Stop safely in Workshop Connections. Wait for all workers to stop, then close the panel.\r\n"
        "Extract All and run START-HERE.cmd. The installer asks for HaynesPro credentials only if they have not already been saved.\r\n"
        "Workshop Connections reopens. If the workers are stopped, click Start.\r\n"
        "Use SAVE-LOGIN.cmd if your HaynesPro password changes. Verification prompts need an operator.\r\n"
        "To roll back, use Stop safely and Restore previous in Workshop Connections.\r\n"
    ))

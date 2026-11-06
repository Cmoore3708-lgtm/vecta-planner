"""Build the Windows update using only the Haynes changes and the existing release manager."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys

source = Path(__file__).resolve().parent
worker = source.parents[1] / "workers" / "haynes"
with ZipFile(sys.argv[1], "w", compression=ZIP_DEFLATED) as archive:
    for name in ("install.mjs", "install.ps1", "START-HERE.cmd", "SAVE-LOGIN.cmd"):
        archive.write(source / name, name)
    for name in ("dom.mjs", "vehicle-browser.mjs", "service-browser.mjs", "session-recovery.mjs",
                 "saved-login.mjs", "save-login.ps1"):
        archive.write(worker / name, "workers/haynes/" + name)
    archive.writestr("READ-ME.txt", (
        "On the workshop PC, use Stop safely in Workshop Connections. Wait for all workers to stop, then close the panel.\r\n"
        "Extract All and run START-HERE.cmd. Enter your HaynesPro username and password in the local prompt once.\r\n"
        "Workshop Connections reopens. If the workers are stopped, click Start.\r\n"
        "Use SAVE-LOGIN.cmd if your HaynesPro password changes. Verification prompts need an operator.\r\n"
        "To roll back, use Stop safely and Restore previous in Workshop Connections.\r\n"
    ))

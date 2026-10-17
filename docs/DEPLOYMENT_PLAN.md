# Deployment Plan

Deploy Y9K to a Raspberry Pi with SD card storage, and publish it at the root of a new custom domain through Cloudflare Tunnel.

Remaining application scope and its implementation order are recorded in [V1_COMPLETION_PLAN.md](V1_COMPLETION_PLAN.md). The latest scope is trusted-user V1 with application upload limits, expanded validation, and resizing deferred to V2. Before deployment, complete the remaining storage, doorway rules, logging, fallback hallway image links (no hallway uploads), and admin work in the checklist.

## Agreed setup

- Use the simplest suitable headless OS: Raspberry Pi OS Lite, subject to confirming the board model.
- Run Apache and PHP natively, with SQLite, GMP, and the PHP extensions required by the application.
- Store the database and uploaded images on the SD card initially.
- Start with an empty database and no existing uploaded content.
- Keep tracking the project in GitHub and perform updates manually over SSH.
- Allow public uploads and deletion without login or authentication, as requested.
- Keep existing upload handling for V1; application upload limits and resizing are deferred to V2 by user decision.
- Expect low usage, with availability dependent on the Pi's power and internet connection.
- Use a dashboard-managed Cloudflare Tunnel, with the web server and tunnel starting automatically at boot.
- Use the existing Cloudflare account and buy a new domain, possibly `y9k.club`; the domain is not yet selected or purchased.
- Serve the project at the root domain.
- Include a simple manual backup procedure for the database and images alongside the update procedure.

## Details to resolve later

- Confirm the exact board model. The reported label, "Zero W Max 64," does not establish whether this is an original Zero W or a Zero 2 W.
- Confirm the compatible OS architecture and whether a current `cloudflared` build can run on the board. Original Zero W compatibility may require changing the deployment approach.
- Confirm networking, SD card capacity, and power supply.
- Select and purchase the domain, then connect its DNS to Cloudflare.
- For V2, choose application upload size/dimension limits or resizing behavior.
- Choose a backup destination outside the Pi, such as the development Mac.

## Steps and estimates

Line counts include configuration files and scripts. Most of the work is setup rather than application code. Commands entered in a terminal are not counted as code unless saved in a script.

| Step | Layperson description | Estimated lines written or changed | Hands-on time |
| --- | --- | ---: | ---: |
| 1 | Identify the Pi model and check which OS and tunnel software it can run. | 0 | 10–20 minutes |
| 2 | Install Raspberry Pi OS Lite on the SD card and configure networking and SSH access. | 0 | 20–40 minutes |
| 3 | Connect over SSH, update the Pi, and install PHP, Apache, SQLite support, GMP, and Git. | 0 | 20–40 minutes |
| 4 | Copy the project from GitHub and create writable folders for a fresh database and uploaded images. | 0–10 | 10–20 minutes |
| 5 | Configure Apache to serve the public folder and make room addresses such as `/tom` work. | 15–35 | 20–40 minutes |
| 6 (V2) | Add the chosen image size limits or resizing behavior; deferred from V1. | 10–60 | 30–90 minutes |
| 7 | Buy the domain and connect its DNS to the existing Cloudflare account. | 0 | 10–25 minutes |
| 8 | Install Cloudflare Tunnel, connect the root domain to the site, and configure automatic startup. | 0–15 | 20–40 minutes |
| 9 | Write a small repeatable procedure for updating the site from GitHub and backing up its content. | 15–40 | 20–40 minutes |
| 10 | Test browsing, uploads, deletion, HTTPS, and recovery after rebooting the Pi. | 0–20 | 20–45 minutes |

**Total: approximately 3–7 hours of hands-on work and 50–180 lines of code/configuration.** A straightforward setup should take around **4–5 hours**. Simple upload limits will be quicker to implement than image resizing.

Domain activation may add waiting time outside the hands-on estimate. Hardware or tunnel compatibility problems are not included; if a current tunnel binary cannot run on the board, revise the approach and estimate before proceeding.

## Deployment requirements

- Serve only `public/` as the web root; keep application source and the SQLite database outside it.
- Configure Apache routing so room URLs reach `public/index.php` while existing public files are served normally.
- Keep persistent database and image files intact during code updates, and provide a way to return to the previous code version.
- Back up SQLite using a consistent snapshot and preserve its corresponding uploaded images; document how to restore both.
- Verify the effective PHP/web-server/Cloudflare request ceilings; adding application limits is deferred to V2.
- Verify the public site and its ability to recover after a reboot before considering deployment complete.

## References

- [Cloudflare Tunnel downloads](https://developers.cloudflare.com/tunnel/downloads/)
- [Create a dashboard-managed Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)
- [Cloudflare maximum upload size](https://developers.cloudflare.com/network/maximum-upload-size/)

This is a planning estimate, not an installation runbook. Exact package names, configuration, and commands will be determined after hardware compatibility is confirmed.

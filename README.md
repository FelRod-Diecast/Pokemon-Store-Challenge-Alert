# Pokémon Store Challenge Alert

A separate Chrome/Edge Manifest V3 extension that watches open retailer tabs for recognizable CAPTCHA, robot-check, and human-verification prompts. When detected, it sends a desktop notification and lets you jump to the tab to complete the challenge yourself.

## Supported pages

- Target: `target.com`
- Costco: `costco.com`
- Sam's Club: `samsclub.com`

## Install in Chrome or Edge

1. Download or clone this repository to your computer.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the folder containing `manifest.json`.
5. Open a supported retailer page in a tab. The extension checks the rendered page for common challenge signals.
6. Click the extension icon and choose **Test desktop alert** to confirm notifications work. Allow operating-system notifications for your browser if prompted.

## How alerts work

- A recognized challenge triggers a desktop notification naming the retailer.
- Clicking the notification focuses the retailer tab.
- Complete the challenge manually in the retailer's page.
- Open the extension popup and choose **I handled it** to mark that alert acknowledged.
- Use **Refresh** to review recent alerts.

## Important limitations

- This is a challenge notifier, not a stock scanner. It does not currently search product catalogs or verify inventory.
- Detection is best-effort. Retailers may change page text, render challenges in ways the extension cannot inspect, or block the session.
- It only checks retailer tabs you open; it does not run while the browser/computer is closed.
- The extension does not solve, bypass, or automate CAPTCHA challenges, and does not automate checkout.
- A “marked resumed” status is an acknowledgement from you, not proof that the retailer has restored access.
- Use a reasonable scan cadence and comply with retailer terms.

## Permissions

The extension uses notifications, local extension storage, tabs, and host access only for the three listed retailer domains. It does not send page data to an external server.

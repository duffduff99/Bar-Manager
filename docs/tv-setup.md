# Bar TV setup

How to get the `/tv` display onto a television, and how to set up a Raspberry Pi so it can be
powered from the TV and switched off with it without damaging its SD card.

Throughout, `https://bar.example.com` stands for your own address for the app.

- [What the TV page shows](#what-the-tv-page-shows)
- [Choosing how to show it](#choosing-how-to-show-it)
- [Network requirements](#network-requirements)
- [Raspberry Pi kiosk](#raspberry-pi-kiosk)
- [Making the Pi read-only](#making-the-pi-read-only)
- [Changing things later](#changing-things-later)
- [Troubleshooting](#troubleshooting)
- [Other ways to show it](#other-ways-to-show-it)

## What the TV page shows

`https://bar.example.com/tv` is a full-screen page made for a 16:9 screen. It needs no sign-in
and rotates through slides. In **Settings > TV display** you choose:

- one slide per featured drink (picture, name and description), or every available drink;
- a full-screen logo slide;
- a menu board listing everything available tonight, split over several slides if needed;
- an announcement slide with your own text;
- how many seconds each slide stays up;
- an optional background picture in place of the theme colour.

Text on every slide shrinks to fit, so long drink names and descriptions are never cut off.

The page reloads the menu and settings by itself every minute. Once it is running you never need
to touch the TV: new featured drinks, stock changes and a theme switch all appear within about a
minute.

## Choosing how to show it

| Option | Good for | Watch out for |
| --- | --- | --- |
| Raspberry Pi in kiosk mode | A permanent display that just works when the TV is on | An hour of setup; needs the steps below to survive power cuts |
| Home Assistant + DashCast to a Chromecast | One-tap from Home Assistant, no extra hardware | Casts can drop, and anyone casting music takes over the TV |
| Chrome tab casting from a laptop | A one-off evening | Ties up the laptop all night |

This guide covers the Raspberry Pi in detail. The others are summarised at the end.

## Network requirements

Whatever shows the page, the device must be able to load `https://bar.example.com/tv` by itself.
Check these before anything else:

1. **Firewall.** If the TV or Pi is on a separate network (such as an IoT VLAN), allow it to reach
   the reverse proxy on TCP 443. In OPNsense the rule goes on the **IoT interface**, with the
   IoT network as source, the Docker host as destination and HTTPS as the port. It must sit
   **above** any rule that blocks that network from reaching private addresses. Apply the
   changes after saving.
2. **DNS.** The device has to resolve your bar hostname. If that name only exists in local DNS,
   make sure the device's network is given a DNS server that knows it, and that the firewall
   allows the device to reach that DNS server on port 53. Chromecasts and some smart TVs ignore
   the DNS server they are given and use Google's (8.8.8.8), which will never know a local-only
   name. A Raspberry Pi uses the DNS server it is given.
3. **Certificate.** The device must trust the site's HTTPS certificate. A publicly issued
   certificate (for example Let's Encrypt through a DNS challenge) works everywhere. A
   certificate from your own internal certificate authority only works on devices you have
   installed that authority on.
4. **Reverse proxy.** If your proxy restricts the bar host to certain source networks, add the
   TV's network to the allowed list.

**Quick test:** open `https://bar.example.com/tv` in a browser on a laptop connected to the same
network as the TV. If that works, the device will too, apart from the Chromecast DNS caveat.

To see what the firewall is doing, tick **Log** on the rule and watch **Firewall > Log Files >
Live View**, filtered on the device's IP, while it tries to load the page.

## Raspberry Pi kiosk

### Hardware

- **Pi 3 B or newer.** A Pi 3 B or 3 B+ is enough; a Pi 4 or 5 has more headroom. A Pi Zero 2 W is
  too tight on memory for this page.
- **A new, name-brand microSD card**, 16 GB or larger. Don't reuse an old card; it is the part
  most likely to fail.
- **Power.** A Pi 3 wants a 2.5 A supply. Many TV USB ports supply less. Powering it from the TV
  is convenient, but check it with the test in [Troubleshooting](#troubleshooting). If the TV's
  port is too weak, use a wall adapter plugged into a smart plug that follows the TV.
- **Network.** Ethernet if you can. The Pi 3 B only has 2.4 GHz Wi-Fi; the 3 B+ and later also
  have 5 GHz.

### 1. Install the operating system

Use **Raspberry Pi Imager** on another computer:

1. Choose your Pi model, then **Raspberry Pi OS (32-bit or 64-bit)** with the desktop. The desktop
   version is needed because the browser has to draw on the screen. Do not pick a "Lite" image
   for this method.
2. Before writing, open the settings (the gear icon, or **Edit settings**) and set:
   - a hostname, for example `bartv`;
   - a username and password;
   - your Wi-Fi network, if not using Ethernet;
   - your time zone, so the clock on the TV is right;
   - **Enable SSH**, so you can change things later without a keyboard.
3. Write the card, put it in the Pi, connect it to the TV and power it on. The first boot takes a
   few minutes.

From another computer you can now log in with:

```bash
ssh <username>@bartv.local
```

If `bartv.local` does not resolve, use the Pi's IP address from your router or OPNsense.

### 2. Bring it up to date

Do this now, because once the Pi is read-only, updates are lost at every power-off.

```bash
sudo apt update && sudo apt full-upgrade -y
```

Then reboot:

```bash
sudo reboot
```

### 3. Log in automatically and stop the screen blanking

Open the configuration tool:

```bash
sudo raspi-config
```

- **System Options > Boot / Auto Login:** choose **Desktop Autologin**.
- **Display Options > Screen Blanking:** choose **No**, so the screen doesn't go dark after ten
  minutes.

Finish and reboot when asked.

### 4. Open the TV page at start-up

Current Raspberry Pi OS uses the **labwc** desktop. Programs listed in its autostart file run when
the desktop starts.

First check which name the browser has on your system:

```bash
command -v chromium chromium-browser
```

It prints the one that exists. Use that name below.

Create or edit the autostart file:

```bash
mkdir -p ~/.config/labwc
nano ~/.config/labwc/autostart
```

Add this as a single line, with your address and the browser name from the check above:

```
chromium --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disk-cache-size=33554432 https://bar.example.com/tv &
```

What the options do:

| Option | Why |
| --- | --- |
| `--kiosk` | Full screen, with no address bar or tabs. |
| `--noerrdialogs`, `--disable-infobars` | No pop-up messages over the display. |
| `--disable-session-crashed-bubble` | No "Chromium didn't shut down correctly" bar after the TV is switched off. |
| `--disk-cache-size=33554432` | Caps the browser cache at 32 MB. Once the Pi is read-only, the cache lives in memory, so this keeps it from slowly filling it. |

Save (Ctrl+O, Enter) and exit (Ctrl+X), then reboot:

```bash
sudo reboot
```

The Pi should start straight into the TV page. Leave it running for a while and check that it
looks right and moves smoothly before going further.

If your Pi uses an older desktop where nothing happens, the official Raspberry Pi
[kiosk tutorial](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/)
covers the alternatives.

**Hiding the mouse pointer.** If a pointer sits in the middle of the screen, unplug any mouse.
The page itself also hides the pointer while it is over the display.

**If it stutters (mainly on a Pi 3):** set the Pi's output to 1280×720 in **Display Options**,
or with the Screen Configuration tool on the desktop. The page scales to fit, so it looks the same
from across the room and runs much more smoothly.

## Making the Pi read-only

When the Pi is powered from the TV, every time the TV turns off the Pi loses power mid-flight.
Without protection, that will eventually corrupt the SD card. The **overlay file system** fixes
this: the card is never written to, and everything the Pi writes goes to memory and is thrown away
at power-off. Each power-on starts from exactly the same state.

**Finish and test everything above first.** Any change made while the overlay is on is lost at
the next power-off, including Wi-Fi settings, the page address and updates.

### Turn it on

```bash
sudo raspi-config
```

1. Go to **Performance Options > Overlay File System**.
2. "Would you like the overlay file system to be enabled?" Answer **Yes**.
3. "Would you like the boot partition to be write-protected?" Answer **Yes**.
4. Finish and reboot when asked.

The same can be done without the menu:

```bash
sudo raspi-config nonint enable_overlayfs
```

```bash
sudo raspi-config nonint enable_bootro
```

Then reboot:

```bash
sudo reboot
```

### Check that it worked

After the reboot, log in and run:

```bash
mount | grep ' / '
```

The line should start with `overlay` (or `overlayroot`). If it shows `/dev/mmcblk0p2` or similar
with `rw`, the overlay is not active: run `sudo raspi-config` again and check the setting.

A second check: create a file, reboot, and confirm it is gone.

```bash
touch ~/overlay-test && sudo reboot
```

After it comes back:

```bash
ls ~/overlay-test
```

"No such file or directory" means the overlay is working.

### What changes once it is on

- Switching the TV off, and so the Pi, is now safe.
- The TV page still updates on its own: it fetches the menu over the network, which the overlay
  doesn't affect.
- The clock stays right, because the Pi sets its time from the internet at each start.
- Nothing you change on the Pi is kept. See the next section for how to make changes.

## Changing things later

To change the page address, Wi-Fi, or install updates, turn the overlay off first.

1. Turn the TV on and log in over SSH.
2. Turn the overlay off. In `sudo raspi-config`, go to **Performance Options > Overlay File
   System** and answer **No** to both questions, or:

   ```bash
   sudo raspi-config nonint disable_overlayfs
   ```

   ```bash
   sudo raspi-config nonint disable_bootro
   ```

3. Reboot. Keep the TV on until you have finished; a power cut now can still damage the card.

   ```bash
   sudo reboot
   ```

4. Make your changes. For updates:

   ```bash
   sudo apt update && sudo apt full-upgrade -y
   ```

5. Turn the overlay back on as in [Turn it on](#turn-it-on), and reboot.

A sensible routine is to do this every few months for updates. Day to day, nothing on the Pi needs
changing: drinks, themes and TV settings are all managed in the app.

## Troubleshooting

**Check the power supply.** With the TV page running for a few minutes, log in and run:

```bash
vcgencmd get_throttled
```

- `throttled=0x0`: power is fine.
- Anything else, for example `throttled=0x50005`: the supply has been too weak. Expect
  stuttering, a lightning-bolt symbol on screen, or random restarts. Use a stronger supply; if
  the TV's USB port is the source, switch to a wall adapter on a smart plug that follows the TV.

**The screen shows "This site can't be reached".** Network problem, not a Pi problem. Work
through [Network requirements](#network-requirements). On the Pi you can test from SSH:

```bash
curl -sI https://bar.example.com/tv
```

An HTTP status line means the network, DNS and certificate are all fine. "Could not resolve host"
means DNS. A certificate error means the Pi does not trust the certificate. A timeout means the
firewall.

**The screen shows a certificate warning.** The certificate is from an authority the Pi doesn't
trust. Use a publicly issued certificate, or install your internal authority's certificate on the
Pi (with the overlay turned off).

**The page loads but goes dark after a while.** Screen blanking is still on. Repeat step 3 with the
overlay turned off.

**The page is stuck on an old version of the menu.** It refreshes every minute on its own. If it
looks stuck for longer, the Pi has probably lost its network connection; power-cycling the TV
reloads everything.

**Changes on the Pi keep disappearing.** That is the overlay doing its job. Turn it off first,
as in [Changing things later](#changing-things-later).

## Other ways to show it

### Home Assistant and a Chromecast

Home Assistant's built-in Cast integration only casts Home Assistant dashboards. To cast the TV
page, install the community [DashCast](https://github.com/AlexxIT/DashCast) integration:

1. In HACS, add `AlexxIT/DashCast` as a custom repository of type **Integration**, install it and
   restart Home Assistant.
2. Add it under **Settings > Devices & services > Add integration > DashCast**.
3. Test it from **Developer tools > Actions**:

   ```yaml
   service: dash_cast.load_url
   data:
     entity_id: media_player.bar_tv
     url: https://bar.example.com/tv
     force: true
   ```

4. Put the same action in a script, dashboard button or automation.

Leave out DashCast's `reload_seconds` option; the page already refreshes itself, and a forced
reload restarts the slide rotation. The Chromecast DNS caveat under
[Network requirements](#network-requirements) applies.

### Casting a browser tab

Open `https://bar.example.com/tv` in Chrome on a laptop, then use **Cast > Cast tab** and pick the
TV. Press F11 first for full screen. The laptop has to stay on and awake for the whole evening.

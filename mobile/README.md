# Runner Commerce Mobile

Expo Android app for runners to control the existing backend and WhatsApp bridge.

## What it does

- Login with existing Runner Commerce credentials.
- View approved shops and queue manual WhatsApp capture.
- View runner listings with original captured media and captions.
- Approve or pause listings for auto-posting.
- Queue selected listings to a runner WhatsApp group through the bridge.
- Add available products from approved shops into runner listings.
- Update runner profile and default repost group.

The app does not scrape WhatsApp directly on Android. It controls the backend and the existing WhatsApp Web session bridge, which is the more reliable approach.

## Run in development

From this folder:

```powershell
npm install
npm run android
```

Backend URL defaults to:

- Android emulator: `http://10.0.2.2:3001`
- Web/iOS simulator: `http://localhost:3001`

For a real Android phone, replace the login screen Backend URL with your laptop LAN address, for example:

```text
http://192.168.1.20:3001
```

Make sure the backend and WhatsApp bridge are running before using capture or repost controls.

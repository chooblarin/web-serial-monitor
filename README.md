# Web Serial Monitor

A simple browser-based serial monitor for receiving and displaying NMEA-0183 output from GNSS receivers such as QZ1 through the Web Serial API.

## Features

- Serial port connection through the Web Serial API
- NMEA Sentence receive log
- Received-at timestamp display
- Automatic follow-latest scrolling
- Baud Rate selection

The default Baud Rate for QZ1 is `115200`.

## Development

Install dependencies.

```sh
vp install
```

Start the development server.

```sh
vp dev
```

Build the app.

```sh
vp build
```

Run checks.

```sh
vp check
```

## Notes

The Web Serial API is only available in supported browsers. Use a Chromium-based browser such as Chrome or Edge.

The Web Serial API requires a secure context. Use `localhost` for local development and HTTPS for published pages. GitHub Pages is served over HTTPS, so it can be used for deployment.

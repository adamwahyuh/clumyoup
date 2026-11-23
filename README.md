# Clumyoup

Schedule a whole folder of YouTube videos (Shorts or regular) in one go: paste the titles and descriptions, match each video to its episode, pick the first day, how many per day and at what times, then upload. Every video goes up private with a publish time and "not made for kids".

## Download

Installers for macOS (Apple Silicon and Intel) and Windows are on the [Releases](https://github.com/adamwahyuh/clumyoup/releases) page. The app is not signed, so the first launch needs one extra step; the release notes explain it.

## Install from source (macOS)

Needs Node.js and Rust.

```sh
./install.sh
```

This also adds the `clumyoup` command. Then, inside a folder of videos:

```sh
clumyoup .
```

## Connect YouTube (once)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **YouTube Data API v3**.
2. Under **OAuth consent screen**, fill in the app name and add your Google account as a **test user**.
3. Under **Credentials**, create an **OAuth client ID** of type **Desktop app** and download the JSON.
4. In Clumyoup, click **Add client_secret.json**, pick that file, then **Connect YouTube**.

Limits to know:
- The API allows about 6 uploads a day by default. If the limit is hit, open the folder again the next day and press the same button; finished videos are skipped.
- While the app is in "Testing" on Google, the sign-in lasts 7 days.
- Until your Google Cloud project passes YouTube's API audit, uploaded videos stay private.

## Episode formats

Paste or load any of these; the format is recognized from the text. **Formats** in the app shows a copyable example of each, and **Convert to standard** rewrites any of them into the standard one.

Standard (recommended):

```
---
ep: 1
title: Title of episode one
---
Description, any number of lines.
```

Also accepted:
- `Ep 1` / title / `===` / description
- JSON: `[{ "ep": 1, "title": "...", "description": "..." }]`
- CSV with columns `ep,title,description` (comma or semicolon)

## Releasing

```sh
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions builds the installers and publishes the release. On the runner only, `VERSION` and the app's bundle version are set from the tag; nothing is committed back.

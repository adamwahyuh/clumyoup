# Clumyoup

Desktop app to bulk-schedule YouTube uploads from a folder. Opened from a terminal like `code .`: `clumyoup .` opens the app on that folder.

## Keputusan project

- **Stack:** sama dengan `../clumvert`: Tauri v2 (Rust) + React + TypeScript + Tailwind + shadcn/ui. Pakai ulang komponen/konfigurasi clumvert sebelum menulis sendiri.
- **Package manager:** npm. Tes: `npm test` (node --test, file `*.test.ts`).
- **Bundle identifier:** `com.clumity.clumyoup`. Lisensi GPL-3.0-or-later.
- **Git:** branch `main`, identitas git global pengguna. **Jangan menambahkan trailer `Co-Authored-By` atau atribusi AI apa pun** di commit maupun PR.

## Alur

1. Folder video (nama file acak) + metadata teks (paste atau load `.txt`) dengan format:
   ```
   Ep 1
   <title>
   ===
   <description>
   ```
   Parser: `src/lib/parse.ts` mendeteksi format otomatis: **standard** (`---` / `ep:` / `title:` / `---` / deskripsi, rekomendasi), **loose** (format di atas, toleran `ep`/`Ep`/`Episode`, `=` 3+, baris kosong), **JSON**, dan **CSV** (`ep,title,description`). `toStandard()` dipakai untuk tombol Convert to standard.
2. Arrange: episode tetap urut, video di-drag (tukar) atau pakai tombol naik/turun sampai cocok. Urutan awal = waktu file dibuat.
3. Jadwal: tanggal mulai, N video per hari, N jam (`src/lib/schedule.ts`), zona waktu lokal komputer.
4. State per folder disimpan di `<folder>/.clumyoup.json` (metadata, urutan nama file, jadwal, `uploaded`: nama file -> video ID + waktu publish). Video yang sudah ter-upload dikunci di barisnya dan tidak di-upload ulang.
5. Upload (`src-tauri/src/youtube.rs`): pengguna memilih `client_secret.json` (OAuth client tipe Desktop) yang disalin ke folder data app. Login lewat browser (loopback + PKCE, scope `youtube.upload`), refresh token di `token.json` (mode 600). Upload resumable per 8 MiB; kalau koneksi putus, tanya posisi ke YouTube lalu lanjut. Error kuota diawali `QUOTA:`, dan UI berhenti dengan pesan "lanjut besok".
6. Visibilitas per folder: Scheduled (private + `publishAt`, otomatis public), Public, Unlisted, Private. API YouTube hanya bisa menjadwalkan video private. Made for kids juga per folder.
7. Shorts: tidak ada flag di API. App memberi peringatan kalau video horizontal atau lebih dari 3 menit.

## Versi & rilis

- `VERSION` di root adalah versi yang tampil di header (dibaca saat build lewat `?raw`).
- Push tag `vX.Y.Z` menjalankan `.github/workflows/release.yml`: di runner saja (tidak di-commit) `VERSION` dan `version` di `tauri.conf.json` diganti dari tag, lalu `tauri-action` membuat release berisi `.dmg` (universal) dan installer Windows. Tag harus persis `vX.Y.Z` (MSI menolak prerelease).
- Build tidak di-sign (tanpa Apple Developer ID / sertifikat Windows).

## Rencana

- [x] Langkah 1: parser, layar arrange, preview jadwal
- [x] Langkah 2: login Google (OAuth desktop) + upload resumable di Rust, `privacyStatus: private` + `publishAt`, `selfDeclaredMadeForKids: false`, progres di `.clumyoup.json` supaya bisa lanjut saat kuota habis (~6 upload/hari)
- [x] Langkah 3: launcher `clumyoup` di PATH + `install.sh` (macOS: app ke /Applications (fallback ~/Applications), perintah ke ~/.local/bin)

Catatan: project API YouTube yang belum lolos audit akan mengunci video jadi private.

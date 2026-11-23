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
   Parser: `src/lib/parse.ts` (toleran: `ep`/`Ep`/`Episode`, `=` 3+, baris kosong).
2. Arrange: episode tetap urut, video di-drag (tukar) atau pakai tombol naik/turun sampai cocok. Urutan awal = waktu file dibuat.
3. Jadwal: tanggal mulai, N video per hari, N jam (`src/lib/schedule.ts`), zona waktu lokal komputer.
4. State per folder disimpan di `<folder>/.clumyoup.json` (metadata, urutan nama file, jadwal).

## Rencana

- [x] Langkah 1: parser, layar arrange, preview jadwal
- [ ] Langkah 2: login Google (OAuth desktop) + upload resumable di Rust, `privacyStatus: private` + `publishAt`, `selfDeclaredMadeForKids: false`, progres di `.clumyoup.json` supaya bisa lanjut saat kuota habis (~6 upload/hari)
- [ ] Langkah 3: launcher `clumyoup` di PATH + install script

Catatan: project API YouTube yang belum lolos audit akan mengunci video jadi private.

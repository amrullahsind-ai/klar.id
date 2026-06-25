# Langkah Go-Live Klaar (checklist penjual)

Ikuti urut. Centang tiap selesai. Tanda 🧑 = kamu klik sendiri, 🤖 = Claude bisa bantu kerjakan.

---

## BAGIAN A — Toko online (sekali saja, punya kamu)

### Langkah 1 — Website ke Vercel (lewat Vercel CLI, tanpa GitHub)
- [ ] 🤖 Install Vercel CLI: `npm i -g vercel`
- [ ] 🧑 Login: buka prompt lalu ketik `!vercel login` → pilih "Continue with GitHub/Email" → ikuti di browser.
- [ ] 🤖 Deploy folder ini ke production: `vercel --prod --yes` (dijalankan di folder klaarfinal).
- [ ] 🧑 Catat alamat web yang muncul, mis. `https://klaarfinal-xxxx.vercel.app`.
- [ ] 🧑 Tes: buka `<alamat>/store` → halaman jualan tampil.

### Langkah 2 — Otak Toko (Google Apps Script)
- [ ] 🧑 Google Drive → New → Google Sheets → namai `Klaar Store DB`.
- [ ] 🧑 Di sheet itu: menu **Extensions → Apps Script**.
- [ ] 🧑 Hapus kode contoh → paste seluruh isi `store-apps-script.gs` → Save (ikon disket).
- [ ] 🧑 (opsional) menu Run → pilih fungsi `testSignVerify` → jalankan → setujui izin Google saat diminta.
- [ ] 🧑 Klik **Deploy → New deployment**.
- [ ] 🧑 Pilih tipe **Web app**. Setel: *Execute as:* **Me**, *Who has access:* **Anyone**.
- [ ] 🧑 Klik **Deploy** → setujui izin (termasuk izin kirim email/MailApp).
- [ ] 🧑 Salin **Web App URL** (berakhiran `/exec`).

### Langkah 3 — Sambungkan + isi data toko
- [ ] 🤖 Tempel Web App URL ke `STORE_SERVER_URL` di `checkout.html` & `seller-admin.html`.
- [ ] 🤖 Isi nomor WhatsApp `SELLER_WA` di `checkout.html` & footer `store.html`.
- [ ] 🤖 Isi rekening/QRIS `PAY_INFO` & `APP_ACTIVATION_URL` di `store-apps-script.gs`
       (lalu paste ulang ke Apps Script + Deploy versi baru).
- [ ] 🧑 Ganti password panel penjual: di Apps Script jalankan `genSellerHash('passwordbaru')`,
       lihat hasil di Logger, paste ke `ADMIN_PASS_HASH`. (Default sementara: `klaarstore2026`.)
- [ ] 🤖 Deploy ulang ke Vercel: `vercel --prod --yes`.
- [ ] 🧑 Tes: buka `<alamat>/seller-admin` → login → buka `<alamat>/checkout` → buat order percobaan
       → konfirmasi di seller-admin → cek email masuk.

✅ Setelah ini toko kamu LIVE.

---

## BAGIAN B — Yang dilakukan PEMBELI (atau kamu pasangkan)

- [ ] Pembeli beli di `/store` → bayar → kamu **Konfirmasi & Terbitkan** di `/seller-admin`.
- [ ] Sistem kirim **token lisensi** ke email pembeli otomatis.
- [ ] Pembeli buat Google Sheet sendiri → pasang `master-apps-script-v5.gs` (sama seperti Langkah 2)
      → dapat Web App URL `/exec` milik mereka.
- [ ] Pembeli buka `/admin` → isi URL + token → Aktivasi → login admin (`admin` / `1234`, lalu ganti PIN).

> Tips jualan: untuk harga 200k, banyak penjual memasangkan backend sekolah untuk pembeli
> (minta akses Google mereka, deploy-kan) sebagai nilai "tinggal pakai".

---

## Catatan penting
- `LICENSE_SECRET` HARUS sama di `admin.html`, `master-apps-script-v5.gs`, `store-apps-script.gs`. (Sudah sama ✔)
- Jangan bagikan `LICENSE_SECRET` ke siapa pun — itu kunci pembuat lisensi.
- Tiap kali ubah file `.gs`, harus **Deploy versi baru** di Apps Script (bukan cuma Save).
- Tiap kali ubah file `.html`, jalankan `vercel --prod --yes` lagi.

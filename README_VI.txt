THE GIOI CHAT - BO MA NGUON KHOI DAU

Luu y:
- public/index.html la giao dien mau chay tren trinh duyet.
- src/worker.js la API mau cho Cloudflare Workers.
- schema.sql tao bang bai viet trong Cloudflare D1.
- wrangler.toml can thay database_id sau khi tao D1.
- Ban nay chua co dang ky/dang nhap, chat realtime, ket ban, binh luan,
  qua tang/xu, he thong cap bac hay trang quan tri. Khong mo cong dong that
  truoc khi bo sung xac thuc, phan quyen, bao mat, chong spam va kiem duyet.

HUONG DAN:
1. Giai nen ZIP tren iPhone bang ung dung Tep.
2. Tai cac tep va thu muc ben trong len repository GitHub thegioichat.
3. Tao Cloudflare D1 database ten thegioichat-db.
4. Chay schema.sql trong D1 Console.
5. Sao chep database ID va thay chuoi THAY_DATABASE_ID_SAU_KHI_TAO
   trong wrangler.toml.
6. Ket noi repository voi Cloudflare Workers & Pages va deploy.
7. Kiem tra /api/health.

Khuyen nghi: giu repository Public thi khong dua mat khau, token, khoa API,
thong tin thanh vien hoac du lieu rieng tu vao ma nguon.

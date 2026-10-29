// Máy chủ nhận dữ liệu cho trang Bói Tình Yêu.
// Chạy:  node server.js   (cần Node.js 14 trở lên, không cần cài thêm thư viện)
// Mở trình duyệt:  http://localhost:3000
//
// Mỗi lượt gửi được ghi vào thư mục "submissions", trong file .txt đặt theo tên người nhập
// (ví dụ tên "Minh Anh" -> submissions/Minh Anh.txt). Nếu cùng tên gửi nhiều lần,
// các lượt sau được ghi nối thêm vào cuối file, không ghi đè.
//
// Biến môi trường (không bắt buộc):
//   PORT            cổng chạy server (mặc định 3000)
//   ALLOWED_ORIGIN  nếu trang web nằm ở tên miền khác server, đặt vào đây
//                   (ví dụ https://ten-mien.com) để bật CORS

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
const INDEX_FILE = path.join(__dirname, "index.html");
const DATA_DIR = path.join(__dirname, "submissions"); // mỗi người nhập có 1 file .txt
const MAX_BODY = 10 * 1024; // 10 KB
const MAX_NAME = 40;

function corsHeaders() {
  if (!ALLOWED_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...corsHeaders()
  });
  res.end(body);
}

// Chuẩn hoá tên: phải là chuỗi, bỏ ký tự điều khiển, gộp khoảng trắng, giới hạn độ dài
function cleanName(value) {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(cleaned).slice(0, MAX_NAME).join("").trim();
}

// Biến tên người nhập thành tên file .txt an toàn:
// thay ký tự cấm bằng "_", bỏ dấu chấm/khoảng trắng ở hai đầu, tránh tên dành riêng của Windows.
const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
function toFileName(name) {
  let base = name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (!base) base = "khong_ten";
  if (RESERVED_NAMES.test(base)) base = "_" + base;
  return base + ".txt";
}

function readBody(req, res, callback) {
  let size = 0;
  const chunks = [];
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) {
      sendJson(res, 413, { ok: false, error: "Dữ liệu quá lớn" });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => callback(Buffer.concat(chunks).toString("utf8")));
  req.on("error", () => {});
}

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];

  // Trang chủ
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    fs.readFile(INDEX_FILE, (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Không đọc được index.html");
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  // Preflight CORS
  if (req.method === "OPTIONS" && url === "/api/submit") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  // Nhận dữ liệu
  if (req.method === "POST" && url === "/api/submit") {
    return readBody(req, res, (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { ok: false, error: "JSON không hợp lệ" });
      }

      const userName = cleanName(data && data.userName);
      const partnerName = cleanName(data && data.partnerName);
      if (!userName || !partnerName) {
        return sendJson(res, 400, { ok: false, error: "Thiếu tên người dùng hoặc tên người ghép đôi" });
      }

      // File đặt theo tên người nhập; kiểm tra lại để chắc chắn file nằm trong thư mục dữ liệu
      const fileName = toFileName(userName);
      const filePath = path.join(DATA_DIR, fileName);
      if (path.dirname(filePath) !== DATA_DIR) {
        return sendJson(res, 400, { ok: false, error: "Tên không hợp lệ" });
      }

      const time = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      const line = "[" + time + "] Tên người dùng: " + userName + " | Tên người muốn ghép đôi: " + partnerName + "\n";

      fs.mkdir(DATA_DIR, { recursive: true }, (mkErr) => {
        if (mkErr) {
          console.error("Lỗi tạo thư mục:", mkErr);
          return sendJson(res, 500, { ok: false, error: "Không lưu được dữ liệu" });
        }
        fs.appendFile(filePath, line, "utf8", (err) => {
          if (err) {
            console.error("Lỗi ghi file:", err);
            return sendJson(res, 500, { ok: false, error: "Không lưu được dữ liệu" });
          }
          console.log("Đã nhận:", userName, "♥", partnerName, "->", fileName);
          sendJson(res, 200, { ok: true });
        });
      });
    });
  }

  sendJson(res, 404, { ok: false, error: "Không tìm thấy" });
});

server.listen(PORT, () => {
  console.log("Server đang chạy tại http://localhost:" + PORT);
  console.log("Dữ liệu được lưu vào thư mục: " + DATA_DIR);
});

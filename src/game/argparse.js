// Helper parse arguments có hỗ trợ ngoặc kép (cả smart quotes / curly quotes của mobile)
// Cũng hỗ trợ ngoặc đơn '...' và ngoặc kép ngược «...»

// Smart quote map → straight quote
const QUOTE_MAP = {
  // Double quotes
  '\u201C': '"',  // " left double quotation mark
  '\u201D': '"',  // " right double quotation mark
  '\u201E': '"',  // „ double low-9 quotation mark
  '\u00AB': '"',  // « left guillemet
  '\u00BB': '"',  // » right guillemet
  '\u2033': '"',  // ″ double prime
  // Single quotes
  '\u2018': "'",  // ' left single
  '\u2019': "'",  // ' right single
  '\u201A': "'",  // ‚ single low-9
  '\u2032': "'",  // ′ prime
  // En/em dashes (đôi khi mobile cũng tự đổi -- thành — gây lỗi)
  // Bỏ qua, không cần xử lý
};

function normalizeQuotes(str) {
  let out = '';
  for (const ch of str) {
    out += QUOTE_MAP[ch] || ch;
  }
  return out;
}

/**
 * Tokenize 1 chuỗi argument, giữ string trong ngoặc kép/đơn nguyên vẹn.
 * Hỗ trợ cả ngoặc thẳng và ngoặc cong.
 *
 * VD input: 'name="Hello World" type=weapon desc=\'It\\'s nice\''
 * Output: ['name=Hello World', 'type=weapon', "desc=It's nice"]
 *
 * Lưu ý: vì key=value, hàm này keep nguyên token với cả `key=` và nội dung quote.
 */
function tokenize(str) {
  const s = normalizeQuotes(str);
  const tokens = [];
  let cur = '';
  let inQuote = null; // ký tự quote đang mở: " hoặc '

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    // Mở/đóng quote
    if (!inQuote && (ch === '"' || ch === "'")) {
      inQuote = ch;
      continue; // không thêm dấu quote vào token
    }
    if (inQuote && ch === inQuote) {
      inQuote = null;
      continue;
    }

    // Trong quote → giữ nguyên (kể cả space)
    if (inQuote) {
      cur += ch;
      continue;
    }

    // Space (ngoài quote) → end token
    if (/\s/.test(ch)) {
      if (cur) { tokens.push(cur); cur = ''; }
      continue;
    }

    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/**
 * Parse mảng tokens dạng key=value thành object.
 * Token không có '=' bị bỏ qua.
 */
function parseKV(tokens) {
  const out = {};
  for (const t of tokens) {
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).toLowerCase();
    const v = t.slice(i + 1);
    out[k] = v;
  }
  return out;
}

/**
 * Tiện ích: lấy raw command sau prefix và sub-command(s),
 * rồi tokenize. depth = số "từ" cần bỏ ở đầu (1 = bỏ command name, 2 = bỏ command + sub, ...).
 *
 * VD message: "%item create my_id name=\"Hello\"  type=weapon"
 *   getRestTokens(msg, '%', 2) → ['my_id', 'name=Hello', 'type=weapon']
 */
function getRestTokens(msg, prefix, depth = 1) {
  const raw = msg.content.slice(prefix.length).trim();
  // Bỏ depth từ đầu (mỗi từ = chuỗi không space)
  let rest = raw;
  for (let i = 0; i < depth; i++) {
    rest = rest.replace(/^\S+\s*/, '');
  }
  return tokenize(rest);
}

module.exports = {
  normalizeQuotes,
  tokenize,
  parseKV,
  getRestTokens,
}; 

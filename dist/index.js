"use strict";
// @ts-nocheck
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var _a, _b;
require('dotenv').config();
const readline = require('node:readline/promises');
const QRCode = require('qrcode');
const { stdin, stdout } = require('node:process');
const LINK_REQUEST_URL = 'http://csjk.chenshuiyi.cn/Api/getCamiLinkTwo';
const TASK_REQUEST_URL = 'http://csjk.chenshuiyi.cn/Api/getTaskInformation';
const REQUEST_TIMEOUT_MS = 2000;
const REQUEST_HEADERS = {
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    DNT: '1',
    Origin: 'http://zqax.42ku.cn',
    Pragma: 'no-cache',
    Referer: 'http://zqax.42ku.cn/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};
const CAMI = (_a = process.env.CAMI) === null || _a === void 0 ? void 0 : _a.trim();
const RETRY_DELAY_MS = Number((_b = process.env.RETRY_DELAY_MS) !== null && _b !== void 0 ? _b : '1000');
if (!CAMI) {
    throw new Error('缺少 CAMI 环境变量，请在 .env 文件中配置 CAMI=你的卡密');
}
if (!Number.isFinite(RETRY_DELAY_MS) || RETRY_DELAY_MS < 0) {
    throw new Error('缺少合法的 RETRY_DELAY_MS 环境变量，请在 .env 文件中配置大于等于 0 的数字');
}
const REQUEST_BODY = new URLSearchParams({
    cami: CAMI,
}).toString();
let requestCount = 0;
let currentView = {
    phase: 'idle',
    requestCount: 0,
    link: '',
    qrCode: '',
    todayLoveNumber: '-',
    loveNumber: '-',
    claimedNumber: '-',
    status: '等待开始',
};
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function fetchWithTimeout(url, options, timeoutMs) {
    return __awaiter(this, void 0, void 0, function* () {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return yield fetch(url, Object.assign(Object.assign({}, options), { signal: controller.signal }));
        }
        finally {
            clearTimeout(timeoutId);
        }
    });
}
function extractUrl(link) {
    const match = link.match(/https?:\/\/.+$/);
    return match ? match[0] : link;
}
function buildQrCode(link) {
    return __awaiter(this, void 0, void 0, function* () {
        const qr = QRCode.create(link, { errorCorrectionLevel: 'M' });
        const size = qr.modules.size;
        const cells = qr.modules.data;
        const margin = 2;
        const lines = [];
        for (let y = -margin; y < size + margin; y += 2) {
            let line = '';
            for (let x = -margin; x < size + margin; x += 1) {
                const top = y >= 0 && y < size && x >= 0 && x < size ? cells[y * size + x] : false;
                const bottom = y + 1 >= 0 && y + 1 < size && x >= 0 && x < size ? cells[(y + 1) * size + x] : false;
                if (top && bottom) {
                    line += '█';
                }
                else if (top && !bottom) {
                    line += '▀';
                }
                else if (!top && bottom) {
                    line += '▄';
                }
                else {
                    line += ' ';
                }
            }
            lines.push(line);
        }
        return lines.join('\n');
    });
}
function truncate(text, maxLength = 96) {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}
function getDisplayWidth(text) {
    var _a;
    let width = 0;
    for (const char of text) {
        const codePoint = (_a = char.codePointAt(0)) !== null && _a !== void 0 ? _a : 0;
        if (codePoint >= 0x1100 &&
            (codePoint <= 0x115f ||
                codePoint === 0x2329 ||
                codePoint === 0x232a ||
                (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
                (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
                (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
                (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
                (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
                (codePoint >= 0xff00 && codePoint <= 0xff60) ||
                (codePoint >= 0xffe0 && codePoint <= 0xffe6))) {
            width += 2;
        }
        else {
            width += 1;
        }
    }
    return width;
}
function truncateDisplay(text, maxWidth) {
    if (maxWidth <= 0) {
        return '';
    }
    let output = '';
    let width = 0;
    for (const char of text) {
        const charWidth = getDisplayWidth(char);
        if (width + charWidth > maxWidth) {
            break;
        }
        output += char;
        width += charWidth;
    }
    if (output === text) {
        return output;
    }
    if (maxWidth <= 3) {
        return '.'.repeat(maxWidth);
    }
    let trimmed = '';
    let trimmedWidth = 0;
    for (const char of output) {
        const charWidth = getDisplayWidth(char);
        if (trimmedWidth + charWidth > maxWidth - 3) {
            break;
        }
        trimmed += char;
        trimmedWidth += charWidth;
    }
    return `${trimmed}...`;
}
function padDisplay(text, width) {
    const displayWidth = getDisplayWidth(text);
    if (displayWidth >= width) {
        return text;
    }
    return `${text}${' '.repeat(width - displayWidth)}`;
}
function renderDashboard() {
    console.clear();
    const innerWidth = 81;
    const lineWidth = innerWidth - 2;
    const title = ' SkyHeart Console ';
    const titleWidth = getDisplayWidth(title);
    const leftTitleLine = '═'.repeat(Math.max(0, Math.floor((lineWidth - titleWidth) / 2)));
    const rightTitleLine = '═'.repeat(Math.max(0, lineWidth - titleWidth - leftTitleLine.length));
    const statusText = `请求次数: ${currentView.requestCount}    状态: ${currentView.status}`;
    const linkText = `Link  ${currentView.link || '-'}`;
    const statsText = `今日已取  ${currentView.todayLoveNumber}    剩余爱心  ${currentView.loveNumber}    已领次数  ${currentView.claimedNumber}`;
    const lines = [
        `╔${leftTitleLine}${title}${rightTitleLine}╗`,
        `║ ${padDisplay(truncateDisplay(statusText, lineWidth - 2), lineWidth - 2)} ║`,
        `╠${'═'.repeat(lineWidth)}╣`,
        `║ ${padDisplay(truncateDisplay(linkText, lineWidth - 2), lineWidth - 2)} ║`,
        `╠${'═'.repeat(lineWidth)}╣`,
        `║ ${padDisplay(truncateDisplay(statsText, lineWidth - 2), lineWidth - 2)} ║`,
        `╚${'═'.repeat(lineWidth)}╝`,
    ];
    console.log(lines.join('\n'));
    if (currentView.qrCode) {
        console.log('');
        console.log(currentView.qrCode);
    }
    if (currentView.phase === 'ready') {
        console.log('按回车继续...');
    }
}
function updateView(patch) {
    currentView = Object.assign(Object.assign({}, currentView), patch);
    renderDashboard();
}
function fetchLink() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        while (true) {
            try {
                requestCount += 1;
                updateView({
                    phase: 'fetching-link',
                    requestCount,
                    link: '',
                    qrCode: '',
                    todayLoveNumber: '-',
                    loveNumber: '-',
                    claimedNumber: '-',
                    status: '正在获取 link',
                });
                const response = yield fetchWithTimeout(LINK_REQUEST_URL, {
                    method: 'POST',
                    headers: REQUEST_HEADERS,
                    body: REQUEST_BODY,
                }, REQUEST_TIMEOUT_MS);
                if (!response.ok) {
                    const errorText = yield response.text();
                    updateView({
                        status: `link 失败 status=${response.status}，${truncate(errorText, 42)}，${RETRY_DELAY_MS}ms 后重试`,
                    });
                    yield sleep(RETRY_DELAY_MS);
                    continue;
                }
                const result = yield response.json();
                const link = (_a = result === null || result === void 0 ? void 0 : result.data) === null || _a === void 0 ? void 0 : _a.link;
                if ((result === null || result === void 0 ? void 0 : result.code) === 200 && typeof link === 'string' && link.length > 0) {
                    return link;
                }
                updateView({
                    status: `link 响应无有效数据，${RETRY_DELAY_MS}ms 后重试`,
                });
                yield sleep(RETRY_DELAY_MS);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                updateView({
                    status: `link 请求异常：${truncate(message, 30)}，${RETRY_DELAY_MS}ms 后重试`,
                });
                yield sleep(RETRY_DELAY_MS);
            }
        }
    });
}
function fetchTaskInformation() {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield fetchWithTimeout(TASK_REQUEST_URL, {
            method: 'POST',
            headers: REQUEST_HEADERS,
            body: REQUEST_BODY,
        }, REQUEST_TIMEOUT_MS);
        if (!response.ok) {
            const errorText = yield response.text();
            throw new Error(`任务信息请求失败，status=${response.status}，响应=${errorText}`);
        }
        return response.json();
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const rl = readline.createInterface({ input: stdin, output: stdout });
        try {
            while (true) {
                const rawLink = yield fetchLink();
                const link = extractUrl(rawLink);
                const qrCode = yield buildQrCode(link);
                updateView({
                    phase: 'fetching-task',
                    link,
                    qrCode,
                    status: '已拿到 link，正在获取任务信息',
                });
                try {
                    const taskInfo = yield fetchTaskInformation();
                    const data = (_a = taskInfo === null || taskInfo === void 0 ? void 0 : taskInfo.data) !== null && _a !== void 0 ? _a : {};
                    updateView({
                        phase: 'ready',
                        todayLoveNumber: (_b = data.todayLoveNumber) !== null && _b !== void 0 ? _b : '-',
                        loveNumber: (_c = data.loveNumber) !== null && _c !== void 0 ? _c : '-',
                        claimedNumber: (_d = data.claimedNumber) !== null && _d !== void 0 ? _d : '-',
                        status: '结果已就绪',
                    });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    updateView({
                        phase: 'ready',
                        status: `任务信息获取失败：${truncate(message, 46)}`,
                    });
                }
                yield rl.question('');
            }
        }
        finally {
            rl.close();
        }
    });
}
main().catch((error) => {
    var _a;
    const message = error instanceof Error ? (_a = error.stack) !== null && _a !== void 0 ? _a : error.message : String(error);
    console.error(message);
    process.exitCode = 1;
});

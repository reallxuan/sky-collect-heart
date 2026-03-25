// @ts-nocheck

require('dotenv').config();

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const LINK_REQUEST_URL = 'http://csjk.chenshuiyi.cn/Api/getCamiLinkTwo';
const TASK_REQUEST_URL = 'http://csjk.chenshuiyi.cn/Api/getTaskInformation';
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
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};
const CAMI = process.env.CAMI?.trim();
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS ?? '1000');

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderStatusLine(text: string) {
  stdout.write(`\r\x1b[2K${text}`);
}

function clearStatusLine() {
  stdout.write('\r\x1b[2K');
}

async function fetchLink() {
  while (true) {
    try {
      requestCount += 1;
      renderStatusLine(`第 ${requestCount} 次请求 | 正在获取 link...`);

      const response = await fetch(LINK_REQUEST_URL, {
        method: 'POST',
        headers: REQUEST_HEADERS,
        body: REQUEST_BODY,
      });

      if (!response.ok) {
        const errorText = await response.text();
        renderStatusLine(
          `第 ${requestCount} 次请求 | link 失败 status=${response.status}，${errorText}，${RETRY_DELAY_MS}ms 后重试...`
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      const result = await response.json();
      const link = result?.data?.link;

      if (result?.code === 200 && typeof link === 'string' && link.length > 0) {
        return link;
      }

      renderStatusLine(
        `第 ${requestCount} 次请求 | link 响应无有效数据，${RETRY_DELAY_MS}ms 后重试... | ${JSON.stringify(result)}`
      );
      await sleep(RETRY_DELAY_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      renderStatusLine(
        `第 ${requestCount} 次请求 | link 请求异常：${message}，${RETRY_DELAY_MS}ms 后重试... | ERROR : ${error}`
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function fetchTaskInformation() {
  const response = await fetch(TASK_REQUEST_URL, {
    method: 'POST',
    headers: REQUEST_HEADERS,
    body: REQUEST_BODY,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`任务信息请求失败，status=${response.status}，响应=${errorText}`);
  }

  return response.json();
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    while (true) {
      const link = await fetchLink();
      clearStatusLine();
      console.log(`第 ${requestCount} 次请求 | Link: ${link}`);

      try {
        const taskInfo = await fetchTaskInformation();
        const data = taskInfo?.data ?? {};
        const todayLoveNumber = data.todayLoveNumber ?? '-';
        const loveNumber = data.loveNumber ?? '-';
        const claimedNumber = data.claimedNumber ?? '-';
        console.log(
          `第 ${requestCount} 次请求 | 今日已取: ${todayLoveNumber} | 剩余爱心: ${loveNumber} | 已领次数: ${claimedNumber}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`第 ${requestCount} 次请求 | 任务信息获取失败：${message}`);
      }

      await rl.question('按回车继续...');
    }
  } finally {
    rl.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

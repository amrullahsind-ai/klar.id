const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const here = __dirname;
  const browser = await chromium.launch({
    headless:true,
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args:['--disable-web-security','--allow-file-access-from-files']
  });
  const page = await browser.newPage({viewport:{width:720,height:1280}});
  await page.goto('file:///' + path.join(here,'render-video.html').replace(/\\/g,'/'));
  await page.waitForFunction(() => window.makeVideo && document.querySelectorAll('img').length === 0);
  const result = await page.evaluate(() => window.makeVideo());
  const ext = result.mime.includes('mp4') ? 'mp4' : 'webm';
  const output = path.join(here, `iklan-klaar-vertical-24s.${ext}`);
  const payload = result.dataUrl.slice(result.dataUrl.indexOf(',') + 1);
  fs.writeFileSync(output, Buffer.from(payload, 'base64'));
  await page.screenshot({path:path.join(here,'preview.png')});
  await browser.close();
  console.log(JSON.stringify({output,mime:result.mime,bytes:fs.statSync(output).size}));
})().catch(err=>{console.error(err);process.exit(1)});

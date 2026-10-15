import { chromium } from 'playwright';
import fs from 'node:fs';

const deploymentId=process.env.SPARK_DEPLOYMENT_ID;
if (!deploymentId || !/^AKfy[a-zA-Z0-9_-]+$/.test(deploymentId)) throw new Error('Missing or invalid SPARK_DEPLOYMENT_ID');
const url='https://script.google.com/macros/s/'+deploymentId+'/exec';
const browser=await chromium.launch({headless:true});
const result={check:'SPARK public browser smoke test',timestamp:new Date().toISOString(),status:'failed',pageFound:false,reason:'',frames:0};
try {
  const page=await browser.newPage({viewport:{width:1280,height:900},locale:'en-US'});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(4500);
  let found=false;
  for(let attempt=0;attempt<5&&!found;attempt++){
    for(const frame of page.frames()){
      const text=await frame.locator('body').innerText({timeout:7000}).catch(()=>'');
      if(/Sorry, unable to open the file|Please check the address|You need access|Request access/i.test(text)){
        throw new Error('Google access or file-error page shown in browser');
      }
      const title=/SPARK|Reasoning Opportunity Builder/i.test(text);
      const input=await frame.locator('#activityUrl, #url, #activityText, #text').count().catch(()=>0);
      const action=await frame.getByRole('button',{name:/Find opportunities/i}).count().catch(()=>0);
      if(title&&input&&action){found=true;result.pageFound=true;break;}
    }
    if(!found) await page.waitForTimeout(1200);
  }
  result.frames=page.frames().length;
  if(!found) throw new Error('SPARK heading, source input and Find opportunities button were not found together');
  result.status='passed';result.reason='SPARK browser interface found; backend generation not exercised';
  process.stdout.write('PASS: browser opened SPARK and verified primary controls.\n');
}catch(error){
  result.reason=error.message;
  process.stderr.write('FAIL: '+error.message+'\n');
  process.exitCode=1;
}finally{
  fs.mkdirSync('release-probe',{recursive:true});
  fs.writeFileSync('release-probe/browser-result.json',JSON.stringify(result,null,2));
  await browser.close();
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {controller} from './helpers/controller.mjs';
import {initial,apply,summary} from '../lib/domain.mjs';
import {personas} from '../public/coach-flow-ui.mjs';
import {buildRoutePreview,routePreviewPage,goalEditor,personaChoices} from '../public/goal-page-ui.mjs';
import {recommendationStrip} from '../public/recommendation-ui.mjs';
const change=(s,type,args={})=>apply(structuredClone(s),type,args).state;
const student={place:'武汉',city:2,home:3,job:6,commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:'2000',rent:'0',leisure:'400',extraAmt:'0',opening:'2000'};
function ready(){return change(change(change(initial(),'goal',{target:'6000',months:12}),'coach',student),'coach_route',{index:1});}

test('目标在主页面确认；返回保留输入，取消不改原目标',async()=>{
 const h=controller(ready()),before=JSON.stringify(h.state);
 await h.driver.chat('目标金额改成7000元');h.driver.render();assert.equal(h.dialogs.length,0);assert.equal(h.driver.dump().goalScreen,'goal-review');assert.match(h.mount.innerHTML,/确认你的储蓄目标/);assert.equal(h.state.goal.targetCents,600000);
 await h.driver.act('edit-goal-draft');h.driver.render();assert.equal(h.driver.dump().goalEditDraft.target,'7000');assert.match(h.mount.innerHTML,/name="target"[^>]*value="7000"/);assert.match(h.mount.innerHTML,/value="12"/);
 await h.driver.act('cancel-goal-edit');assert.equal(JSON.stringify(h.state),before);assert.equal(h.dialogs.length,0);
});
test('完整生活条件下改目标后直接重算，同时保留两步记录',async()=>{
 const h=controller(ready());await h.driver.chat('目标金额改成7000元');await h.driver.commitInlineGoal();h.driver.render();
 assert.equal(h.state.goal.targetCents,700000);assert.equal(h.state.coach.incomeNum,2000);assert.equal(h.driver.dump().goalScreen,'routes');assert.match(h.mount.innerHTML,/第一步 · 目标/);assert.match(h.mount.innerHTML,/第二步 · 现实条件/);assert.match(h.mount.innerHTML,/7,000/);assert.match(h.mount.innerHTML,/route-grid/);assert.doesNotMatch(h.mount.innerHTML,/execution-plan/);assert.equal(h.dialogs.length,0);
});
test('两种虚构情形都有入口；聊天说明信息用途并避免重复提示',async()=>{
 const h=controller(change(initial(),'goal',{target:'6000',months:12}));h.driver.begin();h.driver.render();
 assert.match(h.mount.innerHTML,/data-persona="student"/);assert.match(h.mount.innerHTML,/data-persona="worker"/);assert.match(h.driver.dump().messages.at(-1).text,/评估目标是否可行|评估储蓄方案/);assert.match(h.driver.dump().messages.at(-1).text,/深圳职场新人/);
 const n=h.driver.dump().messages.length;h.driver.begin();assert.equal(h.driver.dump().messages.length,n);
 await h.driver.act('persona',{dataset:{persona:'worker'}});assert.equal(h.driver.dump().coachInterview.draft.place,'深圳');assert.equal(h.driver.dump().coachInterview.draft.incomeNum,8000);assert.equal(h.state.coach,null);assert.equal(h.state.openingKnown,false);
 await h.driver.act('persona',{dataset:{persona:'student'}});assert.equal(h.driver.dump().coachInterview.draft.incomeNum,2000);assert.equal(h.driver.dump().coachInterview.draft.opening,2000);assert.equal(h.state.coach,null);assert.equal(h.dialogs.length,0);
});
test('已有个人资金不能混入虚构情形；直接在聊天说名称可体验',async()=>{
 const personal=controller(ready()),before=JSON.stringify(personal.state);await personal.driver.act('persona',{dataset:{persona:'worker'}});assert.match(personal.driver.dump().messages.at(-1).text,/已有个人资料或账本|不混入|不会覆盖/);assert.notEqual(personal.driver.dump().coachInterview?.simulated,true);assert.equal(JSON.stringify(personal.state),before);
 assert.doesNotMatch(personaChoices(ready()),/data-persona=/);
 const h=controller(change(initial(),'goal',{target:'6000',months:12}));await h.driver.chat('体验深圳职场新人');assert.equal(h.driver.dump().coachInterview.draft.place,'深圳');assert.equal(h.driver.dump().coachInterview.simulated,true);assert.match(h.driver.dump().messages.at(-1).text,/虚构|模拟/);
});
test('三种方案先预览，预览和返回不改目标、路线、现金或账本',async()=>{
 const h=controller(ready()),before=JSON.stringify(h.state);await h.driver.act('coach-outcome');h.driver.render();assert.equal((h.mount.innerHTML.match(/data-act="preview-route"/g)||[]).length,3);
 for(let index=0;index<3;index++){
  const calls=h.calls.length;await h.driver.act('preview-route',{dataset:{index:String(index)}});h.driver.render();assert.equal(h.calls.length,calls);assert.match(h.mount.innerHTML,/方案预览 · 尚未采用/);assert.match(h.mount.innerHTML,/确认采用这条方案/);assert.equal(JSON.stringify(h.state),before);
  await h.driver.act('return-routes');assert.equal(JSON.stringify(h.state),before);assert.equal(h.driver.dump().goalScreen,'routes');
 }
 assert.equal(h.dialogs.length,0);
});
test('确认采用才保存；重复点击不重复提交，现金不变',async()=>{
 const h=controller(ready()),cash=summary(h.state).cashCents;await h.driver.act('preview-route',{dataset:{index:'2'}});assert.equal(h.state.coachRoute.index,1);const expected=h.driver.dump().routePreview.plan;
 await Promise.all([h.driver.confirmRoute(),h.driver.confirmRoute()]);assert.equal(h.state.coachRoute.index,2);assert.equal(h.state.coachRoute.monthlyCents,expected.monthlySaveCents);assert.equal(h.state.coachRoute.prob,expected.prob);assert.equal(h.driver.dump().goalScreen,'execution');assert.equal(h.calls.filter(c=>c.path==='commit').length,1);assert.equal(summary(h.state).cashCents,cash);assert.equal(h.state.transactions.length,0);assert.equal(h.dialogs.length,0);
});
test('杠杆调整同样先预览；返回不改目标，确认后目标和方案一起保存',async()=>{
 const h=controller(ready()),before=JSON.stringify(h.state);await h.driver.act('choose-adjusted-route',{dataset:{kind:'months',index:'1'}});h.driver.render();assert.match(h.mount.innerHTML,/18个月/);assert.equal(JSON.stringify(h.state),before);
 await h.driver.act('return-routes');assert.equal(h.state.goal.months,12);
 await h.driver.act('choose-adjusted-route',{dataset:{kind:'months',index:'1'}});await h.driver.confirmRoute();assert.equal(h.state.goal.months,18);assert.equal(h.state.coach.incomeNum,2000);assert.equal(h.driver.dump().goalScreen,'execution');assert.equal(h.dialogs.length,0);
});
test('其他页面修改预算后，服务端拒绝旧预览；重新预览后可确认',async()=>{
 const h=controller(ready());await h.driver.act('preview-route',{dataset:{index:'2'}});
 const p=await h.api('prepare',{type:'profile',args:{income:'2200',expense:'1500',emergency:'0'}});await h.api('commit',{id:p.id,confirm:true});
 await assert.rejects(h.driver.confirmRoute(),/资料已变化/);assert.equal(h.state.coachRoute.index,1);assert.equal(h.driver.dump().goalScreen,'route-preview');
 await h.driver.act('return-routes');await h.driver.act('preview-route',{dataset:{index:'2'}});await h.driver.confirmRoute();assert.equal(h.state.coachRoute.index,2);
});
test('预览的月、周、日额度来自同一执行计划；模拟只读且不同方案有依据',()=>{
 const s=ready(),data={state:s,summary:summary(s)},before=JSON.stringify(s),previews=[0,1,2].map(i=>buildRoutePreview(data,i));
 assert.ok(previews[0].plan.monthlySaveCents>previews[1].plan.monthlySaveCents);assert.ok(previews[1].plan.monthlySaveCents>previews[2].plan.monthlySaveCents);
 for(const preview of previews){const p=preview.plan;assert.equal(p.incomeCents,p.livingCents+p.monthlySaveCents+p.bufferCents);assert.equal(p.bufferCents,p.emergencyFillCents+p.longTermReserveCents+p.remainingBufferCents);assert.equal(p.weeklyCents,Math.floor(p.monthlyFlexibleCents/(52/12)));assert.equal(p.dailyCents,Math.floor(p.monthlyFlexibleCents/30.4));assert.match(routePreviewPage(preview),/不是个人真实成功概率/);}
 assert.equal(JSON.stringify(s),before);assert.throws(()=>buildRoutePreview(data,-1),/已有方案/);
});
test('紧凑推荐条位于输入框上方、可点击；空白发送不绕过页面确认',async()=>{
 const h=controller();await h.driver.chat('我要6个月攒1000元');h.driver.render();const html=h.mount.innerHTML;
 assert.ok(html.indexOf('钱程推荐下一步：')<html.indexOf('<form id="chatForm"'));assert.equal((html.match(/钱程推荐下一步：/g)||[]).length,1);assert.match(html,/data-act="follow-recommendation"/);
 const n=h.calls.filter(c=>c.path==='commit').length;await h.driver.sendChatInput('   ');assert.equal(h.calls.filter(c=>c.path==='commit').length,n);assert.equal(h.state.goal,null);assert.match(h.driver.dump().messages.filter(x=>x.who==='user').at(-1).text,/核对目标/);
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');assert.match(css,/@media\(max-width:900px\) and \(max-height:420px\)/);assert.match(css,/#chat:not\(\.chat-expanded\)\{height:153px\}/);assert.match(css,/recommendation-changed/);
 assert.doesNotMatch(recommendationStrip('<script>x</script>'),/<script>/);assert.doesNotMatch(goalEditor({name:'"><script>x</script>'}),/<script>/);
});
test('目标保存失败保留页面草稿，可重新确认；不会报成功或连弹',async()=>{
 const h=controller();await h.driver.chat('我要6个月攒1000元');const draft=h.driver.dump().goalReview;h.driver.setApi((path,args)=>path==='commit'?Promise.reject(Error('网络失败')):h.api(path,args));
 await assert.rejects(h.driver.commitInlineGoal(),/网络失败/);assert.equal(h.state.goal,null);assert.deepEqual(h.driver.dump().goalReview,draft);assert.equal(h.dialogs.length,0);
 h.driver.setApi(h.api);await h.driver.commitInlineGoal();assert.equal(h.state.goal.targetCents,100000);assert.equal(h.driver.dump().goalScreen,'steps');
});

test('实际HTTP与前端控制器联调：目标、虚构身份、条件核对、预览返回和确认执行',async()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'qiancheng-v21-')),child=spawn(process.execPath,['server.mjs','--port','0'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,DATA_DIR:dir,BIGMODEL_API_KEY:'',BIGMODEL_MODEL:'',COOKIE_SECURE:'0',PUBLIC_ORIGIN:''}});
 try{
  const base=await new Promise((res,rej)=>{let logs='';const timer=setTimeout(()=>rej(Error('startup timed out')),5000);child.stdout.on('data',b=>{logs+=b;const m=logs.match(/localhost:(\d+)/);if(m){clearTimeout(timer);res('http://127.0.0.1:'+m[1]);}});child.on('error',rej);child.on('exit',c=>rej(Error('server exited '+c)));});
  const guest=await fetch(base+'/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),cookie=guest.headers.get('set-cookie').split(';')[0];let csrf='';
  async function api(path,body){const r=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':csrf},body:body===undefined?undefined:JSON.stringify(body)}),result=await r.json();if(!r.ok)throw Error(result.error);return result;}
  const state=await api('state');csrf=state.csrf;const h=controller();h.driver.setView(state);h.driver.setApi(api);
  await h.driver.chat('我要12个月攒6000元');assert.equal((await api('state')).state.goal,null);assert.equal(h.driver.dump().goalScreen,'goal-review');await h.driver.commitInlineGoal();assert.equal(h.driver.dump().goalScreen,'steps');
  await h.driver.act('persona',{dataset:{persona:'student'}});assert.equal((await api('state')).state.coach,null);assert.equal(h.driver.dump().goalScreen,'profile-review');await h.driver.sendChatInput('');assert.equal(h.driver.dump().goalScreen,'routes');
  const before=await api('state');assert.equal(before.state.openingCents,200000);assert.equal(before.state.coach.incomeNum,2000);assert.equal(before.state.coachRoute??null,null);
  await h.driver.act('preview-route',{dataset:{index:'1'}});assert.deepEqual((await api('state')).state,before.state);await h.driver.act('return-routes');assert.deepEqual((await api('state')).state,before.state);
  await h.driver.act('preview-route',{dataset:{index:'1'}});await h.driver.confirmRoute();const after=await api('state');assert.equal(after.state.coachRoute.index,1);assert.equal(after.summary.cashCents,before.summary.cashCents);assert.equal(h.driver.dump().goalScreen,'execution');assert.equal(h.dialogs.length,0);
  await h.driver.act('quote-message',{dataset:{id:'0'}});await h.driver.chat('这段话是什么意思？');assert.match(h.driver.dump().messages.at(-1).text,/当前未得到模型|当前没有得到模型|当前模型没有返回/);assert.deepEqual((await api('state')).state,after.state);assert.ok(h.driver.dump().messages.filter(x=>x.who==='user').at(-1).quote);
 }finally{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}rmSync(dir,{recursive:true,force:true});}
});

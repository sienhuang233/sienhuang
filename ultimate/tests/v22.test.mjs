import test from 'node:test';
import assert from 'node:assert/strict';
import {controller} from './helpers/controller.mjs';
import {initial,apply,summary,month} from '../lib/domain.mjs';
import {plan} from '../lib/agent.mjs';
import {personas,profileReview} from '../public/coach-flow-ui.mjs';
import {goalSteps} from '../public/goal-page-ui.mjs';
import {coachResult} from '../public/coach-ui.mjs';
import {goalExecution} from '../public/plan-ui.mjs';
import {coachScenario} from '../public/engines/coach-scenario.mjs';
import {analyzeBills} from '../public/engines/bill-analysis.mjs';
const change=(s,type,args={})=>apply(structuredClone(s),type,args).state;
const view=s=>({state:s,summary:summary(s)});
const student={place:'武汉',city:2,home:3,job:6,studentWork:'none',commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:2000,rent:0,leisure:400,extraAmt:0,opening:2000};
const ready=()=>change(change(change(initial(),'goal',{target:'5000',months:8}),'coach',student),'coach_route',{index:1});

test('个人信息只填一次；已记录卡可返回完整收集界面，切换不改资料',async()=>{
 const s=ready(),before=JSON.stringify(s),h=controller(s);await h.driver.act('coach-outcome');h.driver.render();
 assert.match(h.mount.innerHTML,/✓ 已记录个人信息/);assert.match(h.mount.innerHTML,/无兼职、无实习/);assert.doesNotMatch(h.mount.innerHTML,/data-persona=/);
 await h.driver.act('edit-profile-collection');h.driver.render();assert.match(h.mount.innerHTML,/完整问卷/);assert.equal(h.driver.dump().profileCollectEditing,true);assert.equal(h.driver.dump().agentContext.profileDraft.incomeNum,2000);
 await h.driver.act('finish-profile-collection');h.driver.render();assert.match(h.mount.innerHTML,/✓ 已记录个人信息/);assert.equal(JSON.stringify(h.state),before);
 const demo={...s,demo:true};assert.match(goalSteps(view(demo),true),/深圳职场新人/);assert.match(goalSteps(view(demo),true),/武汉在校生/);
});
test('自然语言先补齐并确认金额期限，再收集条件；完整草稿自动展示确认页',async()=>{
 const h=controller();await h.driver.chat('我想攒5000元');h.driver.render();assert.equal(h.driver.dump().goalScreen,'steps');assert.equal(h.driver.dump().coachInterview,null);assert.equal(h.state.goal,null);assert.match(h.driver.dump().messages.at(-1).text,/多久/);
 await h.driver.chat('8个月');h.driver.render();assert.equal(h.driver.dump().goalScreen,'goal-review');assert.equal(h.driver.dump().coachInterview,null);assert.equal(h.state.goal,null);
 await h.driver.commitInlineGoal();assert.equal(h.driver.dump().goalScreen,'steps');await h.driver.act('persona',{dataset:{persona:'student'}});h.driver.render();
 assert.equal(h.driver.dump().goalScreen,'profile-review');assert.equal(h.driver.dump().coachInterview.draft.studentWork,'none');assert.equal(h.state.coach,null);assert.match(h.mount.innerHTML,/条件没问题，计算三种储蓄方案/);
 await h.driver.act('confirm-coach-profile');h.driver.render();assert.equal(h.driver.dump().goalScreen,'routes');assert.equal(h.state.coach.studentWork,'none');assert.equal(h.state.openingCents,200000);assert.equal(h.dialogs.length,0);
});
test('武汉学生不假设兼职实习或失业；仍有支出不确定性且三种路线按真实结余区分',()=>{
 const s=ready(),f=coachScenario(view(s)),html=coachResult(view(s),null,true),draft={draft:student,analysis:[],proof:{}};
 assert.match(personas.student,/无兼职、无实习/);assert.match(profileReview(s,draft),/不使用失业、实习中断或工资增长假设/);assert.match(html,/家庭生活费按已确认金额固定/);
 assert.ok(f.result.plans[0].save>f.result.plans[1].save);assert.ok(f.result.plans[1].save>f.result.plans[2].save);assert.ok(f.result.plans[0].p50<f.params.saved+f.result.plans[0].save*f.params.months);
});
test('杠杆默认展开，每项一个预览；改变条件展示三种方案，返回不保存',async()=>{
 const h=controller(ready()),before=JSON.stringify(h.state);await h.driver.act('coach-outcome');h.driver.render();let html=h.mount.innerHTML;
 assert.match(html,/<details class="card goal-levers" open>/);const leverArea=html.slice(html.indexOf('goal-levers'));assert.equal((leverArea.match(/data-act="lever"/g)||[]).length,3);assert.doesNotMatch(leverArea,/data-act="choose-adjusted-route"/);
 await h.driver.act('lever',{dataset:{kind:'months',label:'多给目标6个月'}});h.driver.render();html=h.mount.innerHTML;assert.match(html,/目标（预览，未保存）/);assert.match(html,/14个月/);assert.equal((html.match(/data-act="choose-adjusted-route"/g)||[]).length,3);assert.equal(JSON.stringify(h.state),before);
 await h.driver.act('choose-adjusted-route',{dataset:{kind:'months',index:'2'}});assert.equal(JSON.stringify(h.state),before);await h.driver.act('return-routes');await h.driver.act('reset-lever');assert.equal(JSON.stringify(h.state),before);assert.equal(h.dialogs.length,0);
});
test('难以实现的目标展示实际模拟中位数与缺口，不再把建议金额粗舍入成目标',()=>{
 const s=ready(),f=coachScenario(view(s)),html=coachResult(view(s),null,true);assert.equal(f.result.natural.sim.prob,0);assert.ok(f.result.natural.sim.p50<5000);assert.match(html,/期末资金中位数 ¥[\d,]+\.\d{2}，距目标约差 ¥[\d,]+\.\d{2}/);assert.doesNotMatch(html,/更接近的金额约 ¥5,000/);
});
test('推荐转账用途时切到人情页面；关联确认与取消均内联，不重复记现金',async()=>{
 let s=ready();s.demo=true;s=change(s,'sample_bill');const h=controller(s),cash=summary(s).cashCents;
 await h.driver.act('review-sample');h.driver.render();assert.equal(h.driver.dump().page,'debts');assert.match(h.mount.innerHTML,/先核对这笔转账的用途/);assert.equal(h.dialogs.length,0);
 await h.driver.act('purpose-advance',{dataset:{id:'sample-loan'}});h.driver.render();assert.match(h.mount.innerHTML,/归还日期（由你填写/);assert.equal(h.state.cases.length,0);assert.equal(summary(h.state).cashCents,cash);
 await h.driver.act('people-back');h.driver.render();assert.equal(h.driver.dump().pending,null);assert.match(h.mount.innerHTML,/先核对这笔转账的用途/);assert.equal(h.state.cases.length,0);
 await h.driver.act('purpose-advance',{dataset:{id:'sample-loan'}});await h.driver.chat('三天后');await h.driver.chat('本人期望');await h.driver.commitPending();h.driver.render();assert.equal(h.state.cases.length,1);assert.equal(summary(h.state).cashCents,cash);assert.equal(summary(h.state).receivableCents,10000);assert.equal(h.dialogs.length,0);
 await h.driver.act('due',{dataset:{id:h.state.cases[0].id}});h.driver.render();assert.match(h.mount.innerHTML,/调整剩余款项的归还日期/);assert.equal(h.dialogs.length,0);await h.driver.act('close');h.driver.render();assert.equal(h.driver.dump().peoplePanel,null);assert.match(h.mount.innerHTML,/模拟付款／借还/);
});
test('取消推进模拟时间不改日期，确认后才推进，始终使用页面确认',async()=>{
 const s=ready();s.demo=true;const h=controller(s),cash=summary(s).cashCents;await h.driver.prepare('advance_time',{days:7});h.driver.render();assert.match(h.mount.innerHTML,/是否将模拟时间从/);assert.equal(h.state.simulatedDate,s.simulatedDate);await h.driver.act('people-back');assert.equal(h.state.simulatedDate,s.simulatedDate);
 await h.driver.prepare('advance_time',{days:7});const expected=h.driver.dump().pending.result.toDate;await h.driver.commitPending();assert.equal(h.state.simulatedDate,expected);assert.equal(summary(h.state).cashCents,cash);assert.equal(h.dialogs.length,0);
});
test('账单行动保留选定时比例，另显当前前提比例；行动打卡不加现金',()=>{
 let s=ready();const selected=s.coachRoute.initialProb;s.demo=true;s=change(s,'sample_bill');const op=analyzeBills(s,month()).opportunities[0],cash=summary(s).cashCents;
 s=change(s,'bill_plan',{period:month(),opportunity:op.id,reduction:String(op.suggestedCents/100),monthlyConfirmed:true});assert.equal(s.coachRoute.initialProb,selected);assert.equal(summary(s).cashCents,cash);
 let html=goalExecution(view(s));assert.match(html,new RegExp('<strong>'+Math.round(selected*100)+'%</strong>'));assert.match(html,/当前资金与已采纳改进前提下的模拟比例/);assert.match(html,/现金没有提前增加/);
 s=change(s,'weekly_checkin',{amount:'100',completedActionIds:[s.planActions[0].id]});assert.equal(s.coachRoute.initialProb,selected);assert.equal(summary(s).cashCents,cash);
});
test('模型越阶段的介绍不污染当前缺期限追问或条件确认',async()=>{
 const key=process.env.BIGMODEL_API_KEY,model=process.env.BIGMODEL_MODEL,fetcher=globalThis.fetch;
 try{process.env.BIGMODEL_API_KEY='test-only';process.env.BIGMODEL_MODEL='test-model';globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({intent:'goal',answer:'收到目标，接下来补充收入和房租。'})}}]})});
 const r=await plan(initial(),'我想攒5000元',{});assert.equal(r.mode,'ai');assert.equal(r.next,'goal_followup');assert.doesNotMatch(r.reply,/收入和房租/);assert.equal(r.interview,undefined);assert.equal(r.proposal,null);
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({intent:'other',answer:'收到，我已记录你的基本生活情况。'})}}]})});
 const s=change(initial(),'goal',{target:'5000',months:8}),p=await plan(s,personas.student,{intent:'coach_profile'});assert.equal(p.interview.ready,true);assert.match(p.reply,/在页面核对|条件草稿已显示在页面/);assert.doesNotMatch(p.reply,/我已记录你的基本生活情况/);assert.equal(s.coach,null);
 }finally{globalThis.fetch=fetcher;for(const [k,v] of [['BIGMODEL_API_KEY',key],['BIGMODEL_MODEL',model]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});

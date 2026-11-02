import {subscriptionEvidence} from '../public/engines/subscriptions.mjs';
import {summarizeWeek,sampleWeekRows,advancePreview,weeklyFeedback} from '../public/engines/weekly.mjs';
import {derive} from '../public/engines/goal.mjs';
import {executionPlan,weekStart,reminderOptions} from '../public/engines/plan.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {classify,setRules} from '../public/engines/classifier.mjs';
import {makeOffsetPlan,applyOffsetPlan,undoOffsetBatch,remainingCents} from './offset.mjs';
import {sampleRows,studentRows} from './sample-bill.mjs';
import {billPlanPreview,billReviewBasis,instructionFor} from '../public/engines/bill-analysis.mjs';
import {coachScenario,routeBasis,adjustedGoal} from '../public/engines/coach-scenario.mjs';
export const uid=()=>randomUUID();
export const day=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
export const month=()=>day().slice(0,7);
export function cents(v,allowZero=false){const s=String(v??'').trim().replace(/[¥￥,，\s元]/g,'');if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('金额须为非负数字，最多两位小数');const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>10000000000||(!allowZero&&n===0))throw Error('金额超出范围');return n;}
export const fmt=n=>(n/100).toFixed(2);
export function date(s){if(!/^\d{4}-\d\d-\d\d$/.test(s||'')||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('日期无效');return s;}
export function text(v,max=80){return String(v??'').trim().slice(0,max);}
export function initial(){return {version:1,openingCents:0,openingKnown:false,transactions:[],cases:[],offsets:[],mails:[],reservations:[],subscriptions:[],goal:null,coach:null,profile:{incomeCents:null,expenseCents:null,emergencyCents:0},contacts:[],rules:[],checkins:[],plans:[],demo:false,simulatedDate:null};}
export function summary(s,period=month()){
 const tx=s.transactions.filter(t=>!t.duplicateOf&&!t.excluded),periodTx=tx.filter(t=>t.date.startsWith(period));
 const sum=(a,k)=>a.reduce((v,t)=>v+t[k],0);
 const expense=periodTx.filter(t=>t.kind==='expense'),income=periodTx.filter(t=>t.kind==='income');
 const cash=s.openingKnown?s.openingCents+tx.reduce((v,t)=>v+(t.direction==='in'?t.cents:t.direction==='out'?-t.cents:0),0):null;
 const reserved=sum(s.reservations,'cents'),receive=s.cases.filter(c=>c.kind!=='借入').reduce((v,c)=>v+remainingCents(c),0),owe=s.cases.filter(c=>c.kind==='借入').reduce((v,c)=>v+remainingCents(c),0);
 const available=cash==null?null:Math.max(0,cash-reserved-s.profile.emergencyCents-owe);
 const pending=periodTx.filter(t=>t.kind==='unknown');const saved=s.reservations.filter(r=>r.goalId===s.goal?.id).reduce((v,r)=>v+r.cents,0);
 const expected=s.profile.expenseCents==null?null:Math.max(0,s.profile.expenseCents-(s.profile.expenseReductionCents||0)),monthly=s.profile.incomeCents==null||expected==null?null:s.profile.incomeCents-expected;
 const target=s.goal?Math.max(0,s.goal.targetCents-saved):null;
 return {period,cashCents:cash,availableCents:available,expenseCents:sum(expense,'cents'),incomeCents:sum(income,'cents'),pendingCents:sum(pending,'cents'),reservedCents:reserved,receivableCents:receive,payableCents:owe,savedCents:saved,monthlyCents:monthly,requiredCents:s.goal?Math.ceil(target/s.goal.months):null,gapCents:s.goal&&monthly!=null?Math.max(0,Math.ceil(target/s.goal.months)-monthly):null,count:periodTx.length,duplicates:s.transactions.filter(t=>t.duplicateOf).length,byCategory:expense.reduce((a,t)=>(a[t.cat]=(a[t.cat]||0)+t.cents,a),{})};
}
const demoContacts=()=>[{id:'c-wang',name:'小王',phone:'13800000001',note:'演示同学'},{id:'c-li',name:'小李',phone:'13800000002',note:'演示同学'}];
const studentCoach=()=>({place:'武汉',city:2,home:3,job:6,studentWork:'none',commute:0,rel:0,risk:0,time:0,incomeNum:2000,rent:0,leisure:400,extraAmt:0,extraName:'',extraSave:0,kids:[]});
export function demoState(){
 const s=initial();s.demo=true;s.openingKnown=true;s.openingCents=200000;s.coach=studentCoach();s.profile.incomeCents=200000;s.contacts=demoContacts();
 s.goal={id:'g-demo',name:'学习设备储备',targetCents:600000,months:6};
 return apply(s,'sample_bill',{}).state;
}
function validateLivingBudget(s){
 if(!s.coach||s.profile.expenseCents==null)return;
 const c=s.coach,d=derive({...c,extra:c.extraAmt?[{amt:c.extraAmt}]:[],expenseOverride:null});
 if(s.profile.expenseCents<Math.round(d.rigid*100))throw Error('完整月度总支出不能低于房租和家庭固定责任，请核对金额');
}

const coachFields={city:4,home:4,job:7,commute:3,rel:4,risk:3,time:3,kidStage:5,school:3};
function coachInput(a){const out={};for(const [key,count] of Object.entries(coachFields)){const n=Number(a[key]??0);if(!Number.isInteger(n)||n<0||n>=count)throw Error('目标教练选项无效：'+key);out[key]=n;}
 for(const key of ['incomeNum','rent','leisure','extraAmt','extraSave']){if(a[key]===undefined||a[key]===''){out[key]=null;continue;}const n=cents(a[key],true);out[key]=n/100;}
 if(out.incomeNum===null)throw Error('请填写月收入；不清楚时先填真实的生活费或可确认的区间中值');
 out.studentWork=['none','parttime','internship'].includes(a.studentWork)?a.studentWork:'unknown';out.place=text(a.place,50);out.extraName=text(a.extraName,40);out.kids=Number(a.kidCount)===1?[{stage:out.kidStage,school:out.school}]:[];
 if(![0,1].includes(Number(a.kidCount??0)))throw Error('孩子数量选项无效');return out;}
export function importRows(s,rows,source){
 if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw Error('每批导入 1—10000 笔');
 let added=0,skipped=0,possible=0;setRules(s.rules);
 for(const raw of rows){
  const t={id:uid(),date:date(raw.date),time:text(raw.time||'00:00:00',8),merchant:text(raw.merchant),desc:text(raw.desc,160),direction:raw.direction,cents:cents(raw.amount),externalId:text(raw.externalId,100),source:text(source||'import',50),rawType:text(raw.rawType),rawCat:text(raw.rawCat),note:text(raw.note,160),simulated:false};
  if(!['in','out','neutral'].includes(t.direction))throw Error('账单收支方向缺失，不能猜测');
  const cls=classify(t);t.cat=cls.cat;t.catWhy=cls.why;t.kind=t.direction==='neutral'||/零钱通|余额宝|理财通|提现|信用卡还款/.test(t.rawType)?'neutral':t.direction==='in'?(/退款/.test(t.rawType+' '+t.desc)?'refund':'unknown_in'):(cls.cat==='person'||cls.cat==='unk'?'unknown':'expense');
  const identity=[t.source,t.externalId||[t.date,t.time,t.merchant,t.desc,t.cents,t.direction,raw.occurrence||0].join('|')].join('|');t.importKey=createHash('sha256').update(identity).digest('hex');
  if(s.transactions.some(x=>x.importKey===t.importKey)){skipped++;continue;}
  const other=s.transactions.find(x=>!x.duplicateOf&&x.date===t.date&&x.time===t.time&&x.merchant===t.merchant&&x.cents===t.cents&&x.direction===t.direction);
  if(other){t.duplicateOf=other.id;possible++;}
  s.transactions.push(t);added++;
 }
 return {added,skipped,possible};
}
export function billBasis(s){return JSON.stringify(s.transactions.map(t=>[t.id,t.cents,t.kind,t.cat,!!t.excluded,t.duplicateOf||'',t.caseId||'']));}
export function risk(s,type,args){
 if(['purchase','card_lock'].includes(type))return 'red';
 if(['transfer','repay'].includes(type)){
  const todayCents=s.transactions.filter(t=>t.executedDay===day()&&t.direction==='out'&&t.simulated).reduce((v,t)=>v+t.cents,0);
  return todayCents+cents(args.amount)>100000?'red':'yellow';
 }
 return 'yellow';
}
const getTx=(s,id)=>{const t=s.transactions.find(t=>t.id===id);if(!t||t.duplicateOf||t.excluded)throw Error('交易不存在或尚未完成去重核对');return t;};
const getCase=(s,id)=>{const c=s.cases.find(c=>c.id===id);if(!c)throw Error('往来记录不存在');return c;};
function makeCase(s,{name,amount,kind,transactionId,dueDate='',dueType='none'}){if(!text(name))throw Error('请填写对方姓名');const c={id:uid(),purpose:text(s.transactions.find(t=>t.id===transactionId)?.desc||kind,100),date:s.transactions.find(t=>t.id===transactionId)?.date||day(),recipient:text(name,40),amount:amount/100,paid:0,offset:0,kind,confirmed:true,transactionId,dueDate:dueDate?date(dueDate):'',dueType:['agreed','desired'].includes(dueType)?dueType:'none',events:[{at:new Date().toISOString(),text:'用户确认建立往来记录'}],reminderDays:7};if(c.dueDate&&c.dueType==='none')throw Error('请区分双方约定或个人期望日期');s.cases.push(c);s.peopleSceneCompleted=true;return c;}
function completePeopleJourney(s,c,reason,now){s.peopleJourneyCompleted=true;if(c){c.experienceCompletedAt=now;c.experienceEndReason=reason;}}
export function apply(s,type,a){
 if(s.cases.length)s.peopleSceneCompleted=true;
 const now=new Date().toISOString();let result={message:'已保存'};
 if(type==='demo'){if(s.transactions.length||s.cases.length||s.openingKnown)throw Error('示例仅可载入空会话，请免注册新开体验');return {state:demoState(),result:{message:'已载入虚构演示数据'}};}
 if(type==='guided_demo'){if(s.transactions.length||s.cases.length||s.openingKnown)throw Error('引导案例只可载入空账户');s.demo=true;s.contacts=demoContacts();return {state:s,result:{message:'已建立独立虚构账户；请在生活条件中确认存款起点，不预填现金或模拟持有'}};}
 if(type==='sample_bill'){
  if(s.transactions.some(t=>t.source==='demo'))throw Error('这份模拟账单已经载入，不会重复计算');
  if(s.transactions.length&&!s.demo)throw Error('真实账户不能混入虚构账单；请使用独立的演示账户');
  const seeded=!s.openingKnown;
  if(seeded){s.openingKnown=true;s.openingCents=200000;s.contacts=demoContacts();}
  if(!s.coach){s.coach=studentCoach();s.profile.incomeCents=200000;}
  s.demo=true;
  if(s.coach?.job===6&&s.coach?.home===3){
   const rows=studentRows.map((r,i)=>({id:'sample-'+i,externalId:'STUDENT-'+i,source:'demo',date:month()+'-'+r[0],time:r[1]+':00',merchant:r[2],desc:r[3],cents:r[4]*100,direction:r[6]||'out',kind:r[6]==='in'?'income':'expense',cat:r[5],catWhy:'武汉宿舍学生的明确虚构月度样本；不是个人实际账单',simulated:true}));
   s.transactions.push(...rows,{id:'sample-loan',source:'demo',externalId:'STUDENT-LOAN',date:month()+'-23',time:'12:00:00',merchant:'小王',desc:'同学聚餐垫付？用途待核对',cents:10000,direction:'out',kind:'unknown',cat:'person',catWhy:'虚构垫付线索，须本人确认',simulated:true});
   for(const row of studentRows.filter(x=>x[5]==='subs'))s.subscriptions.push({id:uid(),name:row[2],status:'active',simulated:true,source:'demo',at:now});
   const spent=rows.filter(t=>t.direction==='out').reduce((n,t)=>n+t.cents,0);
   return {state:s,result:{message:`已载入${rows.length+1}笔武汉学生虚构账单：本月生活费入账2000元、消费${fmt(spent)}元、待核对转账100元；期初现金沿用已确认的${fmt(s.openingCents)}元，不重复算收入`}};
  }
  s.transactions.push(...sampleRows.map((r,i)=>({id:`sample-${i}`,externalId:`SAMPLE-${i}`,source:'demo',date:month()+'-'+r[0].slice(3),time:r[1]+':00',merchant:r[2],desc:r[3],cents:r[4]*100,direction:'out',kind:'expense',cat:r[5]==='other'&&r[3].includes('妈妈')?'person':r[5],catWhy:'原钱包体检的修订虚构样本人工标注；真实导入才使用自动分类',simulated:true})),{id:'sample-loan',source:'demo',externalId:'SAMPLE-LOAN',date:month()+'-23',time:'12:00:00',merchant:'小王',desc:'聚餐垫付？用途待核对',cents:60000,direction:'out',kind:'unknown',cat:'person',catWhy:'虚构额外转账，须由用户确认是否垫付',simulated:true});
  for(const r of sampleRows.filter(x=>x[5]==='subs'&&/连续包月/.test(x[3]))){if(!s.subscriptions.some(x=>x.name===r[2]))s.subscriptions.push({id:uid(),name:r[2],status:'active',simulated:true,source:'demo',at:now});}
  const spent=sampleRows.reduce((v,r)=>v+r[4],0);
  return {state:s,result:{message:`已载入${sampleRows.length}笔虚构消费（${spent}元）和1笔待核对转账（600元）${seeded?'，期初现金为2000元（未预填理财持有）':''}；订阅扣费已标为演示中的在订候选，真实状态仍需核实`}};
 }
 if(type==='advance_time'){
  const preview=advancePreview(s,a.days);
  if(a.fromDate&&a.fromDate!==preview.fromDate||a.toDate&&a.toDate!==preview.toDate)throw Error('模拟日期已变化，请重新预览并确认');
  s.simulatedDate=preview.toDate;
  return {state:s,result:{message:`模拟日期已推进${preview.days}天，当前是${preview.toDate}。未发送真实提醒。`,...preview}};
 }
 if(type==='import'){if(s.demo||s.transactions.some(t=>t.simulated))throw Error('虚构资料与真实账单不能混用，请免注册新开独立会话');result=importRows(s,a.rows,a.source);}
 else if(type==='profile'){
  for(const x of s.planActions||[])x.active=false;
  s.profile={incomeCents:a.income===''||a.income==null?null:cents(a.income,true),expenseCents:a.expense===''||a.expense==null?null:cents(a.expense,true),emergencyCents:cents(a.emergency||'0',true)};
  if(s.coach&&s.profile.incomeCents!=null)s.coach.incomeNum=s.profile.incomeCents/100;
  if(a.opening!==''&&a.opening!=null){s.openingCents=cents(a.opening,true);s.openingKnown=true;}
  validateLivingBudget(s);
 }
 else if(type==='coach'){
  if(!s.goal)throw Error('先设定目标愿景');const profile=coachInput(a);
  if((!s.openingKnown||s.demo&&!s.transactions.length)&&a.opening!==''&&a.opening!=null){if(s.demo&&!s.transactions.length)s.reservations=s.reservations.filter(x=>x.id!=='demo-holding');s.openingCents=cents(a.opening,true);s.openingKnown=true;}
  profile.extraSave=profile.extraSave??s.coach?.extraSave??0;s.coach=profile;s.profile.incomeCents=Math.round(profile.incomeNum*100);
  validateLivingBudget(s);
  // 原教练的生活成本是假设区间，不把其中位数伪装成已确认的账单支出。
  result={message:'处境与假设已保存；模拟达标频率将在当前账本上重新计算'};
 }
 else if(type==='bill_review'){
  const period=a.period||month();s.billReviewBasis=billReviewBasis(s,period);s.billAnalysisCompleted=true;s.billDecisions=s.billDecisions||{};s.billDecisions[period]={choice:'keep',at:now};
  if(a.skipSubscriptions===true)s.optionalSubscriptionReviewSkippedFor=s.billReviewBasis;
  result={message:'已记录本期消费分析已核对；预算与现金没有变化'};
 }
 else if(type==='bill_plan'){
  if(a.monthlyConfirmed!==true)throw Error('先核对这项支出是否适合作为每月预算调整');
  const preview=billPlanPreview({state:s,summary:summary(s)},a.period||month(),text(a.opportunity),cents(a.reduction));
  if(preview.needsProfile)throw Error('请先补齐目标、生活条件与现金起点');
  s.profile.expenseReductionCents=(s.profile.expenseReductionCents||0)+preview.reductionCents;
  s.billReviewBasis=preview.reviewBasis;s.billAnalysisCompleted=true;s.calibrationBasis=billBasis(s);
  const action={id:uid(),goalId:s.goal.id,title:preview.opportunity.title,instruction:text(a.instruction,160)||instructionFor(preview.opportunity,preview.reductionCents),opportunity:preview.opportunity.id,period:a.period||month(),reductionCents:preview.reductionCents,beforeExpenseCents:preview.beforeExpenseCents,afterExpenseCents:preview.afterExpenseCents,beforeProb:preview.beforeProb,afterProb:preview.afterProb,routeBeforeProb:preview.routeBeforeProb,routeAfterProb:preview.routeAfterProb,reviewBasis:preview.reviewBasis,transactionIds:preview.opportunity.transactionIds,active:true,at:now};
  s.planActions=s.planActions||executionPlan({state:s,summary:summary(s)})?.actions||[];s.planActions.push(action);s.budgetPlan=action;s.billDecisions=s.billDecisions||{};s.billDecisions[action.period]={choice:'accepted',at:now};
  if(s.coachRoute){const picked=s.coachRoute.index,sum=summary(s),forecast=coachScenario({state:s,summary:sum}),route=forecast.result.plans[picked];s.coachRoute={...s.coachRoute,initialProb:s.coachRoute.initialProb??preview.routeBeforeProb,initialGoal:s.coachRoute.initialGoal||{...s.goal},monthlyCents:Math.round(route.save*100),prob:route.prob,basis:routeBasis(s,sum.availableCents),updatedAt:now};}
  result={message:'行动已加入目标教练的每周打卡；新比例以持续执行为前提，现金没有增加',plan:s.budgetPlan};
 }
 else if(type==='calibrate'){
  if(!s.coach)throw Error('先补齐生活条件');
  if(a.leisure!==''&&a.leisure!=null)s.coach.leisure=cents(a.leisure,true)/100;
  if(a.expense!==''&&a.expense!=null){s.profile.expenseCents=cents(a.expense,true);s.profile.expenseReductionCents=0;for(const x of s.planActions||[])x.active=false;}
  validateLivingBudget(s);
  s.calibrationBasis=billBasis(s);result={message:'已保存你确认的账单预算；接下来重新比较路线，不自动增加现金'};
 }
 else if(type==='coach_adjust'){
  if(a.basis!==routeBasis(s,summary(s).availableCents))throw Error('资料已变化，请重新预览后再确认');
  const index=Number(a.index);if(!Number.isInteger(index)||index<0||index>2)throw Error('请选择已有路线');
  const revised=adjustedGoal(s,a.kind);s.goal=revised.goal;s.coach.extraSave=revised.extraSave;
  const forecast=coachScenario({state:s,summary:summary(s)}),route=forecast.result.plans[index];
  s.coachRoute={index,name:forecast.result.startingCovered?'现有资金已覆盖':route.name,monthlyCents:Math.round(route.save*100),prob:route.prob,initialProb:route.prob,initialGoal:{...s.goal},initialMonthlyCents:Math.round(route.save*100),basis:routeBasis(s,summary(s).availableCents),selectedAt:now};
  result={message:'已确认调整后的目标与路线，沿用已有个人处境；没有扣款',goal:s.goal,route:s.coachRoute};
 }
 else if(type==='long_term_plan'){
  const p=executionPlan({state:s,summary:summary(s)});if(!p)throw Error('请先选择目标路线');
  const monthlyCents=cents(a.monthly,true),horizonMonths=Number(a.horizonMonths||0);
  if(monthlyCents>p.bufferCents)throw Error('长期预留不能超过扣除生活与目标储蓄后的月度余量');
  if(![0,12,36,60,120].includes(horizonMonths))throw Error('请选择这笔闲钱独立的使用期限');
  s.longTermPlan={monthlyCents,horizonMonths,acknowledged:a.acknowledged===true,updatedAt:now};
  result={message:'长期预留已保存；没有购买产品、扣款或改变目标储蓄'};
 }
 else if(type==='coach_route'){
  if(a.basis!=null&&a.basis!==routeBasis(s,summary(s).availableCents))throw Error('资料已变化，请重新预览后再确认');
  const index=Number(a.index);if(!Number.isInteger(index)||index<0||index>2)throw Error('请选择已有路线');
  const sum=summary(s),forecast=coachScenario({state:s,summary:sum});if(!forecast)throw Error('请先补齐目标、现实条件与现金起点');
  const route=forecast.result.plans[index];s.coachRoute={index,name:forecast.result.startingCovered?'现有资金已覆盖':route.name,monthlyCents:Math.round(route.save*100),prob:route.prob,initialProb:route.prob,initialGoal:{...s.goal},initialMonthlyCents:Math.round(route.save*100),basis:routeBasis(s,sum.availableCents),selectedAt:now};result={message:'已选择'+route.name+'路线；未扣款，下一步用账单校准'};
 }
 else if(type==='goal'){const months=Number(a.months);if(!Number.isInteger(months)||months<1||months>360)throw Error('期限须为 1—360 个月');s.goal={id:s.goal?.id||uid(),name:text(a.name)||'储蓄目标',targetCents:cents(a.target),months};}
 else if(type==='classify'){
  const t=getTx(s,a.id);if(!['expense','income','neutral','unknown','unknown_in','refund'].includes(a.kind))throw Error('不支持的交易类型');if(t.caseId)throw Error('此交易已关联往来，不能直接改为消费');
  if(a.kind==='income'&&t.direction!=='in')throw Error('收入必须关联入账流水');if(a.kind==='refund'&&t.direction!=='in')throw Error('退款必须关联入账流水');if(a.kind==='expense'&&t.direction==='in')throw Error('入账不可记为消费');
  t.kind=a.kind;t.cat=['food','transit','social','subs','shop','life','person','unk','other'].includes(a.cat)?a.cat:'unk';t.catWhy='用户核对确认';
  if(a.remember)s.rules.unshift({merchant:t.merchant,goods:t.desc.replace(/\d{6,}/g,'').replace(/[\s\-_()（）:：,，.。/*]/g,'').slice(0,24),scope:'goods',cat:t.cat});
 }
 else if(type==='duplicate'){const t=s.transactions.find(t=>t.id===a.id);if(!t?.duplicateOf)throw Error('无待核对重复记录');if(a.keep===true){delete t.duplicateOf;t.catWhy+='；用户确认是独立交易';}else{t.excluded=true;t.dedupConfirmed=true;}}
 else if(type==='link_loan'){
  const t=getTx(s,a.id);if(t.caseId)throw Error('该交易已关联，不可重复建账');const amount=cents(a.amount||fmt(t.cents));if(amount>t.cents)throw Error('待收金额不能超过该笔交易');
  const kind=t.direction==='in'?'借入':['借款','垫付','AA'].includes(a.kind)?a.kind:'垫付';if(t.direction==='neutral')throw Error('中性流水不能建立借还款');
  const c=makeCase(s,{name:a.name||t.merchant,amount,kind,transactionId:t.id,dueDate:a.dueDate,dueType:a.dueType});t.caseId=c.id;t.kind=t.direction==='in'?'borrow_in':'loan_out';
  // AA 支出拆分用同一原始交易的组成部分，不创建第二笔现金流。
  t.ownExpenseCents=t.cents-amount;if(t.ownExpenseCents){s.transactions.push({id:uid(),parentId:t.id,date:t.date,time:t.time,merchant:t.merchant,desc:'AA 本人份额（无额外现金流）',cents:t.ownExpenseCents,direction:'neutral',kind:'expense',cat:'social',simulated:t.simulated});}
 }
 else if(type==='transfer'){
  const amount=cents(a.amount),kind=['普通付款','借款','垫付','AA','借入'].includes(a.kind)?a.kind:'普通付款';const contact=s.contacts.find(c=>c.id===a.contactId);const name=contact?.name||text(a.name,40);if(!name)throw Error('收款人缺失');
  if(a.contactId&&!contact)throw Error('联系人不存在');const inb=kind==='借入',sum=summary(s);
  if(!inb&&(sum.availableCents==null||amount>sum.availableCents))throw Error('可用资金不足，或期初余额未知；预留资金与应还款不可挪用');
  const t={id:uid(),date:s.demo?s.simulatedDate||day():day(),time:new Date().toISOString().slice(11,19),merchant:name,desc:text(a.purpose)||kind,cents:amount,direction:inb?'in':'out',kind:inb?'borrow_in':kind==='普通付款'?'expense':'loan_out',cat:'other',simulated:true,executedDay:day()};
  if(kind!=='普通付款'){const owed=kind==='AA'?cents(a.receivableAmount??a.amount):amount;if(owed>amount)throw Error('AA对方份额不能超过整笔付款');const c=makeCase(s,{name,amount:owed,kind,transactionId:t.id,dueDate:a.dueDate,dueType:a.dueType});c.purpose=t.desc;c.date=t.date;t.caseId=c.id;if(kind==='AA'&&owed<amount){t.ownExpenseCents=amount-owed;s.transactions.push({id:uid(),parentId:t.id,date:t.date,time:t.time,merchant:name,desc:'AA 本人份额（无额外现金流）',cents:amount-owed,direction:'neutral',kind:'expense',cat:'social',simulated:true});}}
  s.transactions.push(t);s.peoplePracticeCompleted=true;result={message:'模拟交易完成，未发生真实转账',transactionId:t.id};
 }
 else if(type==='repay'){
  const c=getCase(s,a.id),amount=cents(a.amount);if(amount>remainingCents(c))throw Error('还款超过未结清金额');let t;
  if(a.transactionId){t=getTx(s,a.transactionId);if(t.caseId||t.cents!==amount||t.direction!==(c.kind==='借入'?'out':'in'))throw Error('还款流水金额、方向不符或已关联');}
  else {if(c.kind==='借入'){const sum=summary(s);if(sum.cashCents==null||sum.cashCents-sum.reservedCents-s.profile.emergencyCents<amount)throw Error('可用于还款的余额不足');}
   t={id:uid(),date:s.demo?s.simulatedDate||day():day(),time:'12:00:00',merchant:c.recipient,desc:'模拟还款',cents:amount,direction:c.kind==='借入'?'out':'in',simulated:true,executedDay:day()};s.transactions.push(t);}
  t.kind='repayment';t.caseId=c.id;c.paid=(Math.round(c.paid*100)+amount)/100;if(remainingCents(c)===0)completePeopleJourney(s,c,'repaid',now);c.events.unshift({at:now,text:`已确认${a.transactionId?'已有流水':'模拟'}还款 ${fmt(amount)} 元`});
 }
 else if(type==='offset'){const plan=makeOffsetPlan(s.cases,text(a.name).toLocaleLowerCase(),cents(a.amount));s=applyOffsetPlan({...s,ledger:[]},plan,uid(),now);delete s.ledger;const involved=s.cases.filter(c=>c.recipient.toLocaleLowerCase()===text(a.name).toLocaleLowerCase());if(involved.length&&involved.every(c=>remainingCents(c)===0))for(const c of involved)completePeopleJourney(s,c,'offset',now);result={message:'双方待收待还已抵消，现金余额不变'};}
 else if(type==='undo_offset'){s=undoOffsetBatch(s,a.id,now);}
 else if(type==='due_check'){const c=getCase(s,a.id);if(remainingCents(c)<=0)throw Error('该往来已结清');if(!['unpaid','verify'].includes(a.status))throw Error('请先核对是否到账');c.lastCheckDate=s.simulatedDate||day();c.checkStatus=a.status;c.events.unshift({at:now,text:a.status==='unpaid'?'本人核对：尚未到账，待选择后续安排':'本人选择亲自核实，未新增还款流水'});result={message:'已记录核对结果，资金没有变化'};}
 else if(type==='due'){const c=getCase(s,a.id);c.dueDate=a.dueDate?date(a.dueDate):'';c.dueType=['agreed','desired'].includes(a.dueType)?a.dueType:'none';if(c.dueDate&&c.dueType==='none')throw Error('日期性质待确认');c.reminderDays=[0,1,3,7,15,30].includes(Number(a.days))?Number(a.days):7;c.lastCheckDate=null;c.checkStatus=null;c.events.unshift({at:now,text:'用户确认修改还款日期及提醒频率'});completePeopleJourney(s,c,'rescheduled',now);}
 else if(type==='remind'){const c=getCase(s,a.id);if(a.style&&!reminderOptions(c).some(x=>x.id===a.style))throw Error('提醒话术选项无效');s.mails.unshift({id:uid(),caseId:c.id,recipient:c.recipient,text:text(a.message,500),style:text(a.style||'custom',20),at:now,simulated:true});c.lastReminderDate=s.simulatedDate||day();completePeopleJourney(s,c,'reminder-saved',now);result={message:'已存入模拟信箱，未发送短信或微信'};}
 else if(type==='reserve'||type==='purchase'){
  if(!s.goal)throw Error('请先设置储蓄目标');const amount=cents(a.amount),sum=summary(s);if(sum.availableCents==null||amount>sum.availableCents)throw Error('预留金额超过可用资金');
  s.reservations.push({id:uid(),goalId:s.goal.id,cents:amount,at:now,kind:type==='purchase'?'sandbox-product':'goal',product:type==='purchase'?'SIM-CASH-001':null});result={message:type==='purchase'?'模拟申购完成；虚构产品、零收益记账，未向银行下单':'已预留目标资金，现金总额不变'};
 }
 else if(type==='release'){const r=s.reservations.find(r=>r.id===a.id);if(!r)throw Error('预留记录不存在');s.reservations=s.reservations.filter(r=>r.id!==a.id);result={message:'已释放预留 / 模拟赎回，未产生收入'};}
 else if(type==='subscription'){
  const name=text(a.name);if(!name)throw Error('订阅名称缺失');
  if(!['keep','cancelled'].includes(a.status))throw Error('请明确保留或模拟取消');
  if(!subscriptionEvidence(s,a.period).some(x=>x.name===name))throw Error('所选月份没有这项有效扣费依据，请重新核对服务名称');
  let r=s.subscriptions.find(r=>r.name===name);if(!r){r={id:uid(),name,source:s.demo?'demo':'user'};s.subscriptions.push(r);}
  r.status=a.status;r.simulated=true;r.at=now;result={message:a.status==='cancelled'?`已记录${name}模拟取消。真实扣费仍需到原平台关闭，历史支出不变。`:`已记录${name}保留状态，历史支出不变。`};
 }
 else if(type==='contact'){const name=text(a.name,40);if(!name)throw Error('联系人姓名缺失');s.contacts.push({id:uid(),name,phone:text(a.phone,20),note:text(a.note)});}
 else if(type==='weekly_checkin'){
  const plan=executionPlan({state:s,summary:summary(s)});if(!plan)throw Error('请先选择一条路线');
  const week=weekStart(a.weekStart||day());if(week>weekStart(day()))throw Error('不能提前记录未来一周已经完成');
  const amount=cents(a.amount,true),ids=Array.isArray(a.completedActionIds)?[...new Set(a.completedActionIds)]:[];
  if(ids.some(id=>!plan.actions.some(x=>x.id===id)))throw Error('打卡行动已变化，请重新核对');
  let report=null,source=a.source||'manual';
  if(source==='file'){
   if(s.demo)throw Error('当前为虚构体验，请在自己的独立会话复盘真实账单');
   report=summarizeWeek(a.rows,week,{rules:s.rules||[]});
  }else if(source==='sample'){
   if(!s.demo)throw Error('虚构复盘仅供预览，不能保存为个人真实打卡');
   report=summarizeWeek(sampleWeekRows(week,day(),a.sampleVariant?{budgetCents:plan.weeklyCents,variant:a.sampleVariant}:{}),week);
  }else if(source==='ledger')report=summarizeWeek(s.transactions,week,{ledger:true});
  else if(source!=='manual')throw Error('打卡来源无效');
  const previous=s.checkins.find(x=>x.goalId===s.goal.id&&x.weekStart===week);
  if(!a.source&&previous?.report){report=previous.report;source=previous.source||'manual';}
  const reportSummary=report?Object.fromEntries(Object.entries(report).filter(([key])=>key!=='items')):null;
  const item={id:uid(),goalId:s.goal.id,weekStart:week,at:now,source,simulated:!!s.demo,report:reportSummary,amountAdjusted:!!report&&amount!==report.totalCents,spentCents:amount,budgetCents:plan.weeklyCents,warningCents:plan.weeklyWarningCents,status:weeklyFeedback(amount,plan.weeklyCents).status,feedback:weeklyFeedback(amount,plan.weeklyCents),sampleVariant:source==='sample'?a.sampleVariant||null:null,completedActionIds:ids,note:text(a.note,160)};
  s.checkins=s.checkins.filter(x=>!(x.goalId===s.goal.id&&x.weekStart===week));s.checkins.unshift(item);result={message:'已记录本周执行情况，不新增消费或省钱流水',checkin:item};
 }
 else if(type==='checkin'){s.checkins.unshift({id:uid(),at:now,spentCents:cents(a.amount,true),note:text(a.note)});}
 else if(type==='archive_case'){const c=getCase(s,a.id);if(remainingCents(c)>0)throw Error('未结清往来不能移出已结清列表');c.archived=true;c.events.unshift({at:now,text:'用户移除已结清待办，原流水与往来记录仍保留'});completePeopleJourney(s,c,'archived',now);result={message:'已移除已结清待办，原流水和记录保留，现金没有变化'};}
 else if(type==='delete_case'){const c=getCase(s,a.id);if(s.offsets.some(o=>o.inId===c.id||o.outId===c.id))throw Error('存在抵消历史，保留记录以便审计');if(c.paid)throw Error('已有还款记录，不能直接删除');for(const t of s.transactions.filter(t=>t.caseId===c.id)){delete t.caseId;t.kind=t.direction==='in'?'unknown_in':'unknown';delete t.ownExpenseCents;s.transactions=s.transactions.filter(x=>x.parentId!==t.id);}s.cases=s.cases.filter(x=>x.id!==c.id);}
 else if(type!=='import')throw Error('不支持的操作');
 return {state:s,result};
}
export function describe(s,type,a){
 const c=s.cases.find(c=>c.id===a.id),t=s.transactions.find(t=>t.id===a.id),contact=s.contacts.find(c=>c.id===a.contactId);
 const n=contact?.name||a.name||c?.recipient||t?.merchant||'';const m=a.amount?` ${fmt(cents(a.amount))} 元`:'';
 const map={archive_case:'移除已结清待办，保留流水与往来记录',long_term_plan:'保存独立长期预留与期限，仅预算不购买',weekly_checkin:'记录本周执行与行动打卡，不改流水',coach_adjust:'确认调整后的目标并选定路线',demo:'载入虚构示例，仅写入当前空账户',guided_demo:'建立虚构体验账户',sample_bill:'载入对应情形的虚构账单，不重复导入',advance_time:'推进虚构日期',bill_review:'核对本期消费分析，不修改预算',bill_plan:'采纳消费调整假设并更新目标预算',calibrate:'确认账单预算校准',coach_route:'选择储蓄路线，仅保存计划不扣款',coach:'保存目标教练的生活处境与成本假设',import:`导入${a.source||''}账单：${a.rows?.length||0}笔候选记录`,profile:'更新期初现金、月预算与应急资金',goal:`设置目标“${a.name||'储蓄目标'}”`,classify:`核对 ${t?.merchant||''} 的交易性质`,duplicate:`核对 ${t?.merchant||''} 的疑似重复流水`,link_loan:`将现有流水关联为 ${n} 的${a.kind||'垫付'}${m}；不新增付款`,transfer:`模拟${a.kind||'普通付款'}：${n}${m}`,repay:`核对 ${n} 的${a.transactionId?'已有流水':'模拟'}还款${m}`,offset:`与 ${n} 协商抵消${m}；不改变现金`,undo_offset:'撤销整批抵消，恢复未结清金额',due_check:`核对 ${n} 是否已还款`,due:`调整 ${n} 的还款日期`,remind:`为 ${n} 保存模拟提醒；不对外发送`,reserve:`预留目标资金${m}`,purchase:`模拟申购 SIM-CASH-001${m}；无真实下单`,release:'释放目标预留 / 模拟赎回',subscription:`${a.status==='cancelled'?'模拟取消':'保留'}订阅 ${n}`,contact:`添加联系人 ${n}`,checkin:`记录本周复盘${m}；不新增流水`,delete_case:`删除 ${n} 的往来关联，保留原始流水`};return map[type]||type;
}

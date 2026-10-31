import {classify,setRules} from './classifier.mjs';
import {weekStart} from './plan.mjs';
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
const addDays=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function weekWindow(value=today()){
 const start=weekStart(value);return {start,end:addDays(start,6)};
}
function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;}
function cents(value){const v=String(value??'').replace(/[¥￥,，\s元]/g,'');if(!/^\d+(\.\d{1,2})?$/.test(v))throw Error('账单金额无效');const [a,b='']=v.split('.'),n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<0||n>10000000000)throw Error('账单金额超出范围');return n;}
export function summarizeWeek(rows,value=today(),{ledger=false,now=today(),rules=[]}={}){
 if(!Array.isArray(rows)||rows.length>10000)throw Error('每次最多核对10000笔账单');
 setRules(rules);const {start,end}=weekWindow(value);if(start>weekStart(now))throw Error('不能提前复盘未来一周');
 const result={weekStart:start,weekEnd:end,through:end<now?end:now,totalCents:0,count:0,pendingCents:0,pendingCount:0,fixedCents:0,otherCents:0,duplicateCount:0,outsideCount:0,items:[]};
 const seen=new Set();
 for(const raw of rows){
  if(!validDate(raw.date))throw Error('账单日期无效');
  if(raw.date<start||raw.date>end||raw.date>now){result.outsideCount++;continue;}
  const amount=ledger?raw.cents:cents(raw.amount);
  if(!Number.isSafeInteger(amount)||amount<0)throw Error('账单金额无效');
  if(!['in','out','neutral'].includes(raw.direction))throw Error('账单收支方向不明确');
  const key=raw.importKey||[raw.source||'',raw.externalId||[raw.date,raw.time,raw.merchant,raw.desc,amount,raw.direction,raw.occurrence||0].join('|')].join('|');
  if(raw.excluded||raw.duplicateOf||seen.has(key)){result.duplicateCount++;continue;}seen.add(key);
  const t={...raw,cents:amount},description=[raw.merchant,raw.desc,raw.rawType,raw.note].join(' '),cat=ledger?raw.cat:classify(t).cat;
  let reason='计入日常',include=true;
  if(ledger&&raw.kind==='expense'&&raw.direction==='neutral'&&raw.parentId){/* AA own share carries no second cash flow. */}
  else if(raw.direction!=='out'||/余额宝|零钱通|理财通|提现|信用卡还款/.test(raw.rawType||'')){
   result.otherCents+=amount;include=false;reason='收入、退款或资金划转';
  }
  if(include&&(ledger&&['loan_out','borrow_in','repayment','unknown','unknown_in','refund','neutral'].includes(raw.kind)||!ledger&&(/垫付|借入|借出|借款|还款|转账|红包|群收款/.test(description)||cat==='person'||cat==='unk'))){
   result.pendingCents+=amount;result.pendingCount++;include=false;reason='往来或用途待核对，不算日常消费';
  }
  if(include&&/房租|房贷|学费|赡养|给家里|给父母|生活费转给/.test(description)){
   result.fixedCents+=amount;include=false;reason='单列固定责任';
  }
  if(include){result.totalCents+=amount;result.count++;}
  result.items.push({date:raw.date,merchant:String(raw.merchant||'未注明').slice(0,80),cents:amount,include,reason});
 }
 return result;
}
export function sampleWeekRows(value=today(),now=today(),options={}){
 const {start}=weekWindow(value);if(start>weekStart(now))throw Error('不能提前体验未来一周');
 const last=Math.min(6,Math.max(0,Math.round((Date.parse(now)-Date.parse(start))/86400000)));
 let amounts=[160,18,18,32];
 if(options.budgetCents!=null){
  const b=options.budgetCents;if(!Number.isSafeInteger(b)||b<0)throw Error('每周预算无效');
  const factor={within:80,mild:120,high:145}[options.variant||'within'];if(!factor)throw Error('请选择预算内或超支虚构账单');
  const target=Math.round(b*factor/100),parts=[Math.floor(target*.6),Math.floor(target*.1),Math.floor(target*.1)];parts.push(target-parts.reduce((a,b)=>a+b,0));amounts=parts.map(v=>v/100);
 }
 return [['校园食堂','本周餐饮合计',amounts[0]],['地铁公交','本周通勤',amounts[1]],['奶茶店','饮品',amounts[2]],['校园超市','日用商品',amounts[3]],['小王','聚餐垫付，用途待核对',100]].map(([merchant,desc,amount],i)=>({date:addDays(start,Math.min(i,last)),time:'12:00:00',merchant,desc,amount:String(amount),direction:'out',externalId:'WEEK-DEMO-'+start+'-'+i,rawType:i===4?'转账':'商户消费'}));
}
export function weeklyFeedback(spentCents,budgetCents){
 if(![spentCents,budgetCents].every(v=>Number.isSafeInteger(v)&&v>=0))throw Error('周支出或预算无效');
 const overCents=Math.max(0,spentCents-budgetCents),status=!overCents?'within':spentCents*10<=budgetCents*13?'near':'over';
 if(!overCents)return {status,overCents,ratio:0,nextWeekCents:budgetCents,spreadWeeks:0};
 if(!budgetCents)return {status,overCents,ratio:null,nextWeekCents:null,spreadWeeks:null};
 const weeklyReduction=Math.max(1,Math.floor(budgetCents*.2)),spreadWeeks=Math.max(2,Math.ceil(overCents/weeklyReduction)),spreadReductionCents=Math.ceil(overCents/spreadWeeks);
 if(spreadWeeks>12)return {status,overCents,ratio:overCents/budgetCents,nextWeekCents:budgetCents,spreadWeeks:null,needsReplan:true};
 return {status,overCents,ratio:overCents/budgetCents,nextWeekCents:budgetCents-Math.min(overCents,weeklyReduction),spreadWeeks,spreadReductionCents,spreadTargetCents:Math.max(0,budgetCents-spreadReductionCents)};
}
export function advancePreview(s,days,now=today()){
 if(!s.demo)throw Error('时间推进只用于虚构案例');
 const n=Number(days);if(!Number.isInteger(n)||n<1||n>365)throw Error('请输入1—365天的整数');
 const fromDate=s.simulatedDate||now;return {fromDate,toDate:addDays(fromDate,n),days:n};
}
export function savedBillPeriod(s,preferred=today().slice(0,7)){
 const reports=s.billReports||{};if(reports[preferred])return preferred;if(reports[s.lastBillPeriod])return s.lastBillPeriod;
 return Object.keys(reports).sort((a,b)=>String(reports[b].analyzedAt||b).localeCompare(String(reports[a].analyzedAt||a)))[0]||preferred;
}
export function pendingAdvanceTask(s){
 const t=s.transactions.find(t=>!t.caseId&&!t.excluded&&!t.duplicateOf&&t.direction==='out'&&t.kind==='unknown'&&t.cents===10000&&t.simulated&&(t.cat==='person'||/转账|垫付|借款/.test((t.desc||'')+(t.rawType||''))));
 return t?{id:'transfer:'+t.id,title:'先核对这100元的用途',action:'agent-transfer',transactionId:t.id}:null;
}

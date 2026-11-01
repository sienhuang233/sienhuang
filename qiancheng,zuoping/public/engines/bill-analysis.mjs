import {coachScenario,selectedRouteScenario} from './coach-scenario.mjs';
const sum=rows=>rows.reduce((n,t)=>n+t.cents,0);
const protectedUse=t=>t.cat==='person'||/赡养|礼物|生日|妈妈|爸爸|父母|医疗|医院|补牙|学费|房租|房贷|借款|还款|垫付/.test(t.merchant+' '+t.desc);
export const MAX_DUPLICATE_PAIRS=200;
export function duplicatePairs(expense){
 const groups=new Map();
 expense.forEach((t,index)=>{const time=Date.parse(t.date+'T'+t.time);if(!Number.isFinite(time))return;const key=JSON.stringify([t.date,t.merchant,t.cents]),rows=groups.get(key)||[];rows.push({t,index,time});groups.set(key,rows);});
 const stored=[];let pairCount=0;
 for(const rows of groups.values()){
  rows.sort((a,b)=>a.time-b.time||a.index-b.index);let left=0;
  for(let right=0;right<rows.length;right++){
   while(rows[right].time-rows[left].time>3600000)left++;
   pairCount+=right-left;
   for(let j=left;j<right&&stored.length<MAX_DUPLICATE_PAIRS;j++){
    const a=rows[j].index<rows[right].index?rows[j]:rows[right],b=a===rows[j]?rows[right]:rows[j];
    stored.push({i:a.index,j:b.index,firstId:a.t.id,secondId:b.t.id,merchant:a.t.merchant,cents:a.t.cents});
   }
  }
 }
 stored.sort((a,b)=>a.i-b.i||a.j-b.j);
 return {pairs:stored.map(({i,j,...p})=>p),pairCount,pairsTruncated:pairCount>stored.length};
}
export function analyzeBills(s,period){
 if(!/^\d{4}-\d{2}$/.test(period))throw Error('请选择账单月份');
 const periodRows=s.transactions.filter(t=>t.date.startsWith(period));
 const valid=periodRows.filter(t=>!t.excluded&&!t.duplicateOf);
 const expense=valid.filter(t=>t.kind==='expense'),totalCents=sum(expense);
 const categories=Object.entries(expense.reduce((a,t)=>(a[t.cat]=(a[t.cat]||0)+t.cents,a),{})).map(([cat,cents])=>({cat,cents,share:totalCents?cents/totalCents:0})).sort((a,b)=>b.cents-a.cents);
 const opportunities=[];
 const add=(id,title,rows,action,proposal)=>{const cents=sum(rows);if(!cents)return;opportunities.push({id,title,count:rows.length,cents,transactionIds:rows.map(t=>t.id),merchants:[...new Set(rows.map(t=>t.merchant))],action,suggestedCents:Math.min(cents,Math.max(1,Math.round(proposal))),scope:'仅本期已导入记录'});};
 const flexible=expense.filter(t=>!protectedUse(t));
 const entertainment=flexible.filter(t=>t.cat==='social'&&/电影|影院|桌游|游戏|KTV|ktv|娱乐|游乐|球馆/.test(t.merchant+' '+t.desc));
 add('entertainment','给娱乐支出设个合适的上限',entertainment,'可以先预览把这组娱乐预算下调20%的影响，金额由你调整。重要聚会可以保留。',sum(entertainment)*.2);
 const late=flexible.filter(t=>t.cat==='food'&&/外卖|饿了么/.test(t.merchant+' '+t.desc)&&(t.time>='22:00:00'||t.time<'05:00:00'||/夜宵/.test(t.desc)));
 add('late-takeout','少点几次可替代的夜宵外卖',late,'如果这些夜宵可以替代，可以先预览少点两次能节省多少，按本期均价估算。必要用餐照常保留。',late.length?sum(late)/late.length*Math.min(2,late.length):0);
 const drinks=flexible.filter(t=>t.cat==='food'&&/奶茶|蜜雪冰城|喜茶|茶百道|古茗|霸王茶姬|饮品/.test(t.merchant+' '+t.desc));
 const units=drinks.reduce((n,t)=>n+Number(t.desc.match(/(\d+)\s*(?:次|杯)/)?.[1]||1),0);
 if(units>52/12){add('drinks','试试调整饮品预算',drinks,'可以先预览“每周最多1杯”的饮品预算，按这份账单的杯数和均价估算，再看是否适合你。',sum(drinks)*(1-(52/12)/units));opportunities.at(-1).units=units;}
 const shopping=flexible.filter(t=>t.cat==='shop'&&!/书|教材|学习|电脑|耳机|设备/.test(t.desc));
 add('shopping','非紧急购物，先放一天再决定',shopping,'先由你确认哪些购物不紧急，再预览把这组预算下调20%的影响。必要采购和一次性支出不直接算作每月可省。',sum(shopping)*.2);
 // Rank the editable trial amounts, not the moral value of a purchase or a promised saving.
 opportunities.sort((a,b)=>b.suggestedCents-a.suggestedCents||a.id.localeCompare(b.id));
 const duplicates=duplicatePairs(expense);
 const dates=valid.map(t=>t.date).sort();
 return {period,count:valid.length,expenseCount:expense.length,totalCents,categories,opportunities,pendingCents:sum(valid.filter(t=>t.kind==='unknown'||t.kind==='unknown_in')),protectedCents:sum(expense.filter(protectedUse)),subscriptionCents:sum(expense.filter(t=>t.cat==='subs')),largePurchases:expense.filter(t=>t.cents>=100000&&!protectedUse(t)).map(t=>({id:t.id,merchant:t.merchant,cents:t.cents,desc:t.desc})),...duplicates,firstDate:dates[0]||null,lastDate:dates.at(-1)||null,excludedCount:periodRows.length-valid.length};
}
export function billReviewBasis(s,period){return JSON.stringify({period,rows:s.transactions.filter(t=>t.date.startsWith(period)).map(t=>[t.id,t.cents,t.kind,t.cat,!!t.excluded,t.duplicateOf||'',t.caseId||''])});}
export function billPlanPreview(data,period,id,reductionCents){
 const report=analyzeBills(data.state,period),opportunity=report.opportunities.find(x=>x.id===id);
 if(!opportunity)throw Error('这条建议的账单依据已变化，请重新分析');
 if(!Number.isSafeInteger(reductionCents)||reductionCents<=0||reductionCents>opportunity.cents)throw Error('请填写大于0且不超过这组已核对支出的调整金额');
 if((data.state.planActions||[]).some(x=>x.active!==false&&x.period===period&&x.opportunity===id)||!data.state.planActions?.length&&data.state.budgetPlan?.opportunity===id&&data.state.profile.expenseReductionCents>0)throw Error('这条建议已采纳，不要重复叠加节省');
 const before=coachScenario(data);if(!before)return {needsProfile:true,opportunity,report};
 const beforeExpenseCents=(data.state.profile.expenseCents??Math.round((before.band.mid+before.band.leisure)*100))-(data.state.profile.expenseReductionCents||0);
 const afterExpenseCents=beforeExpenseCents-reductionCents;
 const rigidCents=Math.round(before.band.rigid*100);
 if(afterExpenseCents<Math.max(0,rigidCents))throw Error('调整后的预算不足以覆盖已知固定责任，请调小金额');
 const trial=structuredClone(data);trial.state.profile.expenseReductionCents=(data.state.profile.expenseReductionCents||0)+reductionCents;
 const after=coachScenario(trial);
 const picked=data.state.coachRoute?.index,beforeSelected=selectedRouteScenario(data),afterSelected=picked!=null?after.result.plans[picked]:null;
 return {needsProfile:false,opportunity,routeBeforeProb:beforeSelected?.route.prob??before.result.natural.sim.prob,routeAfterProb:afterSelected?.prob??after.result.natural.sim.prob,beforeRouteSaveCents:beforeSelected?Math.round(beforeSelected.route.save*100):Math.round(before.result.natural.save*100),afterRouteSaveCents:afterSelected?Math.round(afterSelected.save*100):Math.round(after.result.natural.save*100),beforeExpenseCents,afterExpenseCents,reductionCents,beforeProb:before.result.natural.sim.prob,afterProb:after.result.natural.sim.prob,beforeMonthlyCents:Math.round(before.result.natural.save*100),afterMonthlyCents:Math.round(after.result.natural.save*100),basis:data.state.profile.expenseCents==null?'生活成本演示假设':'已保存的月度预算',reviewBasis:billReviewBasis(data.state,period)};
}

export function actionLimits(op,reductionCents){
 const units=op.units||op.count,averageCents=units?op.cents/units:0,capCents=Math.max(0,op.cents-reductionCents);
 return {units,averageCents,capCents,maxCount:averageCents?Math.max(0,Math.floor((capCents+.00001)/averageCents)):0,weeklyCapCents:Math.floor(capCents/(52/12))};
}
export function instructionFor(op,reductionCents){
 const a=actionLimits(op,reductionCents),money=n=>(n/100).toFixed(2);
 if(op.id==='late-takeout')return `本月可替代夜宵外卖最多${a.maxCount}次，预算${money(a.capCents)}元；每周核对一次，必要正餐照常保留。`;
 if(op.id==='drinks')return `饮品先按每周最多1杯试行，本月最多${Math.min(4,a.maxCount)}杯、预算${money(a.capCents)}元；每周看看是否合适。`;
 if(op.id==='entertainment')return `本月娱乐预算${money(a.capCents)}元，每周参考${money(a.weeklyCapCents)}元。重要聚会可以保留；周额度包含在月额度内。`;
 return `这组非紧急购物本月预算${money(a.capCents)}元，每周参考${money(a.weeklyCapCents)}元。下单前先放一天；周额度包含在月额度内。`;
}

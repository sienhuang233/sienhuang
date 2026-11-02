import {nextDue} from '../public/engines/people.mjs';
import {summary,day,month,billBasis} from './domain.mjs';
import {billReviewBasis} from '../public/engines/bill-analysis.mjs';
import {routeBasis} from '../public/engines/coach-scenario.mjs';
export function recommend(s){
 const task=(id,title,reason,action,extra={})=>({id,title,reason,action,...extra});
 // A newly imported personal bill can be analyzed without a savings goal or
 // personal profile. Only ask for those when the user chooses goal linkage.
 if(!s.demo&&s.transactions.some(t=>t.importKey)){
  const period=s.lastBillPeriod||s.transactions.filter(t=>t.importKey).map(t=>t.date.slice(0,7)).sort().at(-1)||month();
  if(!s.billReports?.[period])return task('bill-analysis','帮我分析这份账单','账单已保存，先完成消费分析，无需先设置储蓄目标。','agent-bill-analysis',{period});
  if((!s.goal||!s.coach||!s.openingKnown||!s.coachRoute)&&!s.billDecisions?.[period])return task('bill-actions','帮我看看账单里的改进建议','先核对消费与可调整项目；需要联动储蓄计划时，再补充真实条件。','agent-bill-actions',{period});
 }
 const due=s.cases.find(c=>c.dueDate&&c.dueDate<=(s.simulatedDate||day())&&c.reminderDays>0&&Math.round((c.amount-c.paid-c.offset)*100)>0&&(!c.lastCheckDate||Math.floor((Date.parse(s.simulatedDate||day())-Date.parse(c.lastCheckDate))/86400000)>=c.reminderDays)&&(!c.lastReminderDate||Math.floor((Date.parse(s.simulatedDate||day())-Date.parse(c.lastReminderDate))/86400000)>=c.reminderDays));
 if(s.peopleJourneyCompleted&&!s.peoplePracticeCompleted)return task('people-payment','帮我记录一笔新的人情往来','这一轮体验已完成，未结清款项仍保留。想再记一笔，可以直接告诉我谁、多少钱，以及是转账、垫付还是AA。','agent-people-practice');
 if(due)return task('due:'+due.id,'帮我核对这笔到期往来','先核对实际是否归还；未到账的钱不计入可用现金。','due-status',{caseId:due.id});
 const unhandled=s.cases.find(c=>c.checkStatus==='unpaid'&&c.lastCheckDate===(s.simulatedDate||day())&&c.lastReminderDate!==(s.simulatedDate||day())&&Math.round((c.amount-c.paid-c.offset)*100)>0);
 if(unhandled)return task('people-options:'+unhandled.id,'这笔还没还，帮我看看怎么处理','先选一种处理方式，未收到的钱不计入可用现金。','agent-people-options',{caseId:unhandled.id});
 const future=s.demo?nextDue(s):null;
 if(future&&future.days<=365)return task('advance-due:'+future.caseId,'预览把模拟日期推进到'+future.date,'先预览要推进到的日期，确认后才改变模拟时间。','agent-advance-due',{caseId:future.caseId,days:future.days,toDate:future.date});
 if(!s.goal)return task('goal','帮我设一个攒钱目标','你想攒多少钱，打算多久攒到？可以直接对我说。','start-goal');
 if(!s.coach||!s.openingKnown)return task('profile','继续补充我的生活条件','已说过的条件会保留，接着补充缺少的部分。','coach-interview');
 if(!s.coachRoute)return task('routes','帮我计算三种储蓄方案','按已确认的目标和生活条件计算，选路线仍由你决定。','coach-outcome');
 const analyzed=!!s.billAnalysisCompleted||!!s.billReviewBasis;
 if(!s.transactions.length&&!analyzed)return task('bills','帮我用账单检查这个计划',s.demo?'用已选虚构情形体验分析，不当作真实消费。':'选择账单文件，预览并确认后保存；已有账单则直接分析当前数据。','route-to-bills');
 const incoming=s.transactions.find(t=>!t.caseId&&!t.excluded&&!t.duplicateOf&&t.direction==='in'&&s.cases.some(c=>c.kind!=='借入'&&c.recipient===t.merchant&&Math.round((c.amount-c.paid-c.offset)*100)>=t.cents));
 if(incoming){const c=s.cases.find(c=>c.kind!=='借入'&&c.recipient===incoming.merchant&&Math.round((c.amount-c.paid-c.offset)*100)>=incoming.cents);return task('repay:'+incoming.id,'帮我核对这笔入账是不是还款','姓名和金额只是线索，确认关联后也不会重复增加现金。','agent-repayment',{transactionId:incoming.id,caseId:c.id});}
 const analyzedPeriod=s.lastBillPeriod||month();
 if(s.billReports?.[analyzedPeriod]&&!s.billDecisions?.[analyzedPeriod])return task('bill-actions','帮我预览一项预算调整','先看调整能带来什么变化，再决定是否加入计划；也可以保持原预算。','agent-bill-actions',{period:analyzedPeriod});
 const unknown=s.transactions.find(t=>!t.excluded&&!t.duplicateOf&&!t.caseId&&t.kind==='unknown'&&t.direction==='out');
 if(unknown&&unknown.cat!=='person'&&!/转账|垫付|借款/.test((unknown.rawType||'')+' '+unknown.desc))return task('classify:'+unknown.id,'帮我核对这笔支出的分类','先由你确认这笔支出的类别，线索不足时暂不下结论。','classify',{transactionId:unknown.id});
 if(unknown)return task('transfer:'+unknown.id,'帮我核对这笔转账的用途',`这笔与${unknown.merchant}有关的${(unknown.cents/100).toLocaleString('zh-CN')}元转账，需要先核对用途。`,'agent-transfer',{transactionId:unknown.id});
 const period=month(),reviewBasis=billReviewBasis(s,period);
 if(!analyzed)return task('bill-analysis','帮我分析这份账单','先看钱花在哪里，再挑有依据的项目预览调整；没有合适项目也可以保持原样。','agent-bill-analysis',{period});

 if(analyzed&&(!s.peopleSceneCompleted||s.demo&&!s.peoplePracticeCompleted))return task('people-practice','带我体验模拟垫付或AA','先整理垫付或AA信息，再核对归还日期与性质。','agent-people-practice');
 if(s.coachRoute.basis!==routeBasis(s,summary(s).availableCents))return task('recalculate','按最新收支重新计算三种储蓄方案','按你最新确认的收支重算，再决定是否更换路线。','coach-outcome');
 if(analyzed&&(s.peopleSceneCompleted||s.cases.length))return task('progress','看看当前计划','当前计划已整理好。需要时可以继续记账或复盘；账单不会自动重复分析。','agent-progress',{passive:true});
 return task('progress','看看接下来的执行安排','可以查看已选路线和执行安排，也可以主动开始本周复盘。','agent-progress');
}

import {cnNumber} from './goal-intent.mjs';
const left=c=>Math.max(0,Math.round(c.amount*100)-Math.round(c.paid*100)-Math.round(c.offset*100));
export function dueResponse(s,q,context={}){
 if(!['due_status','due_repayment'].includes(context.intent))return null;
 const c=s.cases.find(c=>c.id===context.caseId&&left(c)>0),base={mode:'rules',steps:[],proposal:null,direct:true};
 if(!c)return {...base,context:{},reply:'这笔往来已结清或记录已变化，请重新核对；没有新增现金。'};
 const keep={intent:context.intent,caseId:c.id};
 if(/^(取消|算了|暂停|先不)[。！!\s]*$/.test(q))return {...base,context:{},reply:'已暂停核对，往来和现金没有变化。'};
 if(/明天|后天|将会|准备|打算|承诺|答应|会还/.test(q)&&!/已(?:经)?(?:收到|到账|还|归还)|还了|收到(?:了)?/.test(q))return {...base,context:keep,reply:'约好归还还不等于已经到账。你实际收到了多少？确认收到后再记还款。'};
 if(/没还|未还|尚未归还|未归还|没收到|未到账|尚未收到|没有还/.test(q))return {...base,context:{},task:{action:'due-unpaid',caseId:c.id},reply:'先记为尚未归还，可用现金没有增加。接下来想准备提醒、调整日期，还是先核实收款？'};
 if(/不确定|不知道|好像|似乎|可能.*还|查一下|核实一下/.test(q))return {...base,context:{},task:{action:'due-verify',caseId:c.id},reply:'先核实实际收款记录。确认前暂不记还款，可用现金没有变化。'};
 const amount=q.match(/(?:还了|归还|还款|收到|到账)\s*([\d.]+|[零一二两三四五六七八九十百千万]+)\s*(元|块)?/),number=amount?cnNumber(amount[1]):context.intent==='due_repayment'?cnNumber(q.replace(/元|块|[。！!\s]/g,'')):null;
 if(number!=null&&number>0&&number<=left(c)/100)return {...base,context:keep,task:{action:'repay',caseId:c.id,amount:String(number)},reply:'请核对本次归还金额与对应流水。页面只是草案，确认前不新增现金。'};
 if(number!=null)return {...base,context:keep,reply:'这个金额需要再核对：应大于0，且不超过这笔记录的未结清金额。请重新告诉我实际归还金额。'};
 if(/全部.*(?:还|收|到账)|都还|全还|已还清|已经还清|全部结清/.test(q))return {...base,context:keep,task:{action:'repay',caseId:c.id},reply:'请在页面核对剩余金额和实际到账流水，确认后记为全部归还。关联已有流水不会重复增加现金。'};
 if(/部分.*还|还.*部分|部分到账|收到部分/.test(q))return {...base,context:{intent:'due_repayment',caseId:c.id},task:{action:'repay',caseId:c.id,partial:true},reply:'这次实际归还多少？告诉我金额后，再到页面选择对应的到账流水核对。'};
 return {...base,context:keep,reply:'这笔往来到日期了，已经全部归还、部分归还，还是尚未归还？我们先核对实际情况。'};
}

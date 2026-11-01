import {isNextStepMessage} from '../public/engines/conversation.mjs';
import {cnNumber} from './goal-intent.mjs';
const base=s=>s.simulatedDate||new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
const clip=(v,n=80)=>String(v??'').trim().slice(0,n);
const remaining=c=>Math.max(0,Math.round(c.amount*100)-Math.round(c.paid*100)-Math.round(c.offset*100));
const owns=(q,x)=>typeof x==='string'&&x.trim().length>0&&q.includes(x.trim());
export const isPeopleContext=c=>['people_link','people_date','people_options','payment_interview'].includes(c?.intent);
const response=(reply,context,extra={})=>({mode:'rules',steps:[],proposal:null,direct:true,flowControlled:true,reply,context,...extra});
const validAmount=n=>Number.isFinite(n)&&n>0&&n<=100000000&&Math.abs(n*100-Math.round(n*100))<1e-5;
export function dateFromMessage(q,reference){
 let m=q.match(/(20\d{2})[-年/](\d{1,2})[-月/](\d{1,2})日?/),result;
 if(m)result=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 else if(m=q.match(/(\d{1,2})月(\d{1,2})(?:日|号)?/))result=reference.slice(0,4)+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');
 else{
  let days=/后天/.test(q)?2:/明天/.test(q)?1:/今天|今晚/.test(q)?0:null;
  if(m=q.match(/([\d]+|[一二两三四五六七八九十百]+)\s*(天|周|星期)(?:之?后|以后|之内|内)?/)){const n=cnNumber(m[1]);if(n!=null)days=n*(m[2]==='天'?1:7);}
  if(/一周后|一个星期后/.test(q))days=7;
  const weekday=q.match(/(下周|下星期|本周|这周|星期|周)([一二三四五六日天])/);
  if(weekday){const target={一:1,二:2,三:3,四:4,五:5,六:6,日:0,天:0}[weekday[2]],current=new Date(reference+'T12:00:00Z').getUTCDay();days=weekday[1].startsWith('下')?(7-((current+6)%7))+((target+6)%7):(target-current+7)%7;}
  if(days!=null&&Number.isInteger(days)&&days>=0&&days<=365)result=new Date(Date.parse(reference+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
 }
 if(!result)return null;const d=new Date(result+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===result?result:null;
}
function nature(q){if(/双方.*约定|双方.*商量|已约定|约好了|已经说好|说好了|说定了|商量好了/.test(q))return 'agreed';if(/本人期望|我的期望|我希望|希望对方|我想让|个人期望/.test(q))return 'desired';return null;}
function money(q,raw,allowBare=false){
 if(raw&&owns(q,raw.quote)&&!/天|月|年|周/.test(raw.quote)){
  const n=Number(raw.value);if(validAmount(n)&&[...raw.quote.matchAll(/(-?[\d]+(?:\.[\d]+)?|负?[零一二两三四五六七八九十百千万]+)\s*(万|千)?/g)].some(m=>cnNumber(m[1])*(m[2]==='万'?10000:m[2]==='千'?1000:1)===n))return String(n);
 }
 const m=q.match(/(-?[\d]+(?:\.[\d]+)?|负?[零一二两三四五六七八九十百千万]+)\s*(元|块)/);if(m){const n=/^[-负]/.test(m[1])?NaN:cnNumber(m[1]);if(validAmount(n))return String(n);}
 if(allowBare&&!/电话|手机|账号|尾号|银行卡|地址|日期|[天月年周号]|星期/.test(q)){const bare=q.match(/(-?\d+(?:\.\d+)?|负?[零一二两三四五六七八九十百千万]+)\s*[。！!]?$/)||q.match(/(?:转|付)\s*(-?\d+(?:\.\d+)?|负?[零一二两三四五六七八九十百千万]+)\s*给/);if(bare&&!/^[-负]/.test(bare[1])){const n=cnNumber(bare[1]);if(validAmount(n))return String(n);}}
 return null;
}
function person(q,raw,stage){
 const denied=/aaa|谁谁|某某|多少钱|…|\.{2}|。{2}/i;
 if(raw?.recipient&&owns(q,raw.recipient)&&!denied.test(raw.recipient))return clip(raw.recipient,40);
 const m=q.match(/(?:转给|转账给|帮|给)([^\d\s，。！？]{1,20}?)(?=垫付|代付|AA|平摊|转账|转|\d|[零一二两三四五六七八九十百千万]+(?:元|块|[。！!\s]*$))/i);
 if(m&&!denied.test(m[1]))return clip(m[1],40);
 const afterAmount=q.match(/^(?:转|付)\s*\d+(?:\.\d+)?\s*(?:元|块)?给([^\d，。！？\s]{1,20})[。！!]?$/);if(afterAmount&&!denied.test(afterAmount[1]))return afterAmount[1];
 const namedOnly=q.match(/^(?:转给|转账给|帮|给)([\p{L}·]{1,20})$/u);if(namedOnly&&!denied.test(namedOnly[1])&&!/垫付|转账|多少钱|AA/i.test(namedOnly[1]))return namedOnly[1];
 const named=q.match(/(?:名字|姓名|对方)(?:改成|是|叫|为|：|:)([^\d，。！？\s]{1,20})/);if(named)return clip(named[1],40);
 if(stage==='name'&&/^[\p{L}·]{1,20}$/u.test(q)&&!/(普通|转账|付款|垫付|借款|借入|AA|继续|下一步|未约定|本人期望|双方约定|不知道|不确定|可以|好的|什么|明天|后天|元|块|天|个月)/i.test(q)&&!denied.test(q))return q;
 return null;
}
function kindOf(q){if(/AA|平摊/i.test(q))return 'AA';if(/垫付|代付|先替.*付/.test(q))return '垫付';if(/借入|向.*借|借我/.test(q))return '借入';if(/借给|借出/.test(q))return '借款';if(/普通(?:转账|付款)|转给|转账给|付给|给.*(?:付|转)|(?:转|付)\s*\d|转账|转钱|付款/.test(q))return '普通付款';return null;}
export function paymentRequest(q){return /^(?:(?:我想|我要|帮我|请帮我|请|想)\s*)?(?:转账|转一笔账|发起一笔转账|付款|转钱|给人转账|转一笔)[。！!\s]*$|转给|转账给|(?:转|付)\s*\d+(?:\.\d+)?(?:元|块)?给|付给|借给|借出|借入|向.*借|给.*(?:付|转)|(?:帮|给).*(?:垫付|代付|AA)|体验.*(?:支付|付款)|模拟付款|普通转账|^垫付[。！!\s]*$|^AA[。！!\s]*$/i.test(q);}
function dateFields(s,q,draft,raw={}){
 const next={...draft};
 if(/未约定|没约定|暂不设置|暂不设|不设置|先不填|跳过|不填日期|稍后再定/.test(q)){next.dueDate='';next.dueType='none';return next;}
 const date=dateFromMessage(q,base(s));if(date){next.dueDate=date;if(next.dueType==='none')next.dueType='';}
 const type=nature(q)||(owns(q,raw.due_type_field?.quote)&&['agreed','desired'].includes(raw.due_type_field.value)&&!(/未|没|不/.test(raw.due_type_field.quote)&&raw.due_type_field.value==='agreed')?raw.due_type_field.value:null);if(type)next.dueType=type;return next;
}
function advance(s,q,context,raw){
 const link=context.intent==='people_link',changeDate=context.intent==='people_date',payment=context.intent==='payment_interview',draft=dateFields(s,q,context.draft||{},raw),name=person(q,raw,context.stage);
 if(name)draft.name=name;
 if(payment&&!draft.kind)draft.kind=kindOf(q)||(raw.kind==='垫付'&&owns(q,raw.kind_quote)&&/替.*(?:付|出)|先.*(?:付|出)|代付/.test(raw.kind_quote)?'垫付':'');
 const amount=money(q,raw?.amount_field,payment||['amount','share'].includes(context.stage))||(/^(?:改成)?\d+(?:\.\d{1,2})?$/.test(q)&&['amount','share'].includes(context.stage)?q.replace('改成',''):null);
 if(link&&amount)draft.amount=amount;
 else if(payment&&amount){if(draft.kind==='AA'&&context.stage==='share')draft.receivableAmount=amount;else if(draft.kind!=='AA'||/总额|总共|整笔|先付|账单/.test(q)||context.stage==='amount')draft.amount=amount;else draft.ambiguousAA=amount;}
 const share=q.match(/(?:对方|小王|他|她|应还|份额|分摊)(?:应还|承担|出|还)?[^\d零一二两三四五六七八九十百千万]{0,4}([\d]+(?:\.\d{1,2})?|[零一二两三四五六七八九十百千万]+)\s*元/);
 if(payment&&draft.kind==='AA'&&share){const n=cnNumber(share[1]);if(validAmount(n))draft.receivableAmount=String(n);}
 if(payment&&raw?.receivable_field){const n=money(q,raw.receivable_field);if(n)draft.receivableAmount=n;}
 const purpose=q.match(/用途(?:是|为|：|:)?([^，。！？]{1,80})/);if(purpose)draft.purpose=purpose[1].trim();
 const ctx={...context,draft},task={action:link?'people-link-draft':changeDate?'people-date-draft':'people-payment-draft',...(link?{transactionId:context.transactionId}:{}),...(changeDate?{caseId:context.caseId}:{}),draft};
 const ask=(stage,text)=>response(text,{...ctx,stage},{task});
 const currency=q.match(/(-?[\d]+(?:\.[\d]+)?|负?[零一二两三四五六七八九十百千万]+)\s*(元|块)/);
 if(!changeDate&&currency&&(/^[-负]/.test(currency[1])||!validAmount(cnNumber(currency[1]))))return ask(link||context.stage==='share'?'share':'amount','金额需大于零且最多两位小数，请重新核对。');
 if(payment&&!draft.kind)return ask('kind','这次是普通转账、帮人垫付，还是AA？');
 if(!changeDate&&!draft.name)return ask('name','这笔钱和谁有关？告诉我对方的姓名就好。');
 if(link&&!draft.amount)return ask('share','已有这笔流水，对方应还多少元？只记录对方份额，不默认一人一半。');
 if(!changeDate&&!draft.amount)return ask('amount',draft.kind==='AA'?(draft.ambiguousAA?'你说的'+draft.ambiguousAA+'元是整笔付款还是对方份额？请先说明整笔付款总额。':'这次AA一共多少钱？接下来再核对各自的份额。'):'金额是多少？用途可以之后再补。');
 if(!changeDate&&!validAmount(Number(draft.amount)))return ask('amount','请输入大于零、最多两位小数的金额。');
 const tx=link?s.transactions.find(t=>t.id===context.transactionId&&!t.caseId&&!t.excluded&&!t.duplicateOf):null;
 if(link&&(!tx||Math.round(Number(draft.amount)*100)>tx.cents))return ask('share','待收份额不能超过已有流水金额，请重新核对应还多少。');
 if(payment&&draft.kind==='AA'){
  if(!draft.receivableAmount)return ask('share','其中对方应还多少？按你确认的份额记录。');
  if(!validAmount(Number(draft.receivableAmount))||Number(draft.receivableAmount)>Number(draft.amount))return ask('share','对方应还份额需大于零，且不能超过整笔付款，请重新核对。');
 }
 const needsDate=!payment||draft.kind!=='普通付款';
 if(needsDate&&!draft.dueDate&&draft.dueType!=='none')return ask('date',changeDate?'剩余款项打算什么时候归还？可以说“三天后”或具体日期。':'打算什么时候归还？可以说“三天后”、具体日期，或“暂不设置日期”。');
 if(needsDate&&draft.dueDate&&!['agreed','desired'].includes(draft.dueType))return ask('date_type','这个日期是“双方已约定”，还是“本人期望”？');
 const args=changeDate?{id:context.caseId,dueDate:draft.dueDate||'',dueType:draft.dueType||'none',days:s.cases.find(c=>c.id===context.caseId)?.reminderDays??7}:link?{id:context.transactionId,name:draft.name,kind:draft.kind,amount:draft.amount,dueDate:draft.dueDate||'',dueType:draft.dueType||'none'}:{name:draft.name,kind:draft.kind,amount:draft.amount,purpose:draft.purpose||'',dueDate:draft.dueDate||'',dueType:draft.dueType||'none',...(draft.kind==='AA'?{receivableAmount:draft.receivableAmount}:{})};
 return response(changeDate?'新日期和性质已整理，请核对后保存。':link?'这笔已有转账的份额和归还安排已整理。请在页面核对后确认关联，不会再新增付款。':'模拟付款草案已整理，还没有付款。请在页面核对姓名、金额和日期后确认。',{}, {proposal:{type:changeDate?'due':link?'link_loan':'transfer',args}});
}
export function peopleConversation(s,q,context={},raw={}){
 if(isPeopleContext(context)&&/^(取消|算了|暂停|先不)[。！!\s]*$/.test(q))return response('先暂停这一步。草稿未保存，账本和现金没有变化。',{}, {next:'people_cancel'});
 if(isPeopleContext(context)&&/攒|储蓄目标|(?:虚拟|虚构|模拟|真实)账单|导入.*账单|查询余额/.test(q))return null;
 if(context.intent==='transfer'){const c=s.contacts.find(c=>c.id===context.contactId);return advance(s,q,{intent:'payment_interview',stage:c?'amount':'name',draft:{kind:context.kind||'普通付款',name:c?.name||'',amount:'',dueDate:'',dueType:''}},raw);}
 if(isNextStepMessage(q)&&['people_link','people_date','payment_interview'].includes(context.intent))return advance(s,'',context,{});
 if(context.intent==='people_options'){
  const c=s.cases.find(c=>c.id===context.caseId&&remaining(c)>0);if(!c)return response('这笔记录已变化，请重新选择需要处理的往来。',{});
  const chosen=owns(q,raw.action_quote)?raw.people_action:null;
  if(!isNextStepMessage(q)&&(/提醒|催|发.*消息/.test(q)||chosen==='remind'))return response('我先帮你准备提醒。你可以挑一种语气并修改文字，确认后保存到模拟信箱，不会真实发送。',context,{task:{action:'remind',caseId:c.id}});
  if(/亲自核实|核实收款|查.*到账/.test(q)||chosen==='verify')return response('你先核实实际收款记录。确认到账后，我们再记还款。',context,{task:{action:'due-verify',caseId:c.id}});
  if(/改.*日期|修改日期|调整日期|改期|希望.*还/.test(q)||chosen==='reschedule'||dateFromMessage(q,base(s)))return advance(s,q,{intent:'people_date',caseId:c.id,draft:{dueDate:'',dueType:''}},raw);
  return response('这笔款项还没归还。你想“修改日期”“帮我提醒对方”，还是“先亲自核实”？',context,{task:{action:'agent-people-options',caseId:c.id}});
 }
 if(context.intent==='people_date'){
  if(/提醒|催/.test(q)&&s.cases.some(c=>c.id===context.caseId&&remaining(c)>0))return response('先核对提醒话术，确认后只模拟保存。',{intent:'people_options',caseId:context.caseId},{task:{action:'remind',caseId:context.caseId}});
  if(!s.cases.some(c=>c.id===context.caseId&&remaining(c)>0))return response('这笔往来已结清或变化，不再改未结清日期。',{});
  return advance(s,q,context,raw);
 }
 if(context.intent==='people_link'){
  if(!s.transactions.some(t=>t.id===context.transactionId&&!t.caseId&&!t.excluded&&!t.duplicateOf))return response('该流水已关联或变化，请重新选择，不能重复建账。',{});
  return advance(s,q,context,raw);
 }
 if(context.intent==='transfer_purpose'){
  const t=s.transactions.find(t=>t.id===context.transactionId&&!t.caseId&&!t.excluded&&!t.duplicateOf&&t.direction==='out'&&t.kind==='unknown');if(!t)return null;
  if(/不是|不确定|取消|不(要|是)|先不/.test(q))return null;
  let kind=kindOf(q);if(!kind&&raw.purpose_quote&&owns(q,raw.purpose_quote))kind=raw.purpose==='advance'&&/垫|帮.*付|代付|先.*出/.test(raw.purpose_quote)?'垫付':raw.purpose==='aa'&&/AA|平摊/i.test(raw.purpose_quote)?'AA':raw.purpose==='loan'&&/借给|借出/.test(raw.purpose_quote)?'借款':null;
  if(!['垫付','AA','借款'].includes(kind))return null;
  return advance(s,q,{intent:'people_link',transactionId:t.id,draft:{name:t.merchant,kind,amount:kind==='AA'?'':(t.cents/100).toFixed(2),dueDate:'',dueType:''},stage:kind==='AA'?'share':'date'},raw);
 }
 if(isPeopleContext(context)&&/^(?:好|好的|好吧|嗯|可以|就这样)[。！!\s]*$/.test(q))return advance(s,'',context,{});
 if(context.intent==='payment_interview')return advance(s,q,context,raw);
 if(paymentRequest(q)||(['transfer','people_flow'].includes(raw.intent)&&owns(q,raw.recipient)&&/转|付|借|垫|给|替|帮/.test(q))){
  if(/不要|取消|假如|如果|假设|别转/.test(q))return null;
  const multiple=[/转账|转给/.test(q),/垫付/.test(q),/AA/i.test(q)].filter(Boolean).length>1||/aaa|谁谁|某某|多少钱|…|\.{2}|。{2}/i.test(q),k=multiple?'':kindOf(q);
  return advance(s,multiple?'':q,{intent:'payment_interview',draft:{kind:k||'',name:'',amount:'',dueDate:'',dueType:''}},multiple?{}:raw);
 }
 return null;
}

export function peopleContextAfterOperation(s,type,args={}){
 if(!['repay','offset'].includes(type))return null;
 const c=type==='repay'?s.cases.find(c=>c.id===args.id&&remaining(c)>0):s.cases.find(c=>c.recipient.toLocaleLowerCase()===String(args.name||'').toLocaleLowerCase()&&remaining(c)>0);
 return c?{intent:'people_date',caseId:c.id,stage:'date',draft:{dueDate:'',dueType:''}}:null;
}

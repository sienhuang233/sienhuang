// Conversational profile drafts never change the account. Review and commit use domain.mjs.
import {text} from './domain.mjs';
import {missingProfile,profileCollection,requestedPersona,canPreviewPersona} from '../public/engines/profile.mjs';
import {personas} from '../public/coach-flow-ui.mjs';
const limits={kidStage:5,school:3,city:4,home:4,job:7,commute:3,rel:4,risk:3,time:3,kidCount:2};
const amounts=['incomeNum','rent','leisure','extraAmt','opening'];
const labels={place:'所在城市',incomeNum:'月收入或生活费',home:'居住方式',job:'职业或在校状态',rent:'每月房租（没有填0）',rel:'家庭或关系阶段',opening:'已有存款／账单前期初现金（没有填0）'};
export function cleanDraft(raw={}){
 const d={};if(['none','parttime','internship','unknown'].includes(raw.studentWork))d.studentWork=raw.studentWork;if(Array.isArray(raw.kids)){d.kidCount=raw.kids.length?1:0;if(raw.kids.length){d.kidStage=raw.kids[0].stage;d.school=raw.kids[0].school;}}for(const [k,n] of Object.entries(limits))if(Number.isInteger(Number(raw[k]))&&raw[k]!==''&&raw[k]!=null&&Number(raw[k])>=0&&Number(raw[k])<n)d[k]=Number(raw[k]);
 for(const k of amounts)if(raw[k]!==''&&raw[k]!=null&&Number.isFinite(Number(raw[k]))&&Number(raw[k])>=0&&Number(raw[k])<=100000000)d[k]=Number(raw[k]);
 for(const k of ['place','extraName'])if(text(raw[k],40))d[k]=text(raw[k],40);if(Array.isArray(raw.kids)){d.kidCount=raw.kids.length?1:0;if(raw.kids.length){d.kidStage=raw.kids[0].stage;d.school=raw.kids[0].school;}}return d;
}
function num(s){s=s.replace(/两/g,'二');if(/^[\d.]+$/.test(s))return Number(s);const digits={零:0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};let total=0,section=0,n=0;for(const c of s){if(c in digits)n=digits[c];else if(c==='万'){total+=(section+n)*10000;section=0;n=0;}else{section+=(n||1)*({十:10,百:100,千:1000}[c]||0);n=0;}}return total+section+n;}
export function extractProfile(q){
 const d={},proof={};const set=(k,v,quote)=>{d[k]=v;proof[k]=text(quote,100);};
 const place=q.match(/北京|上海|深圳(?:南山|福田|宝安|龙岗)?|广州|武汉|杭州|成都|南京|长沙|西安|郑州|苏州|重庆|合肥|天津|东莞|珠海|佛山/);
 if(place){set('place',place[0],place[0]);set('city',/深圳南山|深圳福田|北京|上海/.test(place[0])?0:/深圳|广州/.test(place[0])?1:2,place[0]+'（成本档位待核对）');}
 const categories={home:[[/合租/,0],[/整租|独居/,1],[/与家人|和父母|住家里|跟父母|家里住/,2],[/宿舍|住校/,3]],job:[[/互联网|科技|程序员/,0],[/金融|会计|律师/,1],[/制造|工程/,2],[/餐饮|零售|服务员/,3],[/体制内|教师|医护|公务员/,4],[/自由职业|创业/,5],[/在校|大学生|学生|实习/,6]],rel:[[/单身/,0],[/恋爱[^，。；]*(?:不打算结婚|暂无婚)/,1],[/准备结婚|计划结婚/,2],[/已婚/,3]],commute:[[/步行|骑车/,0],[/地铁|公交/,1],[/自驾|打车/,2]]};
 for(const [k,rows] of Object.entries(categories))for(const [re,v] of rows){const m=q.match(re);if(m){set(k,v,m[0]);break;}}
 if(/无兼职|没有兼职|不做兼职/.test(q)&&/无实习|没有实习|不实习/.test(q))set('studentWork','none','已说明无兼职、无实习');else if(/正在实习|有实习|实习收入/.test(q))set('studentWork','internship',q);else if(/有兼职|做兼职|兼职收入/.test(q))set('studentWork','parttime',q);
 if(/无孩|没有孩子|未育/.test(q))set('kidCount',0,q.match(/无孩|没有孩子|未育/)[0]);else if(/一个孩子|有孩子/.test(q))set('kidCount',1,q.match(/一个孩子|有孩子/)[0]);
 const token='([0-9]+(?:\\.[0-9]{1,2})?|[零一二两三四五六七八九十百千万]+)\\s*(万|千|k|K)?';
 for(const [key,tag] of [['incomeNum','月收入|工资|到手|生活费|月薪|收入每月|每月收入'],['rent','房租|月租|租金|房贷'],['leisure','非必要消费|可选消费|娱乐购物|娱乐预算'],['extraAmt','赡养费|给家里|家庭支出'],['opening','期初现金|期初余额|现金起点|现有存款|存款|现金']]){
  const correction=new RegExp('(?:'+tag+')\\s*不是\\s*'+token+'\\s*(?:元|块)?[，,、 ]*(?:而)?(?:是|改成|改为)\\s*'+token),cm=q.match(correction);
  if(cm){const v=num(cm[3])*(cm[4]==='万'?10000:/千|k/i.test(cm[4]||'')?1000:1);set(key,v,cm[0]);continue;}
  const re=new RegExp('(?:'+tag+')\\s*(?:每月|每个月)?\\s*(?:改成|改为|调整为|实际是|是|为|约|大概|有|剩|共|一共|到手|每月|：|:)?\\s*'+token),m=q.match(re);
  if(m&&!/不是|并非|不确定/.test(q.slice(Math.max(0,m.index-5),m.index+m[0].length))){const v=num(m[1])*(/[万]/.test(m[2]||'')?10000:/千|k/i.test(m[2]||'')?1000:1);if(Number.isFinite(v)&&v>=0&&v<=100000000)set(key,v,m[0]);}
 }
 if(/免租|不交房租|没有房租|房租为零|房租0/.test(q))set('rent',0,q.match(/免租|不交房租|没有房租|房租为零|房租0/)[0]);
 if(/没有收入|收入为零/.test(q))set('incomeNum',0,q.match(/没有收入|收入为零/)[0]);
 if(/无家庭负担|没有家庭负担|无需赡养|不用给家里钱/.test(q))set('extraAmt',0,q.match(/无家庭负担|没有家庭负担|无需赡养|不用给家里钱/)[0]);
 if(d.extraAmt!=null)set('extraName','家庭固定支出',proof.extraAmt);
 return {draft:d,proof};
}
export function isProfileMessage(q,context){return !/攒|储蓄目标|存钱|想存/.test(q)&&!/取消|转给|转账|垫付|订阅|账单|会员|推进/.test(q)&&(context?.intent==='coach_profile'||Object.keys(extractProfile(q).draft).length>0||/了解现实条件|继续了解条件/.test(q));}
export function profileQuestion(missing,draft={}){return missing.length?profileCollection(missing,{offerExample:false}):'生活条件已整理好，请在页面核对后确认。';}
export function profilePlan(s,q,context={},modelFields=[]){
 const out={mode:'rules',steps:[],proposal:null};if(!s.goal)return {...out,reply:'你想攒多少钱，打算多久攒到？可以直接对我说。'};
 const persona=requestedPersona(q);
 if(persona){
  if(!canPreviewPersona(s))return {...out,reply:'当前已有个人资料或账本，模拟条件不会覆盖它们。可以继续补充或核对你的实际条件。',context};
  const preview=profilePlan({...s,coach:null},personas[persona],{intent:'coach_profile',profileDraft:{},profileProof:{},profileSimulated:true});
  return {...preview,flowControlled:true,reply:'以下是明确虚构的模拟条件，原储蓄目标保留；尚未保存。请在页面核对，确认后再计算三种储蓄方案。',context:{...preview.context,profileSimulated:true},interview:{...preview.interview,simulated:true}};
 }
 if(/算了|先不|取消|不用了/.test(q))return {...out,reply:'先暂停补充生活条件。已保存的信息没有变化。'};
 const {draft:fresh,proof}=extractProfile(q),draft={...cleanDraft(s.coach||{}),...cleanDraft(context.profileDraft),...fresh},sources={};
 for(const [k,v] of Object.entries(context.profileProof||{}))if(k in draft)sources[k]=text(v,100);
 Object.assign(sources,proof);
 if(context.intent==='coach_profile'&&!Object.keys(fresh).length&&/\d/.test(q)&&/月|年/.test(q)&&!/工资|收入|生活费|房租|存款|支出/.test(q))modelFields=[];
 // The model may understand word order, but every extracted value needs a verbatim evidence quote.
 const moneyTags={incomeNum:/工资|薪|收入|到手|公司.*到账|生活费/,rent:/房租|租金|月租|房贷/,leisure:/娱乐|购物|非必要|可选消费/,extraAmt:/赡养|家庭支出|给家里/,opening:/期初|现金起点|现有存款|存款/};
 for(const f of Array.isArray(modelFields)?modelFields:[]){
  const k=f?.field,n=limits[k],quote=text(f?.quote,100),v=Number(f?.value);
  if(k in fresh||quote.length<2||!q.includes(quote)||/不是|并非|不确定|不知道/.test(quote))continue;
  if(n&&Number.isInteger(v)&&v>=0&&v<n){draft[k]=v;sources[k]=quote+'（AI归类，待你核对）';}
  else if(moneyTags[k]?.test(quote)&&Number.isFinite(v)&&v>=0&&v<=100000000){
   const tokens=[...quote.matchAll(/([0-9]+(?:\.[0-9]{1,2})?)\s*(万|千|k|K)?|([零一二两三四五六七八九十百千万]+)/g)];
   if(tokens.some(m=>m[1]?Number(m[1])*(m[2]==='万'?10000:/千|k/i.test(m[2]||'')?1000:1)===v:num(m[3])===v)){draft[k]=v;sources[k]=quote+'（AI提取，数字已对照原话）';}
  }
 }
 const missing=missingProfile(s,draft),hasNew=Object.keys(sources).some(k=>sources[k]!==context.profileProof?.[k])||Object.keys(fresh).some(k=>fresh[k]!==context.profileDraft?.[k]),offerExample=canPreviewPersona(s);
 const analysis=[{title:'先看固定责任',detail:'先保留房租和必要的家庭支出，再看哪些地方可以调整。'},{title:'把波动写进假设',detail:draft.job===6?(draft.studentWork==='none'?'已说明无兼职、无实习。家庭生活费按你确认的金额固定，支出仍有波动；不假设失业或工资增长。':'你描述的是在校或实习阶段。生活费或实习收入按你报的数进入模型；不能把未来工资上涨当作已知事实。'):'收入和开销可能波动。这次按已说明的演示参数计算，不根据职业猜测你的工资或稳定程度。'},{title:'先核对，再给比例',detail:'未收回的人情款不计入现有存款；达标比例由程序按已确认的假设计算。'}];
 if(draft.incomeNum!=null&&draft.rent!=null)analysis.unshift({title:'程序先核对固定开销',detail:draft.incomeNum>0?'已填写的房租占月收入或生活费约'+Math.round(draft.rent/draft.incomeNum*100)+'%。餐饮、交通和家庭支出还要一起考虑，剩余部分不等于都能存下。':'目前确认的收入为零。会按已有资金和必要开销检查计划，不能靠假设收益填补收入。'});
 const targetOnly=!hasNew&&/\d/.test(q)&&/月|年/.test(q)&&!/工资|收入|生活费|房租|存款|支出/.test(q);
 return {...out,reply:missing.length?(targetOnly?'这条是目标金额和期限，当前储蓄目标没有改动。':hasNew?'已整理本次提供的条件。':'')+profileCollection(missing,{offerExample}):'生活条件已整理好，还没确认。请在页面核对信息和模拟假设，确认后再计算三种储蓄方案。',context:{intent:'coach_profile',profileDraft:draft,profileProof:sources,profileReady:!missing.length,profileOfferPersona:!!missing.length&&offerExample,...(context.profileSimulated?{profileSimulated:true}:{})},interview:{draft,proof:sources,missing:missing.map(k=>labels[k]),analysis,ready:!missing.length,...(context.profileSimulated?{simulated:true}:{})},next:missing.length?'coach_interview':'coach_review'};
}

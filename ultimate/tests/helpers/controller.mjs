import {paymentDraft,linkDraft,dateDraft} from '../../public/people-flow-ui.mjs';
import {captureScroll,restoreScroll} from '../../public/engines/navigation.mjs';
import {continuationPlan,contextAfter,recentDialogue} from '../../lib/conversation.mjs';
import {executionPlan} from '../../public/engines/plan.mjs';
import {sampleDue} from '../../public/engines/people.mjs';
import {peopleOverview} from '../../public/people-ui.mjs';
import {analyzeBills} from '../../public/engines/bill-analysis.mjs';
import {hasCompleteProfile,missingProfile,profileCollection,canPreviewPersona} from '../../public/engines/profile.mjs';
import * as goalPageUI from '../../public/goal-page-ui.mjs';
import {recommendationStrip} from '../../public/recommendation-ui.mjs';
import {routeBasis,adjustedGoal} from '../../public/engines/coach-scenario.mjs';
import {quoteComposer,installQuoteGestures} from '../../public/quote-ui.mjs';
import {normalizeQuote} from '../../public/engines/quote.mjs';
import {chatMessages} from '../../public/chat-ui.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {initial,apply,summary,day} from '../../lib/domain.mjs';
import {deterministicPlan} from '../../lib/agent.mjs';
import {recommend} from '../../lib/tasks.mjs';
import * as conversation from '../../public/engines/conversation.mjs';
import {pendingAdvanceTask,savedBillPeriod,sampleWeekRows,summarizeWeek,weekWindow} from '../../public/engines/weekly.mjs';
import {profileReview,profileArgs,personas} from '../../public/coach-flow-ui.mjs';
import {billAnalysisReport} from '../../public/bill-ui.mjs';
import {billSourceDialog} from '../../public/plan-ui.mjs';
import * as planUI from '../../public/plan-ui.mjs';
import * as billUI from '../../public/bill-ui.mjs';
import * as agentUI from '../../public/agent-ui.mjs';
import * as coachUI from '../../public/coach-ui.mjs';
import * as introUI from '../../public/intro-ui.mjs';

const view=s=>({state:s,summary:summary(s),recommendation:recommend(s),user:{id:'test-account',name:'test'},csrf:'test'});
export function controller(state=initial()){
 const app=readFileSync(new URL('../../public/app.mjs',import.meta.url),'utf8');
 const source=app.slice(0,app.indexOf("document.addEventListener('click'" )).replace(/^import .*;\n/gm,'')+'\n'+app.slice(app.indexOf('async function checkVisibleDue(){'),app.indexOf('setInterval(checkVisibleDue'));
 let current=structuredClone(state),serial=0,chatHistory=[];const proposals=new Map(),calls=[],dialogs=[],input={value:''};
 const dialog={open:false,close(){this.open=false;},querySelector(){return null;}},mount={innerHTML:''},scroll={scrollTop:0,scrollHeight:100};
 const query=s=>s==='#dialog'?dialog:s==='#chatForm textarea'?input:s==='#app'?mount:s==='.chat-scroll'?scroll:null;
 const api=async(path,args)=>{
  calls.push({path,args});
  if(path==='state')return view(current);
  if(path==='chat'){let result=continuationPlan(current,args.message,args.context,args.view,chatHistory)||deterministicPlan(current,args.message,args.context);result={...result,context:contextAfter(result,args.context)};chatHistory=recentDialogue([...chatHistory,{role:'user',text:args.message},{role:'assistant',text:result.reply}]);return result;}
  if(path==='prepare'){
   const result=apply(structuredClone(current),args.type,args.args),id='p-'+ ++serial;
   proposals.set(id,{...args,result});return {id,type:args.type,label:args.type,risk:'yellow',result:result.result,before:summary(current),after:summary(result.state)};
  }
  if(path==='commit'){const p=proposals.get(args.id);assert.ok(p);current=p.result.state;proposals.delete(args.id);return {result:p.result.result};}
  if(path==='cancel'){proposals.delete(args.id);return {};}
  if(path==='bill-analysis'){current.billReports=current.billReports||{};current.billReports[args.period]={...analyzeBills(current,args.period),analyzedAt:new Date().toISOString()};current.lastBillPeriod=args.period;current.billAnalysisCompleted=true;if(current.billDecisions)delete current.billDecisions[args.period];return {};}
  throw Error('unexpected API: '+path);
 };
 const documentAdapter={querySelector:query,hidden:false,activeElement:null,addEventListener(){},removeEventListener(){}};input.focusCount=0;input.focus=()=>{input.focusCount++;documentAdapter.activeElement=input;};input.setSelectionRange=(start,end)=>{input.selectionStart=start;input.selectionEnd=end;};
 const noopSession={request:async()=>({}),refresh:async()=>({}),state:async()=>({})};const createSessionClient=()=>noopSession;
 const scope=vm.createContext({console,structuredClone,setTimeout,Date,createSessionClient,captureScroll,restoreScroll,paymentDraft,linkDraft,dateDraft,document:documentAdapter,window:{scrollTo(){}},quoteComposer,normalizeQuote,hasCompleteProfile,missingProfile,profileCollection,canPreviewPersona,...goalPageUI,recommendationStrip,routeBasis,adjustedGoal,chatMessages,executionPlan,sampleDue,peopleOverview,...conversation,...planUI,...billUI,...agentUI,...coachUI,...introUI,pendingAdvanceTask,savedBillPeriod,sampleWeekRows,summarizeWeek,weekWindow,profileReview,profileArgs,personas,billAnalysisReport,billSourceDialog});
 vm.runInContext(source,scope);
 scope.mockApi=api;scope.mockDialog=html=>{dialog.open=true;dialogs.push(html);};scope.mockView=view(current);
 vm.runInContext(`api=mockApi;data=mockView;const productionRender=render;render=()=>{};syncCompactTables=()=>{};toast=()=>{};showDialog=mockDialog;globalThis.driver={chat,act,afterSaved,prepare,commitPending,commitInlineGoal,confirmRoute,sendChatInput,currentRecommendation,close,checkVisibleDue,begin:startCoachInterview,back:dialogBack,render:productionRender,dump:()=>JSON.parse(JSON.stringify({page,messages,agentContext,coachInterview,chatExpanded,pending,routeComparison,goalScreen,goalReview,goalEditDraft,routePreview,replyQuote,peoplePanel,peopleHistory,profileCollectEditing,focusTarget,renderedScene})),setContext:c=>{agentContext=c;},setView:v=>{data=v;},setHistory:h=>{dialogHistory=h;},setApi:f=>{api=f;}};`,scope);
 return {driver:scope.driver,calls,dialogs,dialog,input,api,mount,document:documentAdapter,get state(){return current;}};
}


import {SUBSCRIPTION_REQUEST,isSubscriptionMainline} from './engines/subscriptions.mjs';
import {paymentDraft,linkDraft,dateDraft} from './people-flow-ui.mjs';
import {captureScroll,restoreScroll,installViewport} from './engines/navigation.mjs';
import {sampleDue} from './engines/people.mjs';
import {installChatKeyboard} from './engines/chat-input.mjs';
import {executionPlan} from './engines/plan.mjs';
import {peopleOverview} from './people-ui.mjs';
import {hasCompleteProfile,missingProfile,profileCollection,canPreviewPersona} from './engines/profile.mjs';
import {createSessionClient} from './engines/session.mjs';
import {normalizeQuote} from './engines/quote.mjs';
import {quoteComposer,installQuoteGestures} from './quote-ui.mjs';
import {recommendationStrip} from './recommendation-ui.mjs';
import {goalSteps,goalEditor,goalConfirmation,buildRoutePreview,routePreviewPage} from './goal-page-ui.mjs';
import {routeBasis,adjustedGoal} from './engines/coach-scenario.mjs';
import {chatMessages} from './chat-ui.mjs';
import {goalPrompt,nextStepText,transferPurposeText,isNextStepMessage,billSourceTask} from './engines/conversation.mjs';
import {summarizeWeek,sampleWeekRows,weekWindow,savedBillPeriod} from './engines/weekly.mjs';
import {scenarioCards,featureIntro} from './intro-ui.mjs';
import {goalExecution,billSourceDialog,weeklyCheckinDialog,weeklyFeedbackMarkup,reminderDialog,longTermPlanDialog} from './plan-ui.mjs';
import {billAnalysisReport,billOpportunityDialog} from './bill-ui.mjs';
import {nextTaskCard,methodsCard,securityPage} from './agent-ui.mjs';
import {readStatement} from './engines/import.mjs';
import {CAT_NAME} from './engines/classifier.mjs';
import {coachForm,coachResult} from './coach-ui.mjs';
import {personas,profileArgs,profileReview} from './coach-flow-ui.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=n=>n==null?'待补充':'¥'+(n/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const yuan=n=>n==null?'':(n/100).toFixed(2),today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),demoDatePlus=n=>new Date(Date.parse(today()+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),remain=c=>Math.max(0,Math.round(c.amount*100)-Math.round(c.paid*100)-Math.round(c.offset*100));
let renderedScene=null,renderedChat='',focusTarget=null,dockObserver=null;
function focusMain(selector){focusTarget=selector;}
function syncDockHeight(){const dock=document.querySelector('#chat');if(!dock||!window.matchMedia('(max-width:900px)').matches)return;const height=Math.ceil(dock.getBoundingClientRect().height)+'px';if(document.documentElement.style.getPropertyValue('--chat-dock-height')!==height)document.documentElement.style.setProperty('--chat-dock-height',height);}
function observeDock(){dockObserver?.disconnect();const dock=document.querySelector('#chat');if(dock&&typeof ResizeObserver!=='undefined'){dockObserver=new ResizeObserver(syncDockHeight);dockObserver.observe(dock);}syncDockHeight();}
let recommendationSending=false,commitBusy=false,workspaceBusy=false,importBusy=false,importReturn=null,subscriptionReturn=null;
const workspaceDrafts=new Map();
let billSourceChosen=false,weeklyDraft=null,replyQuote=null,profileCollectEditing=false,peoplePanel=null,peopleHistory=[];
let dialogHistory=[],goalReturn=null,outcomePhase='goal';
let routeComparison=false,goalScreen='auto',goalReview=null,goalEditDraft=null,goalSaving=false,routePreview=null,routeSaving=false,routeError='',lastRecommendationTitle='';
let coachInterview=null,coachMode='rules',dialogEpoch=0,activeTask=null;
let whatIf=null,data=null,page='home',messages=[{who:'ai',text:'钱程陪刚开始自己管钱的人，把愿望变成可执行的储蓄计划。先告诉我，例如“我想两年攒2万去旅行”。我会理解需求、补齐缺失信息；涉及资金的模拟操作会交给你确认。'}],agentContext={},pending=null,importData=null,bind=null,period=today().slice(0,7),aiBusy=false,lastModelMode=null,chatExpanded=false;
const navs=[['home','⌂','首页'],['goal','①','目标教练'],['bills','②','账单体检'],['debts','③','人情往来'],['intro','◉','功能介绍']];
const types={expense:'消费',income:'已确认收入',loan_out:'待收往来',borrow_in:'借入',repayment:'本金归还',refund:'退款待核对',neutral:'中性流水',unknown:'用途待确认',unknown_in:'收入性质待确认'};
const sessionClient=createSessionClient({state:()=>data,fetchImpl:(...args)=>fetch(...args)});
async function api(path,body){return sessionClient.request(path,body);}
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',4200);}
function btn(label,act,cls='',extra=''){return `<button class="${cls}" data-act="${act}" ${extra}>${label}</button>`;}
function field(label,name,value='',type='text',extra=''){return `<label>${label}<input name="${name}" value="${esc(value)}" type="${type}" ${extra}></label>`;}
function select(label,name,choices,val=''){return `<label>${label}<select name="${name}">${choices.map(([v,t])=>`<option value="${v}" ${String(val)===String(v)?'selected':''}>${t}</option>`).join('')}</select></label>`;}
function formDialog(title,form,fields,note=''){if(['profile','offset','contact'].includes(form))agentContext={intent:'form_input',form};if(['reserve','purchase'].includes(form))agentContext={intent:form};openTask(`<h2>${title}</h2>${note?`<p class="subtle muted">${esc(note)}</p>`:''}<form data-form="${form}"><div class="formgrid">${fields}</div><p class="error" id="formError"></p><div class="sticky">${btn('保存这一步','submit-form','primary','type="submit"')}</div></form>`);}
function dialogSnapshot(){const d=$('#dialog');if(!d.open||d.querySelector('[data-form="commit"]')||/正在计算/.test(d.textContent))return null;return {html:d.querySelector('.dialog-content')?.innerHTML||'',page,weeklyDraft:d.__weeklyDraft?structuredClone(d.__weeklyDraft):null,backHtml:d.querySelector('.dialog-nav [data-back-control]')?.outerHTML,values:[...d.querySelectorAll('input,select,textarea')].map((el,index)=>({index,name:el.name,id:el.id,value:el.value,checked:el.checked}))};}
function showDialog(html,remember=true,backHtml=null){const d=$('#dialog'),snap=remember?dialogSnapshot():null;if(snap?.html)dialogHistory.push(snap);if(dialogHistory.length>16)dialogHistory.shift();
 const t=document.createElement('template');t.innerHTML=html;
 const backs=[...t.content.querySelectorAll('button[data-act]')].filter(b=>['back-goal','dialog-back'].includes(b.dataset.act)||b.textContent.trim().startsWith('←')&&b.dataset.act!=='reset-lever');
 const chosen=backs[0];if(!backHtml)backHtml=chosen?.outerHTML||btn('← 返回上一步','dialog-back','small');backs.forEach(b=>b.remove());
 const b=document.createElement('template');b.innerHTML=backHtml;const control=b.content.querySelector('button');control.setAttribute('data-back-control','');control.type='button';control.classList.add('small');
 d.innerHTML='<div class="dialog-nav">'+control.outerHTML+btn('×','close','close','aria-label="关闭"')+'</div><div class="dialog-content">'+t.innerHTML+'</div>';d.__weeklyDraft=html.includes('data-form="weekly-checkin"')&&weeklyDraft?structuredClone(weeklyDraft):null;if(!d.open)d.showModal();d.scrollTop=0;}
function openTask(html,remember=true,backHtml=null){if(page==='debts')return openPeoplePanel(html,remember);return showDialog(html,remember,backHtml);}
function openPeoplePanel(html,remember=true){if(remember&&peoplePanel)peopleHistory.push(structuredClone(peoplePanel));if(peopleHistory.length>12)peopleHistory.shift();peoplePanel={html,values:null,context:structuredClone(agentContext)};page='debts';focusMain('#people-workspace');render();}
function restorePeopleForm(){const f=document.querySelector('#people-workspace form');if(!f||!peoplePanel?.values)return;for(const el of f.elements){const v=peoplePanel.values.find(v=>v.name===el.name);if(v){if(el.type!=='file')el.value=v.value;if(el.type==='checkbox'||el.type==='radio')el.checked=v.checked;}}}
async function discardPending(preserveContext=false){if(pending){const id=pending.id;pending=null;await api('cancel',{id,preserveContext});}}
function workspaceKey(scope=data?.workspace?.active||'original'){return data.user.id+':'+scope;}
function captureWorkspaceDraft(){
 return structuredClone({scope:data.workspace?.active||'original',subscriptionReturn,page,messages,agentContext,replyQuote,weeklyDraft,profileCollectEditing,peoplePanel,peopleHistory,goalReturn,outcomePhase,routeComparison,goalScreen,goalReview,goalEditDraft,routePreview,routeError,coachInterview,coachMode,whatIf,activeTask,billSourceChosen,period,lastModelMode,chatExpanded,pending,dialog:dialogSnapshot(),chatDraft:$('#chatForm textarea')?.value||'',homeDraft:$('#homeChatForm textarea')?.value||''});
}
function restoreWorkspaceDraft(d,{reactivate=false}={}){
 ({subscriptionReturn,page,messages,agentContext,replyQuote,weeklyDraft,profileCollectEditing,peoplePanel,peopleHistory,goalReturn,outcomePhase,routeComparison,goalScreen,goalReview,goalEditDraft,routePreview,routeError,coachInterview,coachMode,whatIf,activeTask,billSourceChosen,period,lastModelMode,chatExpanded,pending}=d);
 if(reactivate&&pending){pending=null;if(goalReview){goalReview=null;goalScreen='goal-edit';}}
 renderedScene=null;lastRecommendationTitle='';render();
 if($('#chatForm textarea'))$('#chatForm textarea').value=d.chatDraft;
 if($('#homeChatForm textarea'))$('#homeChatForm textarea').value=d.homeDraft;
 $('#chatForm')?.classList.toggle('has-input',!!d.chatDraft);
 if(d.dialog){showDialog(d.dialog.html,false,d.dialog.backHtml);for(const v of d.dialog.values){const el=$('#dialog').querySelectorAll('input,select,textarea')[v.index];if(el){if(el.type!=='file')el.value=v.value;if(['checkbox','radio'].includes(el.type))el.checked=v.checked;}}}
}
function resetWorkspaceView(){
 const input=$('#chatForm textarea');if(input)input.value='';
 messages=[];agentContext={};subscriptionReturn=null;replyQuote=null;weeklyDraft=null;profileCollectEditing=false;peoplePanel=null;peopleHistory=[];dialogHistory=[];goalReturn=null;outcomePhase='goal';routeComparison=false;goalScreen='auto';goalReview=null;goalEditDraft=null;routePreview=null;routeError='';coachInterview=null;coachMode='rules';whatIf=null;activeTask=null;pending=null;billSourceChosen=true;page='bills';lastModelMode=null;renderedScene=null;lastRecommendationTitle='';
}
function billWorkspaceLinks(){
 const w=data.workspace;if(!w?.saved?.length)return '';
 return `<div class="row"><small>当前：${esc(w.label)} · 数据单独保存</small><div class="stack">${w.saved.map(x=>btn('返回'+x.label,'bill-workspace','small',`data-scope="${esc(x.scope)}" ${workspaceBusy||aiBusy||commitBusy?'disabled':''}`)).join('')}</div></div>`;
}
async function switchBillWorkspace(scope){
 if(workspaceBusy||aiBusy||commitBusy||importBusy)return;
 workspaceBusy=true;
 try{
  const saved=captureWorkspaceDraft(),key=workspaceKey();
  await api('bill-workspace',{scope,revision:data.revision});
  workspaceDrafts.set(key,saved);importReturn=null;dialogEpoch++;$('#dialog').close();resetWorkspaceView();await refresh();
  const draft=workspaceDrafts.get(workspaceKey());if(draft){restoreWorkspaceDraft(draft,{reactivate:true});if(draft.pending)await prepare(draft.pending.type,draft.pending.args,true);}else {restoreConversation(data);period=savedBillPeriod(data.state,data.state.lastBillPeriod||today().slice(0,7));render();}
 }finally{workspaceBusy=false;render();}
}
function close(){const subPending=pending?.type==='subscription';const back=importReturn;importReturn=null;peoplePanel=null;peopleHistory=[];dialogEpoch++;goalReturn=null;whatIf=null;weeklyDraft=null;if(pending){const id=pending.id;pending=null;api('cancel',{id}).catch(()=>{});}dialogHistory=[];$('#dialog').close();if(back)restoreWorkspaceDraft(back);if(subPending)pauseSubscriptionView();}
async function dialogBack(){if(importReturn&&!dialogHistory.length){close();return;}dialogEpoch++;await discardPending();const snap=dialogHistory.pop();if(!snap){close();return;}page=snap.page;weeklyDraft=snap.weeklyDraft?structuredClone(snap.weeklyDraft):null;render();openTask(snap.html,false,snap.backHtml);for(const v of snap.values){const el=$('#dialog').querySelectorAll('input,select,textarea')[v.index];if(el){if(el.type!=='file')el.value=v.value;if(el.type==='checkbox'||el.type==='radio')el.checked=v.checked;}}$('#dialog').querySelectorAll('button[data-busy-submit]').forEach(b=>{b.disabled=false;delete b.dataset.busySubmit;});if(importReturn&&$('#fileInput')){$('#fileInput').disabled=false;$('#fileInput').value='';$('#formError').textContent='';}}
const blankForDemo=s=>!s.demo&&!s.openingKnown&&!s.goal&&!s.transactions.length&&!s.cases.length&&!s.contacts.length;
async function refresh(){
 const next=await api('state');
 if(data&&data.user.id===next.user.id&&data.workspace?.active!==next.workspace?.active&&!commitBusy&&!workspaceBusy){
  const saved=captureWorkspaceDraft();workspaceDrafts.set(workspaceKey(),saved);importReturn=null;dialogEpoch++;$('#dialog').close();resetWorkspaceView();data=next;
  const draft=workspaceDrafts.get(workspaceKey());if(draft)restoreWorkspaceDraft(draft,{reactivate:true});else {restoreConversation(data);period=savedBillPeriod(data.state,data.state.lastBillPeriod||today().slice(0,7));render();}
  return;
 }
 data=next;render();
}
function render(){if(!data){login();return;}const desktopBusiness=window.matchMedia?.('(min-width:901px)')?.matches===true&&['goal','bills','debts'].includes(page),scroll=captureScroll(document,window),sceneChanged=renderedScene!==page,chatKey=messages.length+':'+(messages.at(-1)?.text||'')+':'+chatExpanded;const oldComposer=$('#chatForm textarea'),chatDraft=oldComposer?.value||'',keepComposerFocus=!!oldComposer&&document.activeElement===oldComposer,composerSelection=keepComposerFocus?[oldComposer.selectionStart,oldComposer.selectionEnd]:null,recommendation=currentRecommendation(),recommendationText=recommendation.message,recommendationChanged=!!lastRecommendationTitle&&lastRecommendationTitle!==recommendation.title;lastRecommendationTitle=recommendation.title;$('#app').innerHTML=`<div class="layout ${desktopBusiness?'business-layout':''} page-${page} ${page==='home'||page==='intro'?'home-no-chat':''}"><aside class="sidebar"><div class="brand"><span class="brand-logo" aria-hidden="true">钱</span><span class="brand-name">钱程</span><small>QIANCHENG</small></div><nav class="nav" aria-label="主要场景">${navs.map(([p,n,l])=>btn(`<span class="nav-icon nav-icon-${p}">${p==='home'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10 12 3l8 7v10h-6v-6h-4v6H4Z"/></svg>':p==='intro'?'<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5"/><circle cx="6" cy="6" r="2.5" class="solid"/></svg>':n}</span>${l}`,'nav',page===p?'on':'',`data-page="${p}"`)).join('')}</nav><div class="sidefoot">金融服务，接得上生活。<br>参赛沙箱 · 无真实银行交易<br><span class="legacy-account">${esc(data.user.name)}</span><br>${btn('安全、方法与数据','to-security','small')}<br><span class="legacy-account">${btn('退出账户','logout','small')}</span></div><details class="desktop-account"><summary aria-label="账户信息"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.3"/><path d="M5.5 20v-2a6.5 6.5 0 0 1 13 0v2"/></svg></summary><div class="account-menu"><b>${esc(data.user.name)}</b><small>账户：${esc(data.user.id)}</small>${btn('退出账户','logout','small')}</div></details></aside><main class="main"><div class="topline"><span>你的钱，有来处，也有去处。</span><span><span class="badge warn">${data.state.demo?'虚构演示数据':data.workspace?.active?.startsWith('sim-')?'模拟记录 · 原真实账单保留':data.workspace?.hasSimulation?'模拟记录 · 银行业务为模拟':'个人账户 · 银行业务为模拟'}</span> ${esc(data.user.name)} ${btn('退出','logout','small mobile-chat')}</span></div>${({intro:intro,home:home,bills:bills,debts:debts,goal:goal,security:security})[page]()}</main><aside class="chat ${replyQuote?'has-reply-quote':''} ${chatExpanded?'chat-expanded':''}" id="chat"><div class="chat-head"><button class="chat-expand small" data-act="toggle-chat" aria-expanded="${chatExpanded}">${chatExpanded?'收起对话':'展开对话'}</button><h3>钱程助手 <span class="badge">${aiBusy?'正在回复…':lastModelMode==='request-failed'?'请求未完成':lastModelMode==='ai'?'模型已回应':lastModelMode==='rules-fallback'?'模型降级':lastModelMode==='rules'?'规则模式':data.aiEnabled?'模型已配置':'规则模式'}</span></h3><small>${desktopBusiness?'关键操作由你确认':'长按消息可引用，关键操作由你确认'}</small></div><div class="chat-scroll"><div class="messages" role="log" aria-label="钱程聊天记录">${chatMessages(desktopBusiness&&(messages.length===0||messages.length===1&&messages[0].text.startsWith('钱程陪刚开始自己管钱的人'))?[{who:'ai',text:({goal:'你想攒多少钱，打算多久攒到？可以直接对我说。',bills:'先选一份账单：导入自己的，或用虚构账单体验。选好后，再核对消费和可以调整的支出。',debts:'告诉我一笔垫付、借还款或AA，我帮你核对记录。'})[page]}]:messages,data.user,agentContext.subscriptionFlow,aiBusy||!!pending)}</div>${desktopBusiness?'':`<section class="chat-examples"><h4>试着说一句</h4><div class="agent-examples">${btn('我想两年攒2万去旅行','send-example','small','data-message="我想两年攒2万去旅行"')}${btn('分析账单，找找调整空间','send-example','small','data-message="分析账单，找找调整空间"')}${btn('给小王垫付100元','send-example','small','data-message="给小王垫付100元"')}</div></section>`}</div><div class="chat-composer">${quoteComposer(replyQuote)}${desktopBusiness?'<p class="composer-guidance">说说你的想法，也可以直接发送下方推荐。</p>':recommendationStrip(recommendation.title,recommendationChanged,aiBusy||goalSaving||routeSaving)}<form id="chatForm" class="${chatDraft?'has-input':''}">${desktopBusiness?`<button type="button" class="input-recommendation" style="user-select:none;-webkit-user-select:none" data-act="follow-recommendation" ${aiBusy||goalSaving||routeSaving?'disabled':''}>钱程推荐：${esc(recommendation.title)}</button>`:''}<textarea name="message" aria-label="给钱程的需求" maxlength="600" placeholder="${esc(recommendationText)}"></textarea><button class="primary" title="电脑：Enter发送，Shift+Enter换行" ${aiBusy?'disabled':''}>${aiBusy?'…':'发送'}</button></form><small class="footnote ${desktopBusiness?'technical-footer':''}">${data.aiEnabled?'发送当前会话近期对话、主动引用与任务状态，不自动发送完整账单；模型状态以本次回复为准。':'规则模式：服务器未读到 BIGMODEL_API_KEY 和 BIGMODEL_MODEL。CloudBase 配好后须重新部署；本地修改 .env 后须重启。'}</small></div></aside></div>`;const composer=$('#chatForm textarea');composer.value=chatDraft;if(keepComposerFocus){composer.focus({preventScroll:true});if(composerSelection.every(Number.isInteger))composer.setSelectionRange(...composerSelection);}restorePeopleForm();observeDock();restoreScroll(document,window,scroll,{sceneChanged,focus:focusTarget,chatChanged:renderedChat!==chatKey});focusTarget=null;renderedScene=page;renderedChat=chatKey;syncCompactTables();}
function metrics(){const s=data.summary;return `<div class="metrics">${[['账户现金',s.cashCents,'期初 + 全部已计入流水'],['本月消费',s.expenseCents,'借出与还款本金不算消费'],['待收回',s.receivableCents,'收回前不计可用资金'],['可用资金',s.availableCents,'扣预留 / 应急金 / 待还']].map(([l,n,f])=>`<div class="metric"><small>${l}</small><b>${money(n)}</b><small>${f}</small></div>`).join('')}</div>`;}
function intro(){return featureIntro(data.state);}
function markAssistantOnboarded(){try{localStorage.setItem('qc-onboard-v1','1');}catch{}}
function home(){const st=data.state,s=data.summary,started=st.demo||st.openingKnown||st.goal||st.transactions.length;
 return `<div class="home-new"><div class="home-new-head"><h1 class="home-title"><span class="home-title-accent">想攒点钱，</span>钱程陪你理清怎么做。</h1><p class="home-new-sub">定储蓄计划、分析账单、记清人情账，从一句话开始。</p></div><section class="card home-agent" id="home-agent"><form id="homeChatForm"><textarea name="message" maxlength="600" placeholder="帮我设一个攒钱目标" aria-label="给钱程的需求"></textarea><button class="primary" type="submit" title="发送" ${aiBusy?'disabled':''} aria-label="发送">${aiBusy?'…':'↗'}</button></form></section></div>`;}
function bills(){if(!billSourceChosen)return billWorkspaceLinks()+billSourceDialog(data,period);
 const st=data.state,tx=st.transactions.filter(t=>t.date.startsWith(period));
 return `${billWorkspaceLinks()}<div class="row"><div><div class="eyebrow">消费分析 · 行动 · 目标联动</div><h1>账单体检</h1></div><div class="stack">${!st.transactions.some(t=>t.source==='demo')?btn('载入模拟消费账单','sample-bill','primary'):''}${btn('导入自己的账单','import')}</div></div><p class="muted">先看钱花在哪里，再找你愿意调整的一项，把确认后的未来预算反馈给目标教练。不是只检查订阅，也不把必要支出和亲友往来一律判为浪费。</p><label style="max-width:180px">分析月份<input id="period" type="month" value="${period}"></label>${st.billReports?.[period]?billAnalysisReport(data,period):'<section class="card"><h2>本月账单等待你发起分析</h2><p>选择数据来源后再分析，不因新增往来重复执行。</p></section>'}<button class="small" data-act="bill-existing">${st.billReports?.[period]?'按当前账单重新分析（手动）':'分析本月账单'}</button><section class="card"><h3>先核对，才知道怎么调整</h3><p>用途不明、可能重复或大额一次性支出都只是线索；没有完整账单时不推断整月总支出。</p><div class="stack">${btn('让钱程推荐下一步','agent-next','primary small')}${btn('自行核对完整月度预算','bill-calibrate','small')}${st.transactions.some(t=>t.id==='sample-loan')?btn('核对给小王的'+money(st.transactions.find(t=>t.id==='sample-loan').cents),'review-sample','small'):''}</div></section><section class="card"><h3>交易明细 <small>${tx.length}笔</small></h3><div class="tablewrap"><table><thead><tr><th>交易／来源</th><th>金额</th><th>口径与依据</th><th>核对与衔接</th></tr></thead><tbody>${tx.map(t=>`<tr><td><strong>${esc(t.merchant)}</strong>${esc(t.date)}<small>${esc(t.desc)}${t.simulated?' · 模拟':''}</small></td><td>${t.direction==='in'?'+':t.direction==='out'?'−':''}${money(t.cents)}</td><td>${t.excluded?'已排除':t.duplicateOf?'疑似重复':types[t.kind]||t.kind}<small>${esc(t.catWhy||'用户操作生成')}</small></td><td class="actions">${t.duplicateOf&&!t.excluded?btn('核对重复','duplicate','small',`data-id="${t.id}"`):t.excluded?'已核对':t.caseId?'<span class="badge">已关联人情账</span>':`${btn('改口径','classify','small',`data-id="${t.id}"`)} ${t.direction!=='neutral'?btn('关联往来','link','small',`data-id="${t.id}"`):''}`}</td></tr>`).join('')}</tbody></table></div>${!tx.length?'<div class="empty">先上传账单，或载入明确虚构的示例。</div>':''}</section>`;
}
function debts(){return peopleOverview(data,peoplePanel);}
function goal(){const st=data.state,g=st.goal;
 const header=`<div class="row"><div><div class="eyebrow">① 目标教练 · 目标到执行</div><h1>目标教练</h1></div>${btn(g?'修改目标':'设定目标','goal','primary')}</div>`;
 if(goalScreen==='goal-edit')return header+goalEditor(goalEditDraft);
 if(goalScreen==='goal-review'&&goalReview&&pending?.id===goalReview.id)return header+goalConfirmation(goalReview,goalSaving);
 if(goalScreen==='profile-review'&&coachInterview?.ready)return header+`<section class="card inline-profile" id="goal-workspace">${profileReview(st,coachInterview,coachMode)}</section>`;
 if(goalScreen==='profile-edit')return header+`<section class="card inline-profile" id="goal-workspace"><button class="small" data-act="return-goal-steps">← 返回目标概览</button>${coachForm({...st,coach:goalEditDraft?.profile||st.coach})}</section>`;
 if(goalScreen==='route-preview'&&routePreview)return header+routePreviewPage(routePreview,routeSaving,routeError);
 if(goalScreen==='routes'&&g&&st.coach)return header+goalSteps(data,profileCollectEditing,whatIf?adjustedGoal(st,whatIf.kind).goal:null)+coachResult(data,whatIf,true,false,true);
 const currentRoute=g&&st.coach&&st.coachRoute&&st.coachRoute.basis===routeBasis(st,data.summary.availableCents);
 if((goalScreen==='execution'||goalScreen==='auto'&&currentRoute)&&g&&st.coach&&st.coachRoute)return header+goalExecution(data)+`<details class="card"><summary>核对生活条件与资金用途</summary><div class="stack">${btn('修改个人处境','coach-profile','small')}${btn('修改资金起点和应急金','profile','small')}${btn('预留目标资金','reserve','small')}${btn('模拟申购','purchase','small')}</div>${st.reservations.map(r=>`<p>${r.kind==='sandbox-product'?'虚构持有':'目标预留'} ${money(r.cents)} ${btn('模拟释放','release','small',`data-id="${r.id}"`)}</p>`).join('')}</details>`;
 return header+goalSteps(data,profileCollectEditing);
}
function subscriptionActive(){return !!agentContext.subscriptionFlow&&!agentContext.subscriptionFlow.paused;}
async function startSubscription(message=SUBSCRIPTION_REQUEST,selected=period){
 if(aiBusy||commitBusy||workspaceBusy||importBusy)return;
 if(pending){guide('当前还有待确认草案，请先核对或取消它。订阅核对没有覆盖原草案。');return;}
 if(selected!==period){guide('账单月份已变化，请点击当前月份的订阅入口。');return;}
 const rec=currentRecommendation();
 if(!subscriptionActive()||!subscriptionReturn){const snapshot=captureWorkspaceDraft();snapshot.subscriptionReturn=null;subscriptionReturn={snapshot,history:structuredClone(dialogHistory),recommendation:rec};}
 if($('#dialog').open)$('#dialog').close();
 return chat(message,message,{taskChannel:'subscription-start',billPeriod:selected,mainRecommendation:subscriptionReturn.recommendation});
}
function pauseSubscriptionView(restore=true){
 const flow=agentContext.subscriptionFlow;if(!flow)return;
 if(restore&&subscriptionReturn){
  const saved=subscriptionReturn,history=messages,latestMode=lastModelMode;
  restoreWorkspaceDraft(saved.snapshot);messages=history;lastModelMode=latestMode;subscriptionReturn=saved;dialogHistory=structuredClone(saved.history);
 }
 agentContext={...agentContext,subscriptionFlow:{...flow,paused:true}};render();
}
function currentRecommendation(){
 const frozen=agentContext.subscriptionFlow?.mainRecommendation;if(subscriptionActive()&&frozen?.title&&frozen?.message)return {...frozen};
 let message=nextStepText(data?.recommendation,agentContext),title=message.replace(/^钱程推荐(?:下一步)?[：:]/,'');
 const titles={'goal-edit':'继续补充我的攒钱目标','goal-review':'帮我核对目标草案','profile-review':'我已确认个人信息，帮我预览三种方案','route-preview':'继续核对这条方案预览','routes':'帮我预览一种储蓄方案','profile-edit':'继续补充我的生活条件'};
 if(pending){title=pending.type==='goal'?'帮我核对目标草案':'帮我核对这份操作草案';message='钱程推荐：'+title;}
 else if(page==='bills'&&!billSourceChosen){title=billSourceTask(data.state).title;message='钱程推荐：'+title;}
 else if(page==='goal'&&titles[goalScreen]){title=titles[goalScreen];message='钱程推荐：'+title;}
 else if(page==='debts'&&!agentContext.intent&&!['agent-people-practice','due-status','agent-people-options','agent-advance-due','agent-repayment','agent-transfer'].includes(data.recommendation.action)){title='帮我记录一笔新的人情往来';message='钱程推荐：'+title;}
 return {title,message};
}
async function followRecommendation(){
 if(recommendationSending||aiBusy||goalSaving||routeSaving)return;
 recommendationSending=true;
 try{
 const rec=currentRecommendation(),sendText=rec.title||rec.message.replace(/^钱程推荐(?:下一步)?[：:]/,'');
 if(page==='goal'&&goalScreen==='profile-review'&&coachInterview?.ready&&!pending){messages.push({who:'user',text:sendText});return act('confirm-coach-profile');}
 if(pending||page==='goal'&&['goal-review','profile-review','profile-edit','route-preview'].includes(goalScreen)){
  messages.push({who:'user',text:sendText});focusMain(page==='debts'?'#people-workspace':'#goal-workspace');guide('草案还没执行，请在当前页面核对后确认，也可以返回修改。');return;
 }
 if(page==='goal'&&goalScreen==='routes'){messages.push({who:'user',text:sendText});guide('三种方案已保留，请在页面选择一条预览，核对后再确认采用。');return;}
 if(subscriptionActive())pauseSubscriptionView();
 return await chat(sendText,sendText,{taskChannel:'mainline',preserveComposerDraft:true});
 }finally{recommendationSending=false;}
}

async function sendChatInput(value){const text=String(value||'').trim();return text?chat(text):followRecommendation();}
async function commitInlineGoal(){
 if(goalSaving)return;
 if(!goalReview||pending?.type!=='goal'||pending.id!==goalReview.id)throw Error('目标草案已失效，请返回修改并重新核对');
 goalSaving=true;render();
 try{await api('commit',{id:pending.id,confirm:true});pending=null;goalReview=null;goalEditDraft=null;await refresh();await afterSaved('goal');}
 finally{goalSaving=false;render();}
}
function openRoutePreview(index,kind=null){
 routePreview=buildRoutePreview(data,index,kind);routeError='';goalScreen='route-preview';page='goal';render();document.querySelector('#goal-workspace')?.scrollIntoView({block:'start'});
}
async function commitPending(code){
 if(commitBusy)return;
 if(!pending)throw Error('无待确认草案');
 commitBusy=true;
 const kind=pending.type,id=pending.id,savedArgs={...pending.args},operationBack=pending.isolated&&kind!=='import'?captureWorkspaceDraft():null;if(operationBack){operationBack.pending=null;if(operationBack.peoplePanel?.html.includes('data-form="commit"')){operationBack.peoplePanel=operationBack.peopleHistory.pop()||null;if(operationBack.peoplePanel?.context)operationBack.agentContext=operationBack.peoplePanel.context;}}
 try{
  const result=await api('commit',{id,confirm:true,code});
  const back=importReturn||operationBack;importReturn=null;
  if(result.workspaceChanged){if(back)workspaceDrafts.set(workspaceKey(back.scope),back);resetWorkspaceView();}
  pending=null;whatIf=null;$('#dialog').close();peoplePanel=null;peopleHistory=[];
  if(['guided_demo','goal','coach'].includes(kind))page='goal';if(['sample_bill','import'].includes(kind))page='bills';if(result.workspaceChanged&&['transfer','repay'].includes(kind))page='debts';
  try{await refresh();}catch(e){guide((kind==='import'?'账单已导入':'操作已保存')+'，但页面刷新未完成：'+e.message+'。请刷新后查看，勿重复提交。');return;}
  if(result.workspaceChanged){restoreConversation(data);render();}
  toast(result.result.message||(kind==='import'?'账单已导入':'数据已保存'));await afterSaved(kind,savedArgs);
 }finally{commitBusy=false;}
}
async function confirmRoute(){
 if(routeSaving)return;
 if(!routePreview)throw Error('请先预览一种方案');
 if(routePreview.basis!==routeBasis(data.state,data.summary.availableCents))throw Error('资料已变化，请返回比较并重新预览');
 const preview=routePreview;routeSaving=true;routeError='';render();
 try{const saved=await prepare(preview.kind?'coach_adjust':'coach_route',{index:preview.index,basis:preview.basis,...(preview.kind?{kind:preview.kind}:{})});if(saved===false)return;routePreview=null;goalScreen='execution';routeComparison=false;agentContext={};page='goal';chatExpanded=false;focusMain('#execution-plan');const r=data.state.coachRoute;guide(`已采用${r.name}方案，每月先存${money(r.monthlyCents)}。执行计划已显示；之后可主动核对账单。`,false);}
 catch(e){routeError=e.message;throw e;}
 finally{routeSaving=false;render();}
}
function security(){return securityPage(data.totpEnabled);}
function login(){ $('#app').innerHTML=`<div class="login login-v2"><div class="login-v2-inner"><section class="login-brand"><h1>钱程</h1><p>把愿望变成计划</p><small>目标教练 · 账单体检 · 人情往来</small></section><section class="login-start"><h2>直接开始，无需注册</h2><p class="muted">可导入自己的账单，也可以选择虚构案例。<br>每次进入使用独立会话，账单相互隔离。</p>${btn('免注册开始','guest','primary login-guest')}<p class="subtle">免注册会话有效24小时。退出或清除浏览器会话数据后，可能无法找回；重要记录请先导出。想长期或跨设备使用，可选择注册。</p><details class="optional-login login-auth"><summary>已有账户登录 / 自愿注册 <i>›</i></summary><form id="authForm">${field('用户名','username','','text','required autocomplete="username" minlength="3"')}${field('密码（至少10位）','password','','password','required minlength="10" autocomplete="current-password"')}${field('体验邀请码（部署者设置时填写）','invite','','password')}<p id="authError" class="error"></p><div class="stack"><button name="action" value="login" class="primary">登录</button><button name="action" value="register">注册并进入</button></div></form></details></section></div></div>`;}
async function anonymousSession(){
 if(data){await refresh();return;}await api('guest',{});replyQuote=null;goalScreen='auto';goalReview=null;routePreview=null;lastRecommendationTitle='';messages=[];agentContext={};coachInterview=null;pending=null;whatIf=null;billSourceChosen=false;lastModelMode=null;activeTask=null;page='home';await refresh();restoreConversation(data);render();
}

async function prepare(type,args,fromChat=false){
 const epoch=dialogEpoch;
 if(['import','sample_bill','bill_review','bill_plan','calibrate'].includes(type)){page='bills';render();}if(['transfer','repay','link_loan','due','due_check','remind','offset','undo_offset','advance_time'].includes(type)){page='debts';render();}
 if(type==='goal'){if(pending&&pending.type!=='goal'){guide('当前还有待确认草案，请先核对或取消，目标草稿已保留。');return false;}await discardPending(true);}
 const r=await api('prepare',{type,args});if(epoch!==dialogEpoch){await api('cancel',{id:r.id});return false;}pending={...r,args:{...args}};
 if(type==='goal'){goalEditDraft={...args};goalReview={id:r.id,args:{...args},expires:r.expires};goalScreen='goal-review';page='goal';chatExpanded=false;focusMain('#goal-workspace');if($('#dialog').open)$('#dialog').close();render();return true;}
 const simple=new Set(['long_term_plan','coach_adjust','weekly_checkin','bill_review','bill_plan','calibrate','coach_route','guided_demo','sample_bill','coach','profile','classify','duplicate','checkin','contact','due','remind','due_check','archive_case']);
 if((simple.has(type)||type==='subscription'&&args.status==='keep')&&!fromChat){
  const done=await api('commit',{id:r.id,confirm:true});pending=null;whatIf=null;
  if(['guided_demo','goal','coach'].includes(type))page='goal';if(['sample_bill','import'].includes(type))page='bills';
  if($('#dialog').open)$('#dialog').close();await refresh();toast(done.result.message||'已保存');await afterSaved(type,args);return;
 }
 const changes=[['现金总额','cashCents'],['可用资金','availableCents'],['待收回','receivableCents'],['待还款','payableCents'],['目标预留','reservedCents']].filter(([,k])=>r.before[k]!==r.after[k]);
 const impact=changes.length?`<div class="impact-list">${changes.map(([name,k])=>`<div class="row"><span>${name}</span><b>${money(r.before[k])} → ${money(r.after[k])}</b></div>`).join('')}</div>`:'<p class="subtle">这一步不改变当前现金或既有消费记录。</p>';
 const isSub=type==='subscription',isImport=type==='import',isGoal=type==='goal',isTime=type==='advance_time';
 const operation=type==='due'?`新归还日期：${esc(args.dueDate||'未设置')} · ${args.dueType==='agreed'?'双方已经约定':args.dueType==='desired'?'本人期望':'未约定'}；只修改日期，不改变现金。`:type==='link_loan'?`收款人：${esc(args.name)} · ${money(Math.round(Number(args.amount)*100))} · ${esc(args.kind)}；关联已有流水，不新增付款。${args.dueDate?' '+(args.dueType==='agreed'?'双方约定':'本人期望')+'：'+esc(args.dueDate)+'（由你填写，可返回修改）':''}`:type==='transfer'?`对方：${esc(args.name||data.state.contacts.find(c=>c.id===args.contactId)?.name||'待核对')} · ${esc(args.kind)}；整笔金额 ${money(Math.round(Number(args.amount)*100))}${args.kind==='AA'?'；其中对方应还 '+money(Math.round(Number(args.receivableAmount)*100)):''}。${args.dueDate?'归还日期 '+esc(args.dueDate)+'（'+(args.dueType==='agreed'?'双方已经约定':'本人期望')+'）':'未设置归还日期'}${args.purpose?'；用途：'+esc(args.purpose):''}`:type==='classify'?`确认这笔已有流水的性质为${esc(types[args.kind]||args.kind)}，不新增流水。`:esc(r.label);
 const summary=isTime?`<p>是否将模拟时间从 <b>${esc(r.result.fromDate)}</b> 推进至 <b>${esc(r.result.toDate)}</b>（${r.result.days}天）？</p><p>确认后才检查到期往来；不改变真实日期，也不会对外发送提醒。</p>`:isSub?`<p>${esc(args.period)}账单中有 <b>${esc(args.name)}</b> 的会员或订阅扣费线索。你选择了不再需要。确认后只会把它标为“模拟取消”；真实平台不会停扣，也不会回退历史费用。</p>`:isImport?`${r.isolated?'<p class="notice">本次账单将单独分析，不与模拟数据合并。原模拟记录会保留。</p>':''}<p>准备导入 ${r.result.added} 笔，跳过 ${r.result.skipped} 笔；${r.result.possible} 笔疑似重复待核对。</p>`:isGoal?`<p>你的目标：<b>${esc(args.name)}</b>，${money(Math.round(Number(args.target)*100))}，${esc(args.months)} 个月。达标比例要等生活条件补齐后才计算。</p>`:`<p><b>${operation}</b></p>`;
 if(page==='debts')chatExpanded=false;
 openTask(`<h2>${isTime?'确认推进模拟时间':isSub?'要模拟取消这项订阅吗？':isImport?'确认导入账单':isGoal?'确认你的目标':'核对后执行'}</h2>${r.isolated&&!isImport?'<p class="subtle">本次模拟仅更新模拟记录，原真实账单会保留。</p>':''}${summary}${!isSub&&!isImport&&!isGoal?impact:''}${type==='link_loan'?btn('修改姓名、金额或日期','edit-pending-link','small',`data-id="${esc(args.id)}"`):''}<form data-form="commit">${r.risk==='red'?field('验证器6位动态码','code','','text','inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required'):''}<p id="formError" class="error"></p><div class="stack sticky"><button class="primary" type="submit">${isTime?'确认推进至 '+esc(r.result.toDate):isSub?'确认模拟取消':isImport?'确认导入并分析':isGoal?'确认保存目标':'确认执行（沙箱）'}</button>${btn(isImport?'取消':isTime?'先不推进':'先不做','close','','type="button"')}</div></form><small>仅此一次确认。金额与执行状态以服务端结果为准。</small>`);
}

function guide(text,expand=true){if(!aiBusy)lastModelMode='rules';const last=messages.at(-1);if(last?.who==='ai'&&!last.text&&!last.pending){last.text=text;last.mode='rules';}else if(last?.who!=='ai'||last.text!==text)messages.push({who:'ai',text});if(expand)chatExpanded=true;render();}
function startCoachInterview(announce=true){
 if(!data.state.goal)return act('start-goal');
 page='goal';goalScreen='steps';
 if(agentContext.intent!=='coach_profile')agentContext={intent:'coach_profile',profileDraft:coachInterview?.draft||{},profileProof:coachInterview?.proof||{},...(coachInterview?.simulated?{profileSimulated:true}:{})};
 const c={...data.state.coach,...agentContext.profileDraft};agentContext.profileDraft=c;
 const missing=missingProfile(data.state,c);
 agentContext.profileReady=!missing.length;
 agentContext.profileOfferPersona=!!missing.length&&canPreviewPersona(data.state);
 if(!missing.length){coachInterview={...coachInterview,draft:c,proof:agentContext.profileProof||{},missing:[],analysis:coachInterview?.analysis||[],ready:true,...(agentContext.profileSimulated?{simulated:true}:{})};goalScreen='profile-review';}
 if(announce)guide(missing.length?profileCollection(missing,{offerExample:agentContext.profileOfferPersona}):'生活条件和已有存款已整理，请在页面核对。确认后再计算三种储蓄方案。');else render();

}
async function openCoachOutcome(phase='goal'){
 if(!data.state.coach){startCoachInterview();return;}
 outcomePhase=phase;routeComparison=true;page='goal';close();goalScreen='routes';render();
 guide('三种储蓄方案已显示，可先预览每月安排和模拟结果，再确认采用；模拟比例不是个人真实成功概率。');
}


function openBillSource(p=savedBillPeriod(data.state,data.state.lastBillPeriod||period),force=false){
 period=p;page='bills';billSourceChosen=!!data.state.billReports?.[period]||!data.state.demo&&data.state.transactions.some(t=>t.importKey&&t.date.startsWith(period));render();
 if($('#dialog').open)close();if(force)billSourceChosen=false;if(!billSourceChosen)agentContext={intent:'bill_source'};render();
} 
async function openBillAnalysis(p=period){
 period=p;billSourceChosen=true;page='bills';if(agentContext.intent==='bill_source')agentContext={};render();
 if(!data.state.transactions.some(t=>t.date.startsWith(period))){billSourceChosen=false;agentContext={intent:'bill_source'};render();return;}
 await api('bill-analysis',{period});focusMain('.bill-report');await refresh();
 if($('#dialog').open)close();render();
}
async function afterSaved(type,args={}){
 if(type==='subscription'){
  agentContext=data.conversationContext||agentContext;guide(subscriptionCompletionText(args));return;
 }
 await afterSavedCore(type,args);
 const flow=data.conversationContext?.subscriptionFlow;if(flow&&!agentContext.subscriptionFlow){agentContext={...agentContext,subscriptionFlow:{...flow,paused:true}};render();}
}
function subscriptionCompletionText(args){
 return (args.status==='cancelled'?`已记录${args.name}模拟取消。真实扣费仍需到原平台关闭，历史支出不变。`:`已记录${args.name}保留状态，历史支出不变。`)+`这项已核对。你可以继续看刚才的预算建议，也可以再核对一项订阅。`;
}
async function afterSavedCore(type,args={}){
 dialogHistory=[];routeComparison=false;if(['sample_bill','import','bill_review','bill_plan','transfer','link_loan','repay','due','remind','advance_time','classify','offset','archive_case','contact','weekly_checkin'].includes(type))agentContext={completed:type};
 if(type==='guided_demo'){render();return;}
 if(type==='sample_bill'||type==='import'){
  if(type==='sample_bill')period=today().slice(0,7);
  else {const rows=args.rows||[];period=data.state.lastBillPeriod||(rows.length?rows.map(t=>t.date.slice(0,7)).sort().at(-1):period);agentContext={resumeTask:{action:'agent-bill-analysis',period}};}
  try{await openBillAnalysis();const choices=data.state.billReports?.[period]?.opportunities||[];
   if(type==='import'){agentContext={resumeTask:{action:'agent-bill-actions',period}};guide('账单已导入，分析完成。建议先看看订阅，再选择适合你的预算调整。'+(!data.state.goal||!data.state.coach?'可以先查看消费分类和待核对记录；要联动储蓄计划时，再补充真实目标与条件。':choices.length?'可以先预览一项预算调整，再决定是否加入计划。':'暂未发现明确可调整的项目，可以先核对分类。'));}
   else guide('虚构账单已载入，分析结果已准备好。建议先看看订阅，再选择适合你的预算调整。'+(choices.length>1?'你想先看哪一项？':choices.length?'可以先预览这项调整，再决定是否加入计划。':'这份账单暂时没有发现明确可调整的项目，可以先核对分类。'));
  }catch(e){agentContext={resumeTask:{action:'agent-bill-analysis',period}};guide('账单已保存，但分析未完成：'+e.message+'。可以点击“分析本月账单”或发送当前推荐重试。');}return;
 }
 if(type==='goal'){
  whatIf=null;profileCollectEditing=false;goalScreen='steps';goalReview=null;goalEditDraft=null;routePreview=null;
  if(hasCompleteProfile(data.state)){goalReturn=null;agentContext={};coachInterview=null;goalScreen='routes';page='goal';guide('目标已确认，已复用完整个人信息重新计算三种方案。先预览，再确认采用。');return;}
  if(goalReturn){const saved=goalReturn;goalReturn=null;agentContext=saved.context;coachInterview=saved.interview;coachMode=saved.mode;page='goal';guide('目标已更新，上一步生活条件草稿仍保留。你可以继续修改，或主动核对。');return;}
  agentContext={};coachInterview=null;page='goal';
  startCoachInterview();return;
 }
 if(type==='coach'){profileCollectEditing=false;agentContext={};coachInterview=null;goalEditDraft=null;goalScreen='routes';page='goal';focusMain('.goal-steps');guide('条件已确认，三种方案已显示。先预览，再确认采用，即可进入执行计划。');return;}
 if(type==='bill_review'){page='bills';guide('已保留当前预算，没有新增节省或现金。准备好时再核对转账用途。');return;}
 if(type==='bill_plan'){page='goal';goalScreen=data.state.coachRoute?'execution':'routes';chatExpanded=false;focusMain(data.state.coachRoute?'#weekly-actions':'.route-grid');guide('这项调整已加入计划，可在本周行动中复盘。',false);return;}
 if(type==='coach_route'){goalScreen='execution';return;}
 if(type==='coach_adjust'){agentContext={};coachInterview=null;goalScreen='execution';page='goal';return;}
 if(['weekly_checkin','long_term_plan'].includes(type))page='goal';
 if(['repay','offset'].includes(type)){
  const c=type==='repay'?data.state.cases.find(c=>c.id===args.id):data.state.cases.find(c=>c.recipient.toLocaleLowerCase()===String(args.name||'').toLocaleLowerCase()&&remain(c)>0);
  if(c&&remain(c)>0){agentContext={intent:'people_date',caseId:c.id,stage:'date',draft:{dueDate:'',dueType:''}};page='debts';openPeoplePanel(dateDraft(data,c.id));guide('这次已记录，剩余'+money(remain(c))+'希望对方什么时候归还？可以说“三天后”或指定日期，再核对是双方约定还是本人期望。');return;}
 }
 if(['due','remind','archive_case'].includes(type)||type==='repay'&&data.state.cases.some(c=>c.id===args.id&&remain(c)===0)){
  peoplePanel=null;peopleHistory=[];page='debts';agentContext={completed:type};focusMain('.people-toolbar');guide(type==='remind'?'提醒已保存到模拟信箱，没有真实发送。':'这一轮体验已完成，未结清款项仍保留。想再记一笔，可以告诉我谁、多少钱，以及是转账、垫付还是AA。');return;
 }
 if(type==='due_check'){render();return;}
 if(type==='advance_time'){const due=dueForCheck();if(due){chatExpanded=false;openDueStatus(due.id,'模拟日期已推进至'+data.state.simulatedDate+'。');return;}}
 if(page==='debts'){peoplePanel=null;peopleHistory=[];}
 const done=type==='advance_time'?'模拟日期已推进，当前是'+data.state.simulatedDate+'。未发送真实提醒。':type==='remind'?'提醒已保存到模拟信箱，没有真实发送。':type==='weekly_checkin'?'本周打卡已保存，现金没有变化。':'这一步已保存。';
 guide(done);
}
async function sendExample(message){if(!aiBusy)await chat(message);}
async function runRecommendedTask(task){
 if(!task)return;activeTask=task;
 if(task.action==='import-bill')return act('import');
 if(task.action==='agent-bill-analysis'||task.action==='route-to-bills'){const p=task.period||period;if(data.state.transactions.some(t=>t.date.startsWith(p))){await openBillAnalysis(p);guide('本期账单分析已完成。建议先看看订阅，再选择适合你的预算调整。');return;}openBillSource(p);guide('先选一份账单：导入自己的，或用虚构账单体验。选好后，再核对消费和可以调整的支出。');return;}
 if(task.action==='load-sample-bill')return act('sample-bill');
 if(task.action==='use-persona')return act('persona',{dataset:{persona:task.persona}});
 if(task.action==='agent-transfer'){
  page='debts';peoplePanel=null;peopleHistory=[];const t=tx(task.transactionId);if(!t)throw Error('这笔流水已变化，请重新获取建议');
  agentContext={intent:'transfer_purpose',transactionId:t.id};
  openPeoplePanel(`<h2>先核对这笔转账的用途</h2><p>${esc(t.merchant)} · ${money(t.cents)} · ${esc(t.date)}</p><p>可以在聊天中回答，也可以选择下面最接近的用途。未确认前不新增往来、不改变现金。</p><div class="stack">${btn('替对方垫付／借给对方','purpose-advance','primary',`data-id="${t.id}"`)}${btn('AA，核对对方份额','purpose-aa','',`data-id="${t.id}"`)}${btn('送礼或自己的支出','purpose-expense','',`data-id="${t.id}"`)}${btn('还不确定','purpose-defer','',`data-id="${t.id}"`)}</div>`,false);
  guide(transferPurposeText(t)+'收款人：'+t.merchant+'。');return;
 }
 if(task.action==='agent-bill-actions'){period=task.period||period;return act('bill-actions');}
 if(task.action==='agent-people-practice'){agentContext={intent:'payment_interview',stage:'kind',draft:{kind:'',name:'',amount:'',dueDate:'',dueType:''}};page='debts';openPeoplePanel(paymentDraft(data,agentContext.draft));guide('这次想体验普通转账、垫付，还是AA？选一种后，我再问对象和金额。');return;}
 if(task.action==='people-payment-draft'){page='debts';openPeoplePanel(paymentDraft(data,task.draft));return;}
 if(task.action==='people-link-draft'){page='debts';openPeoplePanel(linkDraft(data,task.transactionId,task.draft));return;}
 if(task.action==='people-date-draft'){page='debts';openPeoplePanel(dateDraft(data,task.caseId,task.draft));return;}
 if(task.action==='agent-advance-due'){page='debts';render();return prepare('advance_time',{days:task.days});}
 if(task.action==='agent-people-options'){page='debts';return openUnpaidOptions(task.caseId);}
 if(task.action==='agent-repayment')return act('repay',{dataset:{id:task.caseId,transactionId:task.transactionId}});
 if(task.action==='due-unpaid'||task.action==='due-verify')return act(task.action,{dataset:{id:task.caseId}});
 if(task.action==='due-status')return openDueStatus(task.caseId);
 if(task.action==='repay')return act('repay',{dataset:{id:task.caseId,...(task.partial?{partial:'1'}:{}),...(task.amount?{amount:task.amount}:{})}});
 if(task.action==='agent-subscriptions')return startSubscription(SUBSCRIPTION_REQUEST,task.period||period);
 if(task.action==='agent-calibrate'){
  const rows=data.state.transactions.filter(t=>t.date.startsWith(period)&&!t.excluded&&!t.duplicateOf&&t.kind==='expense'&&['social','shop'].includes(t.cat)),total=rows.reduce((v,t)=>v+t.cents,0);
  openTask(`<div class="eyebrow">账单分析 → 校准目标</div><h2>把账单线索变成你确认的预算</h2><p>本期已确认社交、购物共${rows.length}笔，合计${money(total)}。这些不一定可以全省，也不一定覆盖完整月份。</p><form data-form="calibrate"><label>你确认的每月非必要消费（可保留原值）<input name="leisure" type="number" min="0" step=".01" value="${data.state.coach?.leisure??''}" placeholder="结合账单和未记录消费核对"></label><label>完整月度总支出（可选，含房租、家庭与可选消费）<input name="expense" type="number" min="0" step=".01" value="${data.state.profile.expenseCents==null?'':yuan(data.state.profile.expenseCents)}" placeholder="确认账单完整时才填，留空继续用成本假设"></label><p>填写总支出后，主模拟采用这个总数，不会再叠加一次房租和可选消费。</p><p id="formError" class="error"></p><button type="submit" class="primary">确认预算，更新计划建议</button></form>`);return;
 }
 if(task.action==='agent-progress'){page='goal';goalScreen=data.state.coachRoute?'execution':'auto';focusMain(data.state.coachRoute?'#execution-plan':'page-top');guide('当前计划已显示。需要时可以继续记账或开始本周复盘。');return;}
 return act(task.action,{dataset:{id:task.transactionId||task.caseId||''}});
}

function dueForCheck(){return data.state.cases.find(c=>remain(c)&&c.dueDate&&c.dueDate<=(data.state.simulatedDate||today())&&c.reminderDays>0&&(!c.lastCheckDate||Math.floor((Date.parse(data.state.simulatedDate||today())-Date.parse(c.lastCheckDate))/86400000)>=c.reminderDays)&&(!c.lastReminderDate||Math.floor((Date.parse(data.state.simulatedDate||today())-Date.parse(c.lastReminderDate))/86400000)>=c.reminderDays));}
const duePopupsSeen=new Set();
function duePopupKey(c){return [data.user.id,c.id,c.dueDate,data.state.simulatedDate||today(),c.lastCheckDate||'',c.lastReminderDate||''].join(':');}
function openDueStatus(id,prefix=''){duePopupsSeen.add(duePopupKey(debt(id)));page='debts';const c=debt(id);agentContext={intent:'due_status',caseId:id};openTask(`<div class="eyebrow">先核对到账，不先催款</div><h2>${esc(c.recipient)}这笔钱，是否已经归还？</h2><p>目前记录未结清 ${money(remain(c))}。${c.dueType==='agreed'?'约定日期':'你期望的日期'}：${esc(c.dueDate||'尚未设置')}。日期到了不代表已经到账，也不代表对方故意拖欠。</p><div class="stack">${btn(c.kind==='借入'?'已还出，核对记录':'已收到，核对金额与流水','repay','primary',`data-id="${id}"`)}${btn(c.kind==='借入'?'尚未还出，看看安排':'尚未收到，看看处理选项','due-unpaid','',`data-id="${id}"`)}${btn('不确定，先亲自核实','due-verify','',`data-id="${id}"`)}</div>`);guide(prefix+c.recipient+'这笔'+c.kind+'已到记录日期，当前未结清'+money(remain(c))+'。请先核对是否已归还；可以直接说“已全部还款”“已部分还款”或“未还款”。尚未确认到账的钱不会计入可用资金。',false);}
function openUnpaidOptions(id){const c=debt(id);agentContext={intent:'people_options',caseId:id};openTask(`<h2>尚未归还，下一步怎样处理？</h2><p>${esc(c.recipient)} · 未结清 ${money(remain(c))}。可用资金没有增加，钱程也不会自动联系任何人。</p><div class="stack">${btn('准备友善提醒话术','remind','primary',`data-id="${id}"`)}${btn('沟通后调整日期','due','',`data-id="${id}"`)}${btn('先亲自核实收款记录','due-verify','',`data-id="${id}"`)}</div><p class="subtle">本次核对会记下来；同一虚构日期不反复弹出。提醒只进入模拟信箱。</p>`);guide('这笔款项还没归还。你想“修改日期”“帮我提醒对方”，还是“先亲自核实”？');}
function tx(id){return data.state.transactions.find(t=>t.id===id);}function debt(id){const c=data.state.cases.find(c=>c.id===id);if(!c)return;const t=data.state.transactions.find(t=>t.id===c.transactionId);return {...c,purpose:c.purpose||t?.desc||c.kind,date:c.date||t?.date||''};}
async function act(a,b){const id=b?.dataset.id;
 if(workspaceBusy||commitBusy||importBusy&&!['close','dialog-back'].includes(a))return;
 if(a==='bill-workspace')return switchBillWorkspace(b.dataset.scope);
 if(a==='subscription-start')return startSubscription(SUBSCRIPTION_REQUEST,b.dataset.period||period);
 if(a==='subscription-reply'){
  if(b.dataset.period!==period){guide('账单月份已变化，请从当前月份的订阅入口核对。');return;}
  if(pending){guide('草案仍在等待确认，请先核对或取消。');return;}
  const text=({keep:'仍在用',stop:'不再需要','cancel-preview':'帮我取消',later:'稍后核对',more:'再核对一项',back:'返回账单建议'})[b.dataset.choice]||b.dataset.name;
  if(b.dataset.choice==='back'){pauseSubscriptionView();page='bills';billSourceChosen=true;render();return chat(text,text,{taskChannel:'subscription-return',preserveComposerDraft:true});}
  if(b.dataset.choice==='more')return startSubscription(text,period);
  return chat(text);
 }
 const mainActions=['bill-opportunity','bill-actions','bill-reviewed','review-sample','nav','to-bills','to-debts','goal','start-goal','coach-profile','profile','import','transfer','repay','link','due-status'];
 if(subscriptionActive()&&mainActions.includes(a)){
  if(pending){guide('当前草案尚未执行，请先核对或取消，再返回主线。');return;}
  pauseSubscriptionView();
 }

 if(a==='people-back'){await discardPending();peoplePanel=peopleHistory.pop()||null;agentContext=structuredClone(peoplePanel?.context||{});render();return;}
 if(a==='edit-profile-collection'){profileCollectEditing=true;goalScreen='steps';page='goal';agentContext={intent:'coach_profile',profileDraft:{...data.state.coach},profileProof:{}};coachInterview=null;guide('已记录的信息会保留。直接告诉我要改什么，或打开完整问卷；也可切换虚构情形。');return;}
 if(a==='finish-profile-collection'){profileCollectEditing=false;goalScreen='steps';render();return;}
 if(a==='clear-quote'){replyQuote=null;render();return;}
 if(a==='quote-message'){const message=messages[Number(id)];if(!message?.text||message.pending)throw Error('请等待这条消息完成');replyQuote={...normalizeQuote({role:message.who==='user'?'user':'assistant',author:message.who==='user'?data.user.name:'钱程',text:message.text}),ownerId:data.user.id};chatExpanded=true;render();$('#chatForm textarea')?.focus({preventScroll:true});return;}
 if((goalSaving||routeSaving)&&a!=='toggle-chat')return;
 if(a==='follow-recommendation')return followRecommendation();
 if(a==='confirm-inline-goal')return commitInlineGoal();
 if(a==='edit-goal-draft'){const draft=goalReview?.args||goalEditDraft;await discardPending();goalEditDraft={...draft};goalReview=null;goalScreen='goal-edit';render();return;}
 if(a==='cancel-goal-edit'){await discardPending();goalReview=null;goalEditDraft=null;goalScreen='steps';if(agentContext.intent==='goal_details')agentContext={};render();return;}
 if(a==='return-goal-steps'){goalScreen='steps';render();return;}
 if(a==='preview-route'||a==='choose-route')return openRoutePreview(Number(b.dataset.index),whatIf?.kind||null);
 if(a==='confirm-route')return confirmRoute();
 if(a==='return-routes'){routePreview=null;routeError='';await refresh();goalScreen='routes';render();return;}
 if(a==='plan-confirmed-next'){close();guide('计划已经保存。准备好时，可以发送“下一步”继续核对转账用途。');return;}
 if(a==='review-profile'){if(aiBusy)throw Error('请等待本次条件整理完成');if(!coachInterview?.ready)throw Error('请先在聊天中补齐生活条件');goalScreen='profile-review';page='goal';render();return;}
 if(a==='edit-pending-link'){const draft={...pending?.args};await discardPending();peoplePanel=null;peopleHistory=peopleHistory.filter(p=>!p.html.includes('data-form="commit"'));agentContext={intent:'people_link',transactionId:id,draft,stage:draft.dueDate?'date_type':'date'};openPeoplePanel(linkDraft(data,id,draft));return;}
 if(a==='purpose-advance'||a==='purpose-aa'||a==='purpose-expense'||a==='purpose-defer'){
  const t=tx(id);if(!t||t.caseId||t.kind!=='unknown')throw Error('这笔流水已变化，请重新核对');
  agentContext={intent:'transfer_purpose',transactionId:id};return chat(a==='purpose-advance'?'这笔是替对方垫付':a==='purpose-aa'?'这笔是AA':a==='purpose-expense'?'这笔是送礼或自己的支出':'还不确定');
 }
 if(a==='view-execution'){close();goalScreen='execution';routeComparison=false;page='goal';render();document.querySelector('#execution-plan')?.scrollIntoView({block:'start'});return;}
 if(a==='bill-existing')return openBillAnalysis();
 if(a==='bill-sources')return openBillSource(period,true);
 if(a==='bill-result'){billSourceChosen=true;page='bills';render();return;}
 if(a==='long-term-plan'){openTask(longTermPlanDialog(data));return;}
 if(a==='toggle-chat'){chatExpanded=!chatExpanded;render();return;}
 if(a==='weekly-checkin'){agentContext={intent:'form_input',form:'weekly-checkin'};weeklyDraft=null;openTask(weeklyCheckinDialog(data));return;}
 if(a==='weekly-file'){if(data.state.demo){openTask('<h2>用你自己的计划复盘真实账单</h2><p>当前目标和资金是虚构情形。新开免注册会话导入真实账单，再设置自己的目标，避免把虚构预算当作真实计划；重要演示记录可先导出。</p>'+btn('新开免注册会话并导入','fresh-import','primary')+btn('继续虚构本周打卡','weekly-checkin'));return;}document.querySelector('#weeklyFileInput').click();return;}
 if(a==='weekly-sample'||a==='weekly-ledger'){const draft=captureWeeklyDraft(),source=a==='weekly-sample'?'sample':'ledger',sampleVariant=b?.dataset.variant||'within',rows=source==='sample'?sampleWeekRows(draft.weekStart,undefined,{budgetCents:executionPlan(data).weeklyCents,variant:sampleVariant}):data.state.transactions;weeklyDraft={...draft,source,sampleVariant,rows,amount:undefined,report:summarizeWeek(rows,draft.weekStart,{ledger:source==='ledger',rules:source==='sample'?[]:data.state.rules||[]})};openTask(weeklyCheckinDialog(data,weeklyDraft));return;}
 if(a==='choose-adjusted-route')return openRoutePreview(Number(b.dataset.index),b.dataset.kind);
 if(a==='reminder-style'){openTask(reminderDialog(debt(id),b.dataset.style,$('[name=owner]')?.value||data.user.name));return;}
 if(a==='bill-opportunity'){const choice=b.dataset.opportunity;if(b.dataset.period&&b.dataset.period!==period)throw Error('账单月份已变化，请重新选择建议');openTask(billOpportunityDialog(data,period,choice));return;}
 if(a==='bill-plan-preview'){const form=document.querySelector('[data-form="bill-plan"]');if(!form.elements.reduction.reportValidity())return;const v=Object.fromEntries(new FormData(form));const n=Number(v.reduction);if(!Number.isFinite(n)||n<=0)throw Error('请填写有效金额');openTask(billOpportunityDialog(data,v.period,v.opportunity,Math.round(n*100),v.instruction===form.dataset.defaultInstruction?null:v.instruction));return;}
 if(a==='bill-reviewed'){await prepare('bill_review',{period});return;}
 if(a==='bill-actions'){page='bills';billSourceChosen=true;render();document.querySelector('#bill-actions')?.scrollIntoView({block:'start',behavior:'smooth'});guide('先从账单里选择一项可执行改进，或点击“暂不改变预算”。确认后再继续核对转账。');return;}
 if(a==='skip-subscriptions')return chat('稍后核对');

 if(a==='dialog-back')return dialogBack();
 if(a==='back-goal'){goalReturn={context:structuredClone(agentContext),interview:coachInterview?structuredClone(coachInterview):null,mode:coachMode,text:$('#dialog').querySelector('[data-form="coach-message"] textarea')?.value};await discardPending();return act('goal',b);}
 if(a==='due-status')return openDueStatus(id);
 if(a==='due-unpaid'){agentContext={};await prepare('due_check',{id,status:'unpaid'});return openUnpaidOptions(id);}
 if(a==='due-verify'){await prepare('due_check',{id,status:'verify'});openTask('<h2>先亲自核实到账情况</h2><p>请查看原支付平台的收款记录，必要时与对方确认。尚未核实前不新增还款、不增加可用资金。</p>'+btn('返回处理选项','due-options','',`data-id="${id}"`));return;}
 if(a==='due-options')return openUnpaidOptions(id);
 if(a==='send-example')return sendExample(b.dataset.message);
 if(a==='agent-next')return chat('下一步');
 if(a==='goal-months'){document.querySelector('[data-form="goal-followup"] [name="months"]').value=b.dataset.months;return;}
 if(a==='transfer-as-expense')return prepare('classify',{id,kind:'expense',cat:'person'});
 if(a==='agent-defer'){close();toast('先保留这笔记录，之后可从钱程建议继续核对');return;}
 if(a==='agent-show-task')return runRecommendedTask(data.recommendation);


 if(a==='nav'&&pending?.type==='goal'&&goalReview){page=b.dataset.page;goalScreen=page==='goal'?'goal-review':'steps';if(page==='goal')agentContext={...agentContext,intent:'goal_details',target:goalReview.args.target,months:goalReview.args.months,purpose:goalReview.args.name||''};render();return;}
 if(a==='nav'&&b.dataset.page==='goal'&&goalEditDraft){close();agentContext={...agentContext,intent:'goal_details',target:goalEditDraft.target||'',months:goalEditDraft.months||'',purpose:goalEditDraft.name||''};goalScreen='steps';page='goal';render();return;}
 if(a==='nav'&&b.dataset.page==='goal'&&coachInterview){close();startCoachInterview(false);return;}
 if(a==='nav'){if(['goal_details','goal_clarify'].includes(agentContext.intent)&&b.dataset.page!=='goal')agentContext={};close();goalScreen='auto';goalReview=null;routePreview=null;routeComparison=false;whatIf=null;if(b.dataset.page==='bills')return openBillSource();if(agentContext.intent==='bill_source')agentContext={};page=b.dataset.page;render();return;}if(a==='to-home'){close();goalScreen='auto';goalReview=null;routePreview=null;page='home';render();return;}if(a==='to-bills')return openBillSource();if(a.startsWith('to-')){close();goalScreen='auto';goalReview=null;routePreview=null;page=a.slice(3);render();return;}
 if(a==='close'){close();render();return;}if(a==='submit-form')return;
 if(a==='guest'){await anonymousSession();return;}
 if(a==='fresh-import')return act('import');
 if(a==='logout'){replyQuote=null;close();goalScreen='auto';goalReview=null;routePreview=null;await api('logout',{});billSourceChosen=false;data=null;messages=[];agentContext={};page='home';login();return;}
 if(a==='start-goal'){if(pending){guide('当前还有待确认草案，请先核对或取消。');return;}const d=goalEditDraft||{};agentContext={...agentContext,intent:'goal_details',target:d.target||'',months:d.months||'',purpose:d.name||''};page='goal';goalScreen='steps';goalEditDraft=d;if(d.target&&d.months){guide(`目标已整理：${d.months}个月攒${d.target}元。请在目标确认区核对并确认保存。`);return prepare('goal',{name:d.name||'',target:d.target,months:Number(d.months)},true);}guide(goalPrompt(agentContext));return act('focus-agent');}
 if(a==='coach-interview'){startCoachInterview();return;}
 if(a==='coach-outcome')return openCoachOutcome();
 if(a==='persona'){
  if(!data.state.goal){guide('先告诉我想攒多少、用多久，再选择虚构情形。');return;}
  if(pending){guide('当前还有待确认草案，请先核对或取消；原目标和条件草稿保留。');return;}
  return chat((b.dataset.persona||id)==='worker'?'试试深圳职场新人':'试试武汉在校生');
 }
 if(a==='coach-manual'){if(!goalEditDraft?.profile)goalEditDraft={profile:data.state.coach||{}};goalScreen='profile-edit';page='goal';render();return;}
 if(a==='coach-edit-draft'){goalEditDraft={profile:profileArgs(coachInterview?.draft||{})};goalScreen='profile-edit';page='goal';render();return;}
 if(a==='confirm-coach-profile'){if(goalSaving)return;if(aiBusy)throw Error('请等待本次条件整理完成');if(!coachInterview?.ready)throw Error('请先补齐条件');if(pending){guide('当前还有待确认草案，请先处理；生活条件草稿保留。');return;}goalSaving=true;try{const draft=profileArgs(coachInterview.draft);if(coachInterview.simulated&&!data.state.demo){if(!canPreviewPersona(data.state))throw Error('当前已有个人资料，模拟条件未保存，请重新核对');await prepare('guided_demo',{});}return await prepare('coach',draft);}finally{goalSaving=false;render();}}



 if(a==='route-to-bills')return openBillSource();
 if(a==='demo'||a==='guided-demo')return prepare('guided_demo',{});
 if(a==='focus-agent'){chatExpanded=true;render();document.querySelector('#chatForm textarea')?.focus({preventScroll:true});return;}
 if(a==='see-scenes'){document.querySelector('#scenes')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(a==='guided-start'){if(blankForDemo(data.state))await prepare('guided_demo',{});return data.state.goal?startCoachInterview():chat('我想两年攒2万去旅行');}
 if(a==='example-goal')return chat('我想两年攒2万去旅行');
 if(a==='example-bills')return sendExample('分析账单，找找调整空间');
 if(a==='example-debts'){if(blankForDemo(data.state))await prepare('guided_demo',{});return chat('给小王垫付100元');}
 if(a==='sample-bill'||a==='after-bill-demo'){if(data.state.transactions.some(t=>t.source==='demo'))return openBillAnalysis();return prepare('sample_bill',{});}
 if(a==='bill-calibrate')return runRecommendedTask({action:'agent-calibrate'});
 if(a==='legacy-bill-calibrate'){if(!data.state.coach){page='goal';render();toast('先完成目标与个人处境，再回来核对账单消费');return;}const optional=data.state.transactions.filter(t=>t.date.startsWith(period)&&!t.duplicateOf&&!t.excluded&&t.kind==='expense'&&['social','shop'].includes(t.cat)).reduce((v,t)=>v+t.cents,0);const proposal=structuredClone(data.state);proposal.coach.leisure=(optional/100).toFixed(2);openTask('<div class="notice">账单里已识别的社交和购物是 '+money(optional)+'，可能漏掉尚未导入的日期和现金消费。请核对后自行确认是否可作为每月非必要消费假设。</div>'+coachForm(proposal));return;}
 if(a==='jump-detail'){document.querySelector('.tablewrap')?.scrollIntoView({behavior:'smooth'});return;}if(a==='review-sample')return runRecommendedTask({action:'agent-transfer',transactionId:'sample-loan'});
 if(a==='advance-time')return prepare('advance_time',{days:Number(b.dataset.days)});
 if(a==='lever'){page='goal';chatExpanded=false;focusMain('page-top');goalScreen='routes';whatIf={kind:b.dataset.kind,label:b.dataset.label};render();if($('#dialog').open)openTask(coachResult(data,whatIf,true,true,true)+btn('← 返回修改目标','back-goal'),false);return;}if(a==='reset-lever'){whatIf=null;focusMain('page-top');render();if($('#dialog').open)return openCoachOutcome(outcomePhase);return;}

 if(a==='coach-profile'){if(!data.state.goal)throw Error('请先设定目标愿景');return act('coach-manual');}
 if(a==='profile'){formDialog('资金与预算','profile',field('期初现金（导入期间开始前；未知可留空）','opening',data.state.openingKnown?yuan(data.state.openingCents):'','number','min="0" step=".01"')+field('预计月收入（未知留空）','income',yuan(data.state.profile.incomeCents),'number','min="0" step=".01"')+field('预计月支出（含必要与可选）','expense',yuan(data.state.profile.expenseCents),'number','min="0" step=".01"')+field('应急资金，不用于新操作','emergency',yuan(data.state.profile.emergencyCents),'number','min="0" step=".01" required'),'期初余额不是当前余额。系统会在期初上叠加全部流水；已有收入不要重复加进期初。');return;}
 if(a==='goal'){const g=data.state.goal;if(!g&&(!goalEditDraft?.target||!goalEditDraft?.months))return act('start-goal');const d=!g&&goalEditDraft?goalEditDraft:{name:g?.name||'',target:g?yuan(g.targetCents):'',months:g?.months||''};agentContext={...agentContext,intent:'goal_details',target:d.target,months:d.months,purpose:d.name||''};goalEditDraft={...d};goalScreen='goal-edit';page='goal';render();return;}

 if(a==='reserve'||a==='purchase'){formDialog(a==='reserve'?'为目标预留资金':'申购虚构沙箱产品',a,field('金额（元）','amount','','number','required min=".01" step=".01"'),a==='purchase'?'SIM-CASH-001：零收益测试容器，不是实际金融产品；须验证器动态码。':'这笔钱会从可用资金中预留，现金总额不变。');return;}
 if(a==='release')return prepare('release',{id});
 if(a==='checkin'&&data.state.coachRoute){weeklyDraft=null;openTask(weeklyCheckinDialog(data));return;}
 if(a==='checkin'){formDialog('每周复盘','checkin',field('本周实际支出','amount','','number','required min="0" step=".01"')+field('下周想调整什么','note'),'仅作复盘，不新增交易。');return;}
 if(a==='import'){
  if(aiBusy)return;
  if(!importReturn)importReturn=captureWorkspaceDraft();pending=null;
  page='bills';render();showDialog(`<h2>导入账单</h2><p class="subtle">支持微信、支付宝 CSV / XLSX / 未加密ZIP。原文件在浏览器解析；预览确认后保存，无需注册。</p><label>来源平台<select id="importSource"><option value="wechat">微信</option><option value="alipay">支付宝</option><option value="bank">银行</option><option value="other">其他</option></select></label><input id="fileInput" type="file" accept=".csv,.txt,.xlsx,.zip"><p id="formError" class="error"></p><p class="footnote">保留完整年份和原始交易号；同一来源重复导入自动跳过。跨来源疑似重复须核对。失败 / 关闭交易不导入。一次最多5MB。</p>`,false);dialogHistory=[];return;
 }
 if(a==='classify'){const t=tx(id);formDialog('核对交易性质','classify',field('交易编号','id',id,'hidden')+select('交易性质','kind',Object.entries(types).filter(([k])=>['expense','income','neutral','unknown','unknown_in','refund'].includes(k)),t.kind)+select('消费分类','cat',Object.entries(CAT_NAME),t.cat)+`<label class="toggle"><input name="remember" type="checkbox"><span>记住这个商户的同类商品分类</span></label>`,`${t.merchant} · ${money(t.cents)}；确认普通收入时，请核实不是借入或本金还款。`);return;}
 if(a==='link'){page='debts';agentContext={intent:'people_link',transactionId:id,stage:'date',draft:{name:tx(id).merchant,kind:'垫付',amount:yuan(tx(id).cents),dueDate:'',dueType:''}};openPeoplePanel(linkDraft(data,id,agentContext.draft));return;}
 if(a==='duplicate'){openTask(`<h2>这是同一笔交易吗？</h2><p>${esc(tx(id).merchant)} · ${money(tx(id).cents)}</p><p>相同金额不一定重复。确认是另一笔交易后才纳入汇总。</p><div class="stack">${btn('是重复，排除','dedup-no','primary',`data-id="${id}"`)}${btn('独立交易，保留','dedup-yes','',`data-id="${id}"`)}</div>`);return;}
 if(a.startsWith('dedup-'))return prepare('duplicate',{id,keep:a==='dedup-yes'});
 if(a==='use-expense'){openTask(`<h2>把 ${money(Number(b.dataset.amount))} 作为月支出参考？</h2><p>本期账单可能不完整、包含一次性支出。请核对房租、现金消费等遗漏，再在预算设置中填写。</p>${btn('打开预算设置','profile','primary')}`);return;}
 if(a==='transfer'){page='debts';agentContext={intent:'payment_interview',stage:'kind',draft:{kind:'',name:'',amount:'',dueDate:'',dueType:''}};openPeoplePanel(paymentDraft(data,agentContext.draft));guide('这次想普通转账、垫付，还是AA？可直接告诉我，姓名和金额也可以一起说。');return;}
 if(a==='payment-choice')return chat(b.dataset.kind==='普通付款'?'普通转账':b.dataset.kind);
 if(a==='contacts'){openTask(`<h2>联系人</h2>${data.state.contacts.map(c=>`<p>${esc(c.name)} · ${esc(c.phone)} · ${esc(c.note)}</p>`).join('')}<form data-form="contact">${field('姓名','name','','text','required')}${field('手机号（选填）','phone')}${field('备注（选填）','note')}<p id="formError" class="error"></p><button class="primary">添加联系人草案</button></form>`);return;}
 if(a==='repay'){page='debts';agentContext={intent:'due_repayment',caseId:id};const c=debt(id),matches=data.state.transactions.filter(t=>!t.caseId&&!t.duplicateOf&&!t.excluded&&t.direction===(c.kind==='借入'?'out':'in')),amountValue=b.dataset.transactionId?yuan(tx(b.dataset.transactionId).cents):b.dataset.partial?'':b.dataset.amount||yuan(remain(c)),candidates=matches.filter(t=>t.merchant===c.recipient&&t.cents===Math.round(Number(amountValue)*100)),sourceId=b.dataset.transactionId||(candidates.length===1?candidates[0].id:'');formDialog('核对还款','repay',field('往来编号','id',id,'hidden')+select('还款来源','transactionId',[['','生成模拟还款记录'],...matches.map(t=>[t.id,esc(t.date+' '+t.merchant+' '+money(t.cents))])],sourceId)+field('本次还款金额','amount',amountValue,'number',`required min=".01" max="${yuan(remain(c))}" step=".01"`),`先别急，核实到账后再处理。${c.recipient} 未结清 ${money(remain(c))}；关联已有流水时金额必须完全一致。仅在已确认到账时保存；支持部分归还，未到账请返回处理选项。`);return;}
 if(a==='due'){page='debts';agentContext={intent:'people_date',caseId:id,stage:'date',draft:{dueDate:'',dueType:''}};openPeoplePanel(dateDraft(data,id));guide('希望剩余款项什么时候归还？可以直接说“三天后”或指定日期，再核对日期性质。');return;}
 if(a==='remind'){page='debts';chatExpanded=false;openTask(reminderDialog(debt(id),'gentle',data.user.name));return;}
 if(a==='mail'){openTask(`<h2>模拟信箱</h2><p>这里的内容没有向任何人发送。</p>${data.state.mails.map(m=>`<section class="card"><b>${esc(m.recipient)}</b><p>${esc(m.text)}</p><small>${esc(m.at)}</small></section>`).join('')||'<p>暂无模拟提醒。</p>'}`);return;}
 if(a==='offset'){formDialog('同一人互欠抵消','offset',field('双方已确认是同一人的姓名','name','','text','required')+field('抵消金额','amount','','number','required min=".01" step=".01"'),'仅减待收与待还，不改变现金，不跨人合并。请先与对方协商确认。');return;}
 if(a==='offset-history'){const groups=[...new Set(data.state.offsets.map(o=>o.batchId||o.id))];openTask(`<h2>抵消历史</h2>${groups.map(id=>{const rows=data.state.offsets.filter(o=>(o.batchId||o.id)===id);return `<section class="card"><b>${esc(rows[0].recipient)} · ${money(rows.reduce((a,b)=>a+Math.round(b.amount*100),0))}</b><p>${rows[0].revoked?'已撤销':'有效抵消'}</p>${rows[0].revoked?'':btn('撤销此批次','undo-offset','small',`data-id="${id}"`)}</section>`;}).join('')||'<p>暂无抵消。</p>'}`);return;}
 if(a==='undo-offset')return prepare('undo_offset',{id});
 if(a==='archive-case')return prepare('archive_case',{id});
 if(a==='delete-case')return prepare('delete_case',{id});
 if(a==='evidence'){const c=debt(id);openTask(`<h2>记录与凭据清单</h2><p>${esc(c.recipient)} · 原额 ${money(Math.round(c.amount*100))}</p><p>流水ID：${esc(c.transactionId||'未提供')}<br>原始凭据图片：未提供<br>双方借款约定：需你补充并核实</p><p>当前版本保留事件记录；凭据图片附件尚未迁入。该清单不是法律结论。</p>${c.events.map(e=>`<p class="subtle">${esc(e.at)}<br>${esc(e.text)}</p>`).join('')}`);return;}
 if(a==='subscription')return chat(b.dataset.name+'不再需要');if(a==='keep-sub')return chat(b.dataset.name+'仍在用');
 if(a==='totp'){formDialog('绑定验证器','totp-setup',field('重新输入账户密码','password','','password','required'),'使用支持TOTP的验证器；绑定后，红色操作须输入手机上的动态码。');return;}
 if(a==='audit'){const r=await api('audit');openTask(`<h2>操作审计</h2>${r.rows.map(x=>`<details class="audit"><summary>${esc(x.at)} · ${esc(x.event)}</summary><pre>${esc(x.detail)}</pre>hash ${esc(x.hash)}<br>previous ${esc(x.prev_hash)}</details>`).join('')}`);return;}
 if(a==='export'){const r=await api('export');delete r.csrf;const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='qiancheng-my-data.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 if(a==='subs-chat')return chat('我的账单里有哪些连续扣费？');if(a==='quick-chat')return chat('我想存钱，但不确定目标是否现实，应该先提供哪些信息？');if(a==='balance-chat')return chat('查询余额');
 if(a==='simulation')return openCoachOutcome();
}
async function chat(message,displayText,options={}){
 if(aiBusy||workspaceBusy||commitBusy||importBusy)return;
 if(subscriptionActive()&&options.taskChannel!=='subscription-start'&&(options.taskChannel==='mainline'||options.taskChannel==='subscription-return'||isSubscriptionMainline(message))){
  if(pending){messages.push({who:'user',text:displayText??message});guide('草案还没执行，请先核对或取消；原主线和订阅进度均保留。');return;}
  pauseSubscriptionView();options={...options,preserveComposerDraft:true};if(!options.taskChannel)options={...options,taskChannel:'mainline'};
 }
 if(/^(?:好|好的|继续|就这样)[。！!\s]*$/.test(message)&&pending){messages.push({who:'user',text:displayText??message});guide('草案还没执行，请在当前页面核对后确认。');return;}
 if(page==='goal'&&goalScreen==='profile-review'&&coachInterview?.ready&&/^(?:信息确认无误[，,、\s]*计算三种储蓄方案|我已确认个人信息[，,、\s]*帮我预览三种方案)[。！!\s]*$/.test(message)){messages.push({who:'user',text:displayText??message});return act('confirm-coach-profile');}
 let followUpPersona=null;
 aiBusy=true;chatExpanded=true;const epoch=dialogEpoch;
 const input=$('#chatForm textarea'),preservedDraft=options.preserveComposerDraft?input?.value||'':'';let failedDraft='';if(input)input.value='';
 const sentQuote=replyQuote?.ownerId===data.user.id?normalizeQuote(replyQuote):null,quoteOwner=data.user.id;replyQuote=null;
 const view={billPeriod:period,...options,page,goalScreen,pending:!!pending,peopleForm:peoplePanel?.html.match(/data-form="([^"]+)"/)?.[1]||null};const priorIntent=agentContext.intent;const response={who:'ai',text:'',pending:true};messages.push({who:'user',text:displayText??message,...(sentQuote?{quote:sentQuote}:{})},response);markAssistantOnboarded();render();
 try{const r=await api('chat',{message,context:agentContext,view,...(sentQuote?{quote:sentQuote}:{})});
  if(epoch!==dialogEpoch){Object.assign(response,{text:'刚才的理解已完成；你已离开这一步，没有打开窗口或执行操作。',pending:false});return;}
  agentContext=r.context??agentContext;lastModelMode=r.mode;if(r.subscription&&r.context?.subscriptionFlow?.paused)pauseSubscriptionView();if(priorIntent==='transfer_purpose'&&!r.context?.intent&&!r.proposal){peoplePanel=null;peopleHistory=[];}
  Object.assign(response,{text:r.reply,status:r.modelStatus,mode:r.mode,failed:r.mode==='rules-fallback',pending:false});render();
  if(r.next==='people_cancel'){await discardPending();peoplePanel=null;peopleHistory=[];}
  else if(r.next==='bill_analysis'){const p=r.billPeriod||period;if(data.state.transactions.some(t=>t.date.startsWith(p)))await openBillAnalysis(p);else {openBillSource(p);response.text='还没有可分析的账单。你想导入自己的账单，还是先用虚构账单体验？';}}
  else if(r.next==='goal_followup'){goalEditDraft={target:r.goalDraft.target,months:r.goalDraft.months,name:r.goalDraft.purpose};goalScreen='steps';goalReview=null;page='goal';}
  else if(r.interview){coachInterview=r.interview;coachMode=r.mode;agentContext.profileReady=r.interview.ready;page='goal';if(r.interview.ready){goalScreen='profile-review';chatExpanded=false;focusMain('#goal-workspace');}}
  else if(r.task){if(r.task.action==='use-persona'){followUpPersona=r.task.persona;}else {if(['start-goal','coach-interview','agent-transfer','agent-progress','agent-bill-actions','agent-bill-analysis','route-to-bills','due-status','due-unpaid','agent-people-options'].includes(r.task.action))response.text='';await runRecommendedTask(r.task);}}
  else if(r.proposal)await prepare(r.proposal.type,r.proposal.args,!(r.subscription&&r.proposal.type==='subscription'&&r.proposal.args.status==='keep'));
 }catch(e){
  const text='这次未完成：'+e.message+'。已填写的对话条件仍保留，可以重试。';
  if(response.pending){failedDraft=message;if(sentQuote&&!replyQuote&&data?.user.id===quoteOwner)replyQuote={...sentQuote,ownerId:quoteOwner};lastModelMode='request-failed';Object.assign(response,{text,status:'本次请求未完成，没有生成模型成功回执。',failed:true,requestFailed:true,pending:false});}
  else messages.push({who:'ai',text});
 }
 finally{response.pending=false;aiBusy=false;render();const retryDraft=preservedDraft||failedDraft;if(retryDraft&&$('#chatForm textarea')&&!$('#chatForm textarea').value){$('#chatForm textarea').value=retryDraft;$('#chatForm')?.classList.toggle('has-input',true);}if(followUpPersona&&epoch===dialogEpoch&&data?.user.id===quoteOwner)await act('persona',{dataset:{persona:followUpPersona}});}
}
function rememberInlineForm(form){
 if(form?.closest('#people-workspace')&&peoplePanel){peoplePanel.values=[...form.elements].filter(x=>x.name).map(x=>({name:x.name,value:x.value,checked:x.checked}));if(['transfer','link_loan','due'].includes(form.dataset.form)&&['payment_interview','people_link','people_date'].includes(agentContext.intent)){const v=Object.fromEntries(new FormData(form));agentContext.draft={...agentContext.draft,...v,...('recipientName' in v?{name:v.recipientName}:{})};peoplePanel.context=structuredClone(agentContext);}return;}
 if(!form?.closest('#goal-workspace'))return;
 const values=Object.fromEntries(new FormData(form));
 if(form.dataset.form==='goal-inline')goalEditDraft=values;
 if(form.dataset.form==='coach')goalEditDraft={profile:{...values,kids:Number(values.kidCount)?[{stage:Number(values.kidStage),school:Number(values.school)}]:[]}};
}
document.addEventListener('input',e=>{if(e.target.name==='message'&&e.target.form?.id==='chatForm')e.target.form.classList.toggle('has-input',!!e.target.value);rememberInlineForm(e.target.form);if(e.target.name==='amount'&&e.target.form?.dataset.form==='weekly-checkin'){const box=document.querySelector('#weekly-live-feedback'),amount=Number(e.target.value);if(box)box.innerHTML=e.target.value!==''&&Number.isFinite(amount)&&amount>=0?weeklyFeedbackMarkup(Math.round(amount*100),executionPlan(data).weeklyCents):'';}});
document.addEventListener('change',e=>{rememberInlineForm(e.target.form);if(e.target.name==='kind'&&e.target.form?.dataset.form==='transfer'&&agentContext.intent==='payment_interview')openPeoplePanel(paymentDraft(data,agentContext.draft),false);});
document.addEventListener('selectstart',e=>{if(e.target?.closest?.('.input-recommendation,.composer-recommendation'))e.preventDefault();});
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;if(b.dataset.act!=='submit-form')e.preventDefault();Promise.resolve(act(b.dataset.act,b)).catch(e=>{const el=$('#dialog[open] #formError')||$('#goal-workspace #formError')||$('#people-workspace #formError');if(el)el.textContent=e.message;else toast(e.message);});});
document.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;try{
 if(f.id==='authForm'){const vals=Object.fromEntries(new FormData(f)),action=e.submitter?.value||'login';await api(action,vals);page='home';await refresh();restoreConversation(data);render();return;}
 if(f.id==='chatForm'||f.id==='homeChatForm'){await sendChatInput(f.message.value);return;}
 if(f.querySelector('[data-busy-submit]'))return;
 const name=f.dataset.form,v=Object.fromEntries(new FormData(f));if(!name)return;const submit=f.querySelector('[type="submit"],button');if(submit){submit.disabled=true;submit.dataset.busySubmit='1';}
 if(name==='goal-inline'){goalEditDraft={...v};await prepare('goal',{name:v.name.trim()||'储蓄目标',target:v.target,months:Number(v.months)},true);return;}
 if(name==='goal-message'||name==='coach-message'){const message=v.message.trim();if(!message)throw Error('请先说说你的想法');$('#dialog').close();await chat(message);return;}
 if(name==='coach-adjust'){await prepare('coach_adjust',{kind:v.kind,index:Number(v.index),basis:v.basis});return;}
 if(name==='long-term-plan'){await prepare('long_term_plan',{monthly:v.monthly,horizonMonths:Number(v.horizonMonths),acknowledged:v.acknowledged==='on'});return;}
 if(name==='weekly-checkin'){
   if(weeklyDraft?.source==='sample'&&!data.state.demo){openTask('<h2>虚构复盘体验完成</h2><p>已演示自动合计与预算对比；没有写入你的个人打卡，也没有改变现金。</p>'+btn('返回我的本周打卡','weekly-checkin','primary'));return;}
   const extra=weeklyDraft?.source?{source:weeklyDraft.source,...(weeklyDraft.source==='file'?{rows:weeklyDraft.rows}:weeklyDraft.source==='sample'?{sampleVariant:weeklyDraft.sampleVariant}:{})}:{};
   await prepare('weekly_checkin',{weekStart:v.weekStart,amount:v.amount,note:v.note,completedActionIds:new FormData(f).getAll('completedActionIds'),...extra});weeklyDraft=null;return;
  }
 if(name==='bill-plan'){
  if(v.monthlyConfirmed!=='on')throw Error('请核对是否适合作为未来每月预算假设');
  if(Math.round(Number(v.reduction)*100)!==Number(f.dataset.previewReduction))throw Error('金额已变化，请先点击重新预览，核对更新后的影响');
  await prepare('bill_plan',{period:v.period,opportunity:v.opportunity,reduction:v.reduction,instruction:v.instruction,monthlyConfirmed:true});return;
 }
 if(name==='goal-followup'){
  const months=Number(v.months),target=Number(v.target);if(!Number.isInteger(months)||months<1||months>360||!Number.isFinite(target)||target<=0)throw Error('请填写有效金额和1—360个月的期限');
  messages.push({who:'user',text:`我确认：${months}个月攒${v.target}元${v.purpose?'，用于'+v.purpose:'，用途暂不填写'}`});agentContext={};coachInterview=null;
  await prepare('goal',{name:v.purpose.trim()||'储蓄目标',target:v.target,months});return;
 }
 if(['transfer','link_loan'].includes(name)){if(v.recipientName){v.name=v.recipientName.trim();delete v.recipientName;}if(!v.dueType)throw Error('请核对日期性质，或明确选择暂不设置日期');}
 if(name==='time'){await prepare('advance_time',{days:Number(v.days)});return;}
 if(name==='commit'){await commitPending(v.code);return;}
 if(name==='totp-setup'){bind=await api('totp/setup',v);openTask(`<h2>在验证器添加账户</h2><p>在手机验证器选择“手动输入密钥”，账户名填钱程，类型选基于时间。</p><pre>${esc(bind.secret)}</pre><p class="footnote">此密钥只用于绑定，勿分享。绑定完成后此处不再显示。</p><form data-form="totp-enable">${field('验证器当前6位动态码','code','','text','required pattern="[0-9]{6}" inputmode="numeric"')}<p id="formError" class="error"></p><button class="primary">完成绑定</button></form>`);return;}
 if(name==='totp-enable'){await api('totp/enable',{id:bind.id,code:v.code});bind=null;$('#dialog').close();await refresh();toast('验证器已绑定');return;}
 if(name==='classify')v.remember=v.remember==='on';await prepare(name,v);
 }catch(err){const el=f.querySelector('.error')||$('#dialog[open] #formError')||$('#authError');if(el)el.textContent=err.message;else toast(err.message);f.querySelectorAll('button').forEach(b=>b.disabled=false);}});
document.addEventListener('change',async e=>{try{if(e.target.name==='owner'&&e.target.closest('[data-form=remind]')){const f=e.target.form;openTask(reminderDialog(debt(f.elements.id.value),f.elements.style.value,e.target.value||'委托人'),false);}if(e.target.id==='period'){if(pending){e.target.value=period;toast('请先处理待确认草案，再切换账单月份');return;}if(subscriptionActive())pauseSubscriptionView(false);period=e.target.value;render();}if(e.target.id==='fileInput'){const f=e.target.files[0];if(!f)return;if(importBusy)return;importBusy=true;
 const epoch=dialogEpoch,accountId=data.user.id,scope=data.workspace?.active,source=$('#importSource').value;e.target.disabled=true;$('#formError').textContent='正在解析…';
 try{const parsed=await readStatement(f);if(epoch!==dialogEpoch||data?.user.id!==accountId||data.workspace?.active!==scope)return;importData=parsed;await prepare('import',{rows:importData.rows,source});}
 catch(err){if(epoch!==dialogEpoch||data?.user.id!==accountId||data.workspace?.active!==scope)return;throw err;}
 finally{importBusy=false;e.target.disabled=false;e.target.value='';}}}catch(err){const el=$('#formError');if(el)el.textContent=err.message;else toast(err.message);}});
$('#dialog').addEventListener('cancel',e=>{e.preventDefault();close();});
api('state').then(d=>{data=d;restoreConversation(d);page='home';render();}).catch(()=>login());

async function checkVisibleDue(){
 if(!data||document.hidden||aiBusy||pending||$('#dialog').open||Object.keys(agentContext).length)return;
 try{await refresh();const c=dueForCheck();if(c&&!duePopupsSeen.has(duePopupKey(c))){duePopupsSeen.add(duePopupKey(c));guide(c.recipient+'的往来已到记录日期。你可以主动核对是否归还；未收到的钱不会计入可用资金。',false);}else render();}catch{}
}
setInterval(checkVisibleDue,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkVisibleDue();});

installViewport(window,document,syncDockHeight);

function syncCompactTables(){const compact=window.matchMedia('(max-width:900px)').matches;document.querySelectorAll('.allocation-method').forEach(d=>d.open=!compact);}
window.matchMedia('(max-width:900px)').addEventListener?.('change',syncCompactTables);

function captureWeeklyDraft(){
 const f=document.querySelector('[data-form="weekly-checkin"]');if(!f)return weeklyDraft||{};
 return {...weeklyDraft,weekStart:f.elements.weekStart.value,amount:f.elements.amount.value,note:f.elements.note.value,completedActionIds:new FormData(f).getAll('completedActionIds')};
}
document.addEventListener('change',async e=>{
 if(e.target.id==='weeklyFileInput'){
  const draft=captureWeeklyDraft(),epoch=dialogEpoch,accountId=data.user.id;
  try{const file=e.target.files[0];if(!file)return;document.querySelector('#weeklyFileError').textContent='正在读取并合计本周账单…';
   if(data.state.demo)throw Error('当前为虚构体验；真实账单请在自己的免注册会话复盘，不混入样本。');
   const parsed=await readStatement(file);if(epoch!==dialogEpoch||data.user.id!==accountId)return;
   weeklyDraft={...draft,source:'file',rows:parsed.rows,amount:undefined,report:summarizeWeek(parsed.rows,draft.weekStart,{rules:data.state.rules||[]})};
   openTask(weeklyCheckinDialog(data,weeklyDraft));
  }catch(err){const el=document.querySelector('#weeklyFileError');if(el)el.textContent=err.message;}
 }
 if(e.target.name==='weekDate'){
  try{const draft=captureWeeklyDraft(),week=weekWindow(e.target.value).start;
   const rows=draft.source==='sample'?sampleWeekRows(week,undefined,{budgetCents:executionPlan(data).weeklyCents,variant:draft.sampleVariant||'within'}):draft.source==='ledger'?data.state.transactions:draft.rows;
   weeklyDraft={...draft,weekStart:week,amount:undefined,report:draft.source?summarizeWeek(rows,week,{ledger:draft.source==='ledger',rules:draft.source==='sample'?[]:data.state.rules||[]}):undefined};
   openTask(weeklyCheckinDialog(data,weeklyDraft));
  }catch(err){document.querySelector('#formError').textContent=err.message;}
 }
});

installQuoteGestures(document,index=>Promise.resolve(act('quote-message',{dataset:{id:String(index)}})).catch(e=>toast(e.message)));

installChatKeyboard(document,value=>Promise.resolve(sendChatInput(value)).catch(e=>toast(e.message)));

function restoreConversation(d){if(d.conversation?.length)messages=d.conversation.map(m=>({who:m.role==='user'?'user':'ai',text:m.text,...(m.quote?{quote:{text:m.quote,author:'引用内容',role:'assistant'}}:{})}));agentContext=d.conversationContext||{};}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const features=[
 {number:'①',name:'目标教练',question:'想攒的钱，现在做得到吗？',example:'我想两年攒2万去旅行',action:'example-goal',
  short:'说出目标，补齐收入和生活条件；比较三条路线，再落实到月分配、周预算和打卡。',
  when:'想旅行、买电脑，或为一件重要的事攒钱，却不知道每月该存多少。',
  steps:['了解收入、住房和必要开支，核对你的现实条件。','计算三条储蓄路线；目标偏难时，说清差距并比较调整办法。','选定路线后，列出每月资金分配、每周可花额度和行动打卡。'],
  result:'一条你亲自选择、能按周执行的储蓄计划。'},
 {number:'②',name:'账单体检',question:'钱花在哪？下个月具体怎么改？',example:'分析账单，找找调整空间',action:'example-bills',
  short:'选自己的月账单或虚拟样本，找出可调整项目；接受建议后，更新目标预算与每周行动。',
  when:'总觉得钱花得快，想找一两件真正能坚持的改进，而不是一味少花钱。',
  steps:['先选择导入自己的账单，或用明确虚构的样本体验。','看消费结构，核对订阅、疑似重复和用途不明的转账。','把你接受的建议写成次数、金额上限与每周行动，并反馈给目标教练。'],
  result:'一项有账单依据、金额明确、可以打卡的预算改进。'},
 {number:'③',name:'人情往来',question:'谁欠谁多少？什么时候合适提醒？',example:'给小王垫付100元',action:'example-debts',
  short:'把垫付、借入和借出记清楚；到期先核对是否归还，再选三种提醒话术，支持部分归还与抵消。',
  when:'替同学垫钱、AA聚餐或朋友借还款，想记清金额，也想把关系照顾好。',
  steps:['核对对方、用途、金额与日期，分清约定日期和个人期望。','到期先问是否已经归还；先选一种处理方式，未收到的钱不计入可用现金。','需要提醒时，从三种授权助手话术中选一句，再由你确认模拟发送。'],
  result:'清楚的待收待还记录，以及由你掌握分寸的后续处理。'}
];
function completed(s,index){return index===0?!!s.coachRoute:index===1?!!(s.billAnalysisCompleted||s.billReviewBasis):!!(s.peopleSceneCompleted||s.cases?.length);}
export function scenarioCards(state,detailed=false){
 return `<section class="card feature-overview ${detailed?'feature-detailed':''}" id="scenes"><div class="row"><div><div class="eyebrow">不知道从哪开始？先选一个问题</div><h2>三个场景，围绕同一笔钱</h2></div>${detailed?'':'<button class="small" data-act="to-intro">查看完整功能介绍 →</button>'}</div><div class="scenario-grid">${features.map((f,i)=>`<article class="scenario-card feature-card"><div class="feature-heading"><span class="scenario-number">${f.number}</span><h3>${f.name}</h3></div><b class="feature-question">${f.question}</b>${detailed?`<p>${f.when}</p><ol class="feature-steps">${f.steps.map(step=>`<li>${step}</li>`).join('')}</ol><p class="feature-result"><b>最后得到：</b>${f.result}</p>`:`<p>${f.short}</p>`}<div class="feature-example"><small>可以对钱程说</small><span>“${f.example}”</span></div><div class="row feature-actions"><span class="badge ${completed(state,i)?'':'warn'}">${completed(state,i)?'已体验':'可体验'}</span><button class="small" data-act="${f.action}">体验${f.name} →</button></div></article>`).join('')}</div></section>`;
}
export function featureIntro(){
 const items=[
  ['01','目标教练','比较三种储蓄方案，看看目标是否可行，再形成执行计划。','难以实现时，说明差距，帮你尝试调整。','goal'],
  ['02','账单体检','看清消费与订阅，找出可以调整的支出。','把你确认的行动纳入计划，亲友转账不直接判成浪费。','bills'],
  ['03','人情往来','理清垫付、借还款和 AA，核对归还日期与到账情况。','记录往来，体验模拟提醒。','debts']
 ];
 return `<section class="intro-redesign"><span class="intro-badge">参赛沙箱</span><h1>钱程，能帮你做什么？</h1><p class="intro-lead">从一句话开始，把想法变成可执行的安排。</p><div class="intro-items">${items.map(([n,name,l1,l2,pg])=>`<button type="button" class="intro-item" data-act="nav" data-page="${pg}" title="进入${name}"><span class="intro-num">${n}</span><span class="intro-item-body"><b>${name}</b><span>${l1}<br>${l2}</span></span></button>`).join('')}</div><h2 class="intro-how">怎么开始？</h2><p class="intro-flow">说出需求 <i>→</i> 钱程补齐信息 <i>→</i> 核对结果 <i>→</i> 确认后执行</p><button class="intro-cta" data-act="to-home">开始使用 <i>→</i></button><p class="intro-note">免费沙箱，付费、订阅和提醒均为模拟。</p></section>`;
}

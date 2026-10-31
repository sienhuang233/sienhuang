const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=(label,name,value='',type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select=(label,name,rows,value,extra='')=>`<label>${label}<select name="${name}" ${extra}>${rows.map(([v,t])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${t}</option>`).join('')}</select></label>`;
const kinds=[['','请选择这次指令'],['普通付款','普通转账'],['垫付','替对方垫付'],['AA','AA：核对总额与对方份额'],['借款','借给对方'],['借入','向对方借入']];
const dates=(draft,days=null)=>field('归还日期（由你填写，可暂不设置）','dueDate',draft.dueDate||'','date')+select('日期性质','dueType',[['','请选择日期性质'],['agreed','双方已经约定'],['desired','本人期望'],['none','未约定，暂不设置日期']],draft.dueType||'', 'required')+(days==null?'':select('提醒间隔','days',[0,1,3,7,15,30].map(v=>[v,v?'每'+v+'天':'关闭提醒']),days));
const nameField=(value='')=>field('对方姓名（例如：小王，可自定义）','recipientName',value,'text','required maxlength="40" placeholder="例如：小王" autocomplete="off" autocorrect="off" spellcheck="false"');
const footer='<p class="error" id="formError"></p><button class="primary" type="submit">核对这一步</button>';
export function paymentDraft(data,draft={}){
 const ordinary=draft.kind==='普通付款';
 return `<h2>模拟付款／垫付／AA</h2><p>可以在聊天里补充，也可直接改下面的字段。只操作模拟账户，确认前不付款。</p><div class="stack payment-choices">${[['普通付款','普通转账'],['垫付','垫付'],['AA','AA']].map(([v,t])=>`<button data-act="payment-choice" data-kind="${v}" class="small">${t}</button>`).join('')}</div><form data-form="transfer" autocomplete="off"><div class="formgrid">${select('这次指令','kind',kinds,draft.kind||'','required')}${nameField(draft.name||'')}${field(draft.kind==='AA'?'整笔实际付款总额（元）':'金额（元）','amount',draft.amount||'','number','required min=".01" step=".01"')}${draft.kind==='AA'?field('其中对方应还份额（元）','receivableAmount',draft.receivableAmount||'','number',`required min=".01" step=".01" max="${esc(draft.amount||100000000)}"`):''}${field('用途（可填，选填）','purpose',draft.purpose||'','text','maxlength="80" autocomplete="off"')}${ordinary?'<input type="hidden" name="dueType" value="none">':dates(draft)}</div>${footer}</form>`;
}
export function linkDraft(data,id,draft={}){
 const t=data.state.transactions.find(t=>t.id===id);if(!t)throw Error('该流水不存在');const initial={name:t.merchant,kind:t.direction==='in'?'借入':'垫付',amount:(t.cents/100).toFixed(2),dueDate:'',dueType:'',...draft};
 return `<h2>核对已有流水的往来信息</h2><p>原流水 ${(t.cents/100).toFixed(2)}元；只关联，不新增付款。AA只记录对方应还份额，剩余部分单列本人消费。</p><form data-form="link_loan" autocomplete="off"><div class="formgrid">${field('流水编号','id',id,'hidden')}${nameField(initial.name)}${select('性质','kind',t.direction==='in'?[['借入','借入']]:[['垫付','替对方垫付'],['借款','借给对方'],['AA','AA待收份额']],initial.kind)}${field('对方应还金额／份额（元）','amount',initial.amount,'number',`required min=".01" max="${t.cents/100}" step=".01"`)}${dates(initial)}</div>${footer}</form>`;
}
export function dateDraft(data,id,draft={}){
 const c=data.state.cases.find(c=>c.id===id);if(!c)throw Error('往来记录不存在');
 return `<h2>调整剩余款项的归还日期</h2><p>${esc(c.recipient)}；原日期 ${esc(c.dueDate||'未设置')}。新日期和性质由你确认，不预设双方已经约定。</p><form data-form="due"><div class="formgrid">${field('往来编号','id',id,'hidden')}${dates({dueDate:'',dueType:'',...draft},c.reminderDays)}</div>${footer}</form>`;
}

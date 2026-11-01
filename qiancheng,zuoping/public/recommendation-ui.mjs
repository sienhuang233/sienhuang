const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function recommendationStrip(title,changed=false,busy=false){
 return `<div class="recommendation-line" aria-live="polite"><button type="button" class="composer-recommendation ${changed?'recommendation-changed':''}" data-act="follow-recommendation" title="${esc(title)}" ${busy?'disabled':''}><b>钱程推荐下一步：</b><span>${esc(title)}</span><i aria-hidden="true">↗</i></button></div>`;
}

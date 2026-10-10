// Private review presentation. All values and images come from the explicit local bundle.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>new Intl.NumberFormat('en-GB').format(n);
const compact=n=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
const date=s=>new Date(s).toLocaleString('en-GB',{timeZone:'Europe/Paris',dateStyle:'medium',timeStyle:'short'});
const model=id=>({'gpt-6-sol':'GPT-6 Sol','claude-opus-5-5':'Opus 5.5','claude-fable-5-1':'Fable 5.1'}[id]||id);

export function achievementCard(c,index,images){
 const price=c.model_price_estimate;
 const rates=price?Object.entries(price.components||{}).map(([id,v])=>`<li>${esc(id)}: ${number(v.tokens)} tokens, $${v.usd.toFixed(2)} est. ${esc(v.rates_description||`Rates per million: input $${v.rates_per_million[0]}, output $${v.rates_per_million[1]}, cache reads $${v.rates_per_million[2]}, 5-minute writes $${v.rates_per_million[3]}, 1-hour writes $${v.rates_per_million[4]}.`)}</li>`).join(''):'';
 return `<article class="candidate achievement" id="${esc(c.id)}">
 <header><span class="pick-number">${index+1}</span><strong>${esc(c.project)}</strong><span class="achievement-state">${esc(c.state)}</span></header>
 <div class="shots hero-gallery" id="gallery-${esc(c.id)}" aria-label="${esc(c.project)} photos" tabindex="0">${images.join('')}</div>
 <div class="gallery-dots" aria-label="Choose a photo">${images.map((_,n)=>`<button type="button" data-gallery-dot="gallery-${esc(c.id)}" data-slide="${n}" aria-label="Show image ${n+1} of ${images.length}" aria-pressed="${n===0}"><i></i></button>`).join('')}</div>
 <div class="story"><h2>${esc(c.title)}</h2><p>${esc(c.summary)}</p></div>
 <dl class="achievement-facts"><div><dt>Tokens</dt><dd title="${number(c.usage.total_tokens)} recorded tokens">${compact(c.usage.total_tokens)}</dd></div><div><dt>Est. dollars</dt><dd>${price?'$'+price.usd.toFixed(2):'Unknown'}</dd></div><div><dt>Active time*</dt><dd>${c.tool_active_minutes_proxy} <small>min</small></dd></div></dl>
 <p class="achievement-model">${c.models.map(x=>esc(model(x))).join(' + ')} · ${c.commits.length} ${c.commits.length===1?'commit':'commits'}</p>
 <details class="measurement-details"><summary>About these measurements</summary>
 <p><strong>Captured window:</strong> ${esc(date(c.start))} → ${esc(date(c.end))} · Paris. ${esc(c.stateNote)}</p>
 <p><strong>Images:</strong> ${esc(c.imageNote)}</p>
 <p><strong>Tokens:</strong> ${number(c.usage.total_tokens)} recorded across this bounded builder window, including cached input once. The full window is measured, not usage attributed only to these commits.</p>
 <dl class="source-facts"><dt>Input, including cache</dt><dd>${number(c.usage.input_tokens)}</dd><dt>Output</dt><dd>${number(c.usage.output_tokens)}</dd><dt>Cached input</dt><dd>${number(c.usage.cached_input_tokens)}</dd><dt>Usage records</dt><dd>${number(c.usage.records)} · ${esc(c.usage.basis)}</dd></dl>
 <p><strong>* Active time is a tool-activity proxy:</strong> ${c.tool_active_minutes_proxy} one-minute clock bins contain at least one recorded tool call. It is not measured human active time or continuous tool runtime.</p>
 ${price?`<p><strong>Estimated dollars:</strong> ${esc(price.basis)} <a href="${esc(price.source)}" target="_blank" rel="noopener">${esc(price.source_label||'Published model pricing')}</a>, checked ${esc(price.verified_on)}.</p><ul>${rates}</ul><p>${esc(price.cache_note||`Recorded cache writes: ${number(price.cache_write_5m_tokens)} at 5 minutes and ${number(price.cache_write_1h_tokens)} at 1 hour.`)}</p>`:'<p>No bill or supported model-price estimate was recorded.</p>'}
 <p><strong>You typed:</strong> ${c.you_typed===null?`${c.user_messages} user-role messages were captured, including coordinator messages. No human typing count is claimed.`:`${number(c.you_typed)} direct human messages. System instructions and continuation summaries are excluded.`}</p>
 <p class="source">${esc(c.source.split('/').pop())}<br>Lines ${c.source_lines.join('–')}<br>SHA-256 ${esc(c.source_sha256)}</p>
 <h3>Git evidence · ${c.files.length} files</h3><ul>${c.commits.map(x=>`<li><code>${esc(x.sha.slice(0,7))}</code> ${esc(x.subject)}<small>${esc(date(x.date))}</small></li>`).join('')}</ul>
 <details><summary>Changed files</summary><ul>${c.files.map(x=>`<li><code>${esc(x)}</code></li>`).join('')}</ul></details>
 <h3>Quote candidate · Oscar approval needed</h3>${c.quote_candidate?`<p class="quote-text">${esc(c.quote_candidate.text)}</p><p>First direct human message · ${esc(date(c.quote_candidate.timestamp))} · source line ${c.quote_candidate.line}. Private; not selected or published.</p>`:'<p>No directly attributed Oscar message is available in this window. Coordinator text is not offered as his quote.</p>'}
 </details></article>`;
}

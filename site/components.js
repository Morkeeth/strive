/* Text is escaped here so every caller gets the same safe component output. */
(function(root){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=({label,href,id='',primary=false,disabled=false})=>`<${href?'a':'button'} class="v2-button${primary?' primary':''}"${href?` href="${esc(href)}"`:' type="button"'}${id?` id="${esc(id)}"`:''}${disabled?' disabled':''}>${esc(label)}</${href?'a':'button'}>`;
const field=({id,label,placeholder='',value='',multiline=false,required=false,maxlength=120,type='text'})=>`<label class="v2-field" for="${esc(id)}">${esc(label)}<${multiline?'textarea':'input'} id="${esc(id)}"${multiline?'':` type="${esc(type)}" value="${esc(value)}"`} placeholder="${esc(placeholder)}" maxlength="${maxlength}"${required?' required':''}>${multiline?esc(value)+'</textarea>':''}</label>`;
const avatar=({src='/favicon.svg',label='STRIVE'})=>`<span class="v2-avatar"><img src="${esc(src)}" alt="${esc(label)}" width="40" height="40"></span>`;
const empty=({title,body,action,href})=>`<div class="v2-empty"><h2>${esc(title)}</h2><p>${esc(body)}</p>${action?button({label:action,href,primary:true}):''}</div>`;
const segmented=({id,label,options,value})=>`<fieldset id="${esc(id)}" class="v2-segmented"><legend class="visually-hidden">${esc(label)}</legend>${options.map(([key,text])=>`<label><input type="radio" name="${esc(id)}" value="${esc(key)}"${key===value?' checked':''}><span>${esc(text)}</span></label>`).join('')}</fieldset>`;
const api={esc,button,field,avatar,empty,segmented};root.StriveUI=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

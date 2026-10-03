/* Outside the routed app: navigating never destroys an in-progress message. */
window.StriveFeedback=function({client,me,signIn}){
 const root=document.createElement('aside');root.className='roadmap-feedback';
 root.innerHTML='<button class="feedback-launch" aria-haspopup="dialog">Impact the roadmap or whine</button><dialog aria-labelledby="roadmap-title"><form><header><h2 id="roadmap-title">Impact the roadmap or whine</h2><button type="button" class="feedback-close" aria-label="Close feedback">×</button></header><p>Something missing? Something annoying? Tell us.</p><label>Category<select name="category"><option value="idea">Idea</option><option value="bug">Bug</option><option value="other">Other</option></select></label><label>Your feedback<textarea name="message" maxlength="2000" required rows="5"></textarea></label><p class="hint">Private feedback for the team. Keep passwords and private session text out.</p><button type="submit">Save feedback</button><p role="status" aria-live="polite"></p></form></dialog>';
 document.body.append(root);const dialog=root.querySelector('dialog'),form=root.querySelector('form'),message=form.elements.message,state=root.querySelector('[role=status]'),send=form.querySelector('[type=submit]');let owner,requestId=crypto.randomUUID(),busy=false;
 message.addEventListener('input',()=>{requestId=crypto.randomUUID()});form.elements.category.addEventListener('change',()=>{requestId=crypto.randomUUID()});
 function sync(){const next=me()?.id||null;if(next!==owner){owner=next;message.value='';state.textContent='';requestId=crypto.randomUUID()}send.textContent=owner?'Save feedback':'Sign in to save feedback';}
 function open(){sync();if(!dialog.open)dialog.showModal();message.focus()}
 root.querySelector('.feedback-launch').onclick=open;root.querySelector('.feedback-close').onclick=()=>dialog.close();
 // Clear a previous account's draft even when the panel stays open during sign out.
 const timer=setInterval(sync,500);
 form.onsubmit=async e=>{e.preventDefault();sync();if(busy)return;if(!owner){signIn();return}const text=message.value.trim();if(!text||text.length>2000){state.textContent='Write between 1 and 2000 characters.';return}
 const submittedOwner=owner;busy=true;send.disabled=true;message.readOnly=true;form.elements.category.disabled=true;state.textContent='Saving…';
 try{const result=await client.rpc('save_feedback',{p_request_id:requestId,p_category:form.elements.category.value,p_message:text});if(result.error||!result.data)throw Error('Not persisted');if(me()?.id!==submittedOwner)return;message.value='';requestId=crypto.randomUUID();state.textContent='Saved privately. Thank you.';if(window.GrinderFeedbackWake)void window.GrinderFeedbackWake(client.auth)}catch(_){if(me()?.id===submittedOwner)state.textContent='Could not confirm the save. Your text is still here. Try again.'}finally{busy=false;send.disabled=false;message.readOnly=false;form.elements.category.disabled=false;sync()}};
 return {open,destroy(){clearInterval(timer);root.remove()}};
};
window.StriveSavedRuns=async function({client,slot,current=()=>true}){
 try{const {data,error}=await client.rpc('saved_run_count');if(error||!current())return;const count=Number(data);if(!Number.isSafeInteger(count)||count<1)return;
 const card=document.createElement('p');card.className='saved-run-reward';card.setAttribute('role','status');card.textContent=count===1?'First stride · 1 saved run':count+' saved runs';card.title='Runs currently saved in your account. This is not a productivity score.';slot.prepend(card);
 }catch(_){};
};

/* Outside the routed app: navigating never destroys an in-progress message. */
window.StriveFeedback=function({client,me,signIn}){
 const root=document.createElement('aside');root.className='roadmap-feedback';
 root.innerHTML='<button class="feedback-launch" aria-haspopup="dialog">Feedback</button><dialog aria-labelledby="roadmap-title"><form><header><h2 id="roadmap-title">Impact the roadmap or whine</h2><button type="button" class="feedback-close" aria-label="Close feedback">×</button></header><p>What should we change?</p><label>Your feedback<textarea name="message" maxlength="2000" required rows="5"></textarea></label><p class="hint">Private to the team. Not a promise to implement. Keep passwords and private session text out.</p><button type="submit">Send feedback</button><p role="status" aria-live="polite"></p></form></dialog>';
 document.body.append(root);const dialog=root.querySelector('dialog'),form=root.querySelector('form'),message=form.elements.message,state=root.querySelector('[role=status]'),send=form.querySelector('[type=submit]');let owner,requestId=crypto.randomUUID(),busy=false,ambiguous=false,revised=false;
 message.addEventListener('input',()=>{requestId=crypto.randomUUID();if(ambiguous){revised=true;state.textContent='The earlier message may already be saved. Send this edited text as a new message.';sync()}});
 const loginKey='strive_feedback_login_draft';
 const freshLogin=draft=>Number.isFinite(draft?.at)&&Date.now()-draft.at>=0&&Date.now()-draft.at<30*60*1000;
 let pendingLogin=null;
 try{const draft=JSON.parse(sessionStorage.getItem(loginKey)||'null');if(draft&&typeof draft.text==='string'&&draft.text.length<=2000&&freshLogin(draft))pendingLogin=draft;else sessionStorage.removeItem(loginKey)}catch(_){}
 function sync(){const next=me()?.id||null;
   if(pendingLogin&&!freshLogin(pendingLogin)){pendingLogin=null;try{sessionStorage.removeItem(loginKey)}catch(_){};requestId=crypto.randomUUID();state.textContent=''}
   if(next!==owner){const was=owner;owner=next;
   // Only an explicitly staged signed-out draft can cross a login boundary.
   if(!was&&next&&pendingLogin){message.value=pendingLogin.text;requestId=pendingLogin.id;pendingLogin=null;try{sessionStorage.removeItem(loginKey)}catch(_){};state.textContent='Your draft is ready. Review it, then send.';if(!dialog.open)dialog.showModal();message.focus()}
   else if(was){ambiguous=false;revised=false;message.value='';state.textContent='';requestId=crypto.randomUUID();pendingLogin=null;try{sessionStorage.removeItem(loginKey)}catch(_){}}
 }send.textContent=owner?(revised?'Send as new feedback':'Send feedback'):'Sign in to send feedback';}

 function open(){sync();if(!dialog.open)dialog.showModal();message.focus()}
 root.querySelector('.feedback-launch').onclick=open;root.querySelector('.feedback-close').onclick=()=>dialog.close();
 // Clear a previous account's draft even when the panel stays open during sign out.
 if(pendingLogin)message.value=pendingLogin.text;
 const timer=setInterval(sync,500);
 form.onsubmit=async e=>{e.preventDefault();sync();if(busy)return;if(!owner){pendingLogin={text:message.value,id:requestId,at:Date.now()};try{sessionStorage.setItem(loginKey,JSON.stringify(pendingLogin))}catch(_){state.textContent='Your browser could not keep this draft for sign-in. Copy your text before continuing.';return}dialog.close();signIn();return}const text=message.value.trim();if(!text||text.length>2000){state.textContent='Write between 1 and 2000 characters.';return}
 const submittedOwner=owner;busy=true;send.disabled=true;message.readOnly=true;state.textContent='Saving…';
 try{const result=await client.rpc('save_feedback',{p_request_id:requestId,p_category:'other',p_message:text});if(result.error||!result.data)throw Error('Not persisted');if(me()?.id!==submittedOwner)return;message.value='';ambiguous=false;revised=false;requestId=crypto.randomUUID();state.textContent='Saved. Thanks for saying it.';if(window.GrinderFeedbackWake)void window.GrinderFeedbackWake(client.auth)}catch(_){if(me()?.id===submittedOwner){ambiguous=true;state.textContent='Could not confirm the save. Your text is still here. Try again.'}}finally{busy=false;send.disabled=false;message.readOnly=false;sync()}};
 return {open,destroy(){clearInterval(timer);root.remove()}};
};
window.StriveSavedRuns=async function({client,slot,current=()=>true}){
 try{const {data,error}=await client.rpc('saved_run_count');if(error||!current())return;const count=Number(data);if(!Number.isSafeInteger(count)||count<1)return;
 const card=document.createElement('p');card.className='saved-run-reward';card.setAttribute('role','status');card.textContent=count===1?'First stride · 1 saved run':count+' saved runs';card.title='Runs currently saved in your account. This is not a productivity score.';slot.prepend(card);
 }catch(_){};
};

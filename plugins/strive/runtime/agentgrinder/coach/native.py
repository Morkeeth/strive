"""Capability-limited coaching for native Cursor/Codex activity. Claims remain unknown."""
from types import SimpleNamespace
import json

FIELDS=('turns_typed','tool_calls','files_touched','commits','claims','claims_verified','artifacts_produced','duration_s')


def review_activity(run, mode='local'):
    if mode=='bedrock':
        from .live_config import LiveConfigError, live_status_text, missing_live_config
        if missing_live_config():
            raise LiveConfigError(live_status_text())
    facts={key:run.get(key) for key in FIELDS}
    state={'read':False,'verdict':None}
    ctx=SimpleNamespace(dispatch=[])
    def read_activity():
        state['read']=True
        return {'numbers':facts,'harness':run['harness'],'trace_basis':run.get('trace_basis'),
                'limits':'Claim evidence is not supported by this adapter. File existence is a current disk observation. Commit commands do not independently prove commits.',
                'accepted_practices':(run.get('practice_context') or []) if mode!='bedrock' else []}
    def write_verdict(numbers:dict, paragraph:str, plan:list[str]):
        if not state['read'] or json.dumps(numbers,sort_keys=True)!=json.dumps(facts,sort_keys=True):
            return {'accepted':False,'reason':'Read the activity and preserve all counts and unknowns exactly.'}
        if not paragraph.strip() or not plan or len(plan)>5:
            return {'accepted':False,'reason':'Provide a short observation and one to five proposed next steps.'}
        state['verdict']={'numbers':numbers,'paragraph':paragraph[:800],'plan':[p[:500] for p in plan]}
        return {'accepted':True,'verdict':state['verdict']}
    def policy(history):
        if not history:return ('read_activity',{})
        first=history[0][2]
        if len(history)>1:return None
        n=first['numbers']
        from .experiment import activity_experiment
        experiment=activity_experiment(run)
        paragraph=(f"The transcript records {n['turns_typed']} human turns and {n['tool_calls']} "
                   "tool calls. Claim verification is unavailable for this adapter; no success "
                   "rate is inferred.")
        return ('write_verdict',dict(numbers=n,paragraph=paragraph,plan=experiment['plan']))
    if mode=='none':
        history=[]
        while True:
            step=policy(history)
            if step is None:break
            name,arguments=step
            result={'read_activity':read_activity,'write_verdict':write_verdict}[name](**arguments)
            history.append((name,arguments,result));ctx.dispatch.append({'tool':name,'source':'direct call'})
        label='deterministic activity review · no agent or model'
    else:
        from strands import Agent,tool
        from .agent import _dispatch_log
        kwargs={}
        if mode=='local':
            from .local_model import ScriptedLocalModel
            kwargs['model']=ScriptedLocalModel(policy=policy)
            label='Strands loop · local scripted activity coach'
        elif mode=='bedrock':
            label='Strands loop · Bedrock activity coach'
        else:raise ValueError('Unknown coaching mode')
        @tool
        def read_activity_tool() -> dict:
            """Read supported activity counts and explicit capability limits. No transcript text."""
            return read_activity()
        @tool
        def write_verdict_tool(numbers:dict,paragraph:str,plan:list[str]) -> dict:
            """Save an activity review only if the counts and unknowns match read_activity."""
            return write_verdict(numbers,paragraph,plan)
        # Use native tool names in the policy rather than alter the registered SDK tools.
        def tool_policy(history):
            step=policy(history)
            if step is None:return None
            name,args=step
            return (name+'_tool',args)
        if mode=='local':kwargs['model']=ScriptedLocalModel(policy=tool_policy,final_text='Activity review written from the supported counts. Claim evidence remains unavailable.')
        agent=Agent(tools=[read_activity_tool,write_verdict_tool],hooks=[_dispatch_log(ctx)],
                    system_prompt='Read the activity, then write one useful observation and a short next-session plan. Preserve every supplied number and null exactly. Claim verification is unavailable. Do not claim that commit commands prove commits. Do not infer causation or success from activity counts. Use write_verdict_tool once.',
                    callback_handler=None,**kwargs)
        agent('Review this session using only the supplied activity and capability limits.')
    if state['verdict'] is None:raise ValueError('The activity coach did not produce an accepted review.')
    verdict=state['verdict']
    from .experiment import activity_experiment, public_experiment, public_text
    exp = activity_experiment(run)
    run.update(
        coach_mode=label,
        coach_verdict=public_text(verdict['paragraph']),
        coach_plan=public_text('\n'.join(verdict['plan'])),
        coach_numbers=verdict['numbers'],
        coach_tool_calls=len(ctx.dispatch),
        coach_experiment=public_experiment(exp),
        coach_experiment_local=exp,
    )
    if run.get('practice_context'):
        run['private_coach_plan']='Review your accepted practice: '+run['practice_context'][0]['title']
    return label+'\n'+verdict['paragraph']+'\n'+'\n'.join('- '+p for p in verdict['plan'])

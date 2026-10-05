// The run row an import saves, built in one place so the single preview and the day review cannot
// drift apart. It always starts private. It carries only fields the export already showed.
(function(root){
  function build(run,{profileId,title,project,caption,output,repo}){
    const base={profile_id:profileId,title:title||'Untitled run',
      project,model:run.model||null,capture_metadata:run.capture_metadata||null,segment_id:run.segment_id||null,
      wall_time_s:Number.isInteger(run.wall_time_s)&&run.wall_time_s>=0?run.wall_time_s:null,
      harness:run.harness||null,prompts:run.turns_typed??null,duration_s:run.duration_s??null,
      commits:run.commits??null,tool_calls:run.tool_calls??null,shell_calls:run.shell_calls??null,files_touched:run.files_touched??null,
      rhythm:run.rhythm||null,caption:caption||null,output_url:output||null,visibility:'private',started_at:run.started||null};
    // model, segment_id and wall_time_s arrive with supabase/strava/001_segments.sql. They are left
    // out while null so a database without that migration still accepts the row.
    for(const key of ['model','segment_id','wall_time_s']) if(base[key]==null) delete base[key];
    const coach={claims:run.claims??null,claims_verified:run.claims_verified??null,artifacts_produced:run.artifacts_produced??null,
      reach:run.reach??null,
      coach_verdict:run.coach_verdict??null,coach_plan:run.coach_plan??null,coach_tool_calls:run.coach_tool_calls??null,
      coach_mode:run.coach_mode??null,
      progress_verdict:run.progress_verdict??null};
    // Persist the measurement reference whenever the export carries one, even on schema 0,
    // so a later retry can find this row. Other schema-1 fields stay gated on version.
    if(run.measurement_revision!=null) coach.measurement_revision=run.measurement_revision;
    if(run.baseline_revision!=null) coach.baseline_revision=run.baseline_revision;
    if(run.schema_version===1) Object.assign(coach,{schema_version:1,trace_basis:run.trace_basis||null,route:run.route||null,
      progress_delta:run.progress_delta??null});
    // The ridge columns (supabase/strava/003_ridge_persistence.sql). No silent fallback: a database
    // without them must fail the save loudly, not save a run with its ridge removed.
    if(run.ridge) Object.assign(coach,{ridge:run.ridge,ridge_basis:run.ridge_basis||null,
      ridge_wall_seconds:run.ridge_wall_seconds??null,worker_bins:run.worker_bins||null,
      commit_bins:run.commit_bins||null,ridge_tool_calls:run.ridge_tool_calls??null});
    // Declared outcome receipts (migration 008) and recorded usage. The preview already showed them.
    for(const key of ['repo_url','receipts','shipped','artifact_url','code_route','capture_metadata'])
      if(run[key]!=null) coach[key]=run[key];
    // A repository link is an https address or nothing; the caller has already checked it.
    if(repo) coach.repo_url=repo; else delete coach.repo_url;
    return {...base,...coach};
  }
  const api={build};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.StriveImportRow=api;
})(typeof window==='object'?window:globalThis);

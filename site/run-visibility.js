/* An audience change succeeds only after the owner row is returned and read back. */
(function(root){
'use strict';
async function save({client,id,owner,audience,patch={},isCurrent=()=>true}){
 if(!['private','public','link','close_friends'].includes(audience)||!owner)throw Error('Choose who can view this update.');
 const current=()=>{if(!isCurrent())throw Error('The account or page changed. Open the saved update again.');};
 current();
 const {data,error}=await client.from('runs').update({...patch,visibility:audience}).eq('id',id).eq('profile_id',owner).select('id,visibility').single();
 current();if(error)throw Error('Changes were not confirmed. '+(error.message||'Try again.'));
 if(!data||data.id!==id||data.visibility!==audience)throw Error('Visibility was not confirmed. Reload the update before retrying.');
 const check=await client.from('runs').select('id,visibility').eq('id',id).eq('profile_id',owner).single();current();
 if(check.error||check.data?.visibility!==audience)throw Error('Could not confirm the saved visibility. Reload the update before retrying.');
 return check.data;
}
root.StriveRunVisibility={save};if(typeof module!=='undefined')module.exports={save};
})(typeof window!=='undefined'?window:globalThis);

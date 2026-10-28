// Called only after readPublic has authorized the run. Do not cache rows or bytes here.
// Photo bytes depend on metadata, but do not depend on the avatar finishing.
export async function runShareAssets(run,format,{readPublicPhotos,readAvatar,photoSlots,photoData}){
 if(run?.visibility!=='public')return {avatar:null,photoUrls:[]};
 const avatarTask=readAvatar(run);
 const photosTask=(async()=>{
  const photos=await readPublicPhotos(run);
  const screenshots=photos.filter(photo=>photo.role!=='personal');
  const selected=(screenshots.length?screenshots:photos).slice(0,3);
  const slots=photoSlots(run,format,selected.length);
  return (await Promise.all(selected.map((chosen,index)=>photoData(run,chosen,slots[index])))).filter(Boolean);
 })();
 const [avatar,photoUrls]=await Promise.all([avatarTask,photosTask]);
 return {avatar,photoUrls};
}

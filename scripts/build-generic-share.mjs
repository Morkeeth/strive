import {buildOutput} from './build-output.mjs';
import {ImageResponse} from '@vercel/og';
import {writeFile} from 'node:fs/promises';
import {shareFonts} from '../server/share-fonts.mjs';
import {BRAND,TAGLINE} from '../server/brand.mjs';
const node=(type,style,children)=>({type,props:{style,children}});
const tree=node('div',{display:'flex',flexDirection:'column',width:1200,height:630,padding:72,background:'#f8faff',color:'#142038',fontFamily:'IBM Plex Sans',justifyContent:'space-between'},[
 node('div',{display:'flex',fontSize:30,fontWeight:600,color:'#0047ff'},BRAND),
 node('div',{display:'flex',flexDirection:'column',gap:22},[
  node('div',{display:'flex',fontSize:88,fontWeight:600,letterSpacing:-3},TAGLINE),
  node('div',{display:'flex',fontSize:30,color:'#526077'},'Build something. Share your progress.')]),
 node('div',{display:'flex',alignItems:'center',gap:12},[0,1,2,3,4,5,6,7,8].map(i=>node('div',{display:'flex',width:106,height:5,background:i<6?'#0047ff':'#dce5ff'},'')))
]);
await writeFile(buildOutput('share-image.png'),Buffer.from(await new ImageResponse(tree,{width:1200,height:630,fonts:await shareFonts()}).arrayBuffer()));

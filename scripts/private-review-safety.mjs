export function safeReviewUrl(value){
 let url;try{url=new URL(value);}catch{throw Error('Review source must be an HTTPS URL');}
 if(url.protocol!=='https:'||url.username||url.password)throw Error('Review source must be an HTTPS URL');
 return url.href;
}

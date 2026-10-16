/* Small missing APIs only. UUIDs always use the browser's cryptographic RNG. */
(function(root){
 function method(target,name,fn){if(!target[name])Object.defineProperty(target,name,{configurable:true,writable:true,value:fn});}
 method(Object,'hasOwn',function(obj,key){return Object.prototype.hasOwnProperty.call(obj,key);});
 method(Array.prototype,'at',function(index){var n=Math.trunc(Number(index)||0),i=n<0?this.length+n:n;return i<0||i>=this.length?undefined:this[i];});
 method(String.prototype,'at',function(index){var n=Math.trunc(Number(index)||0),i=n<0?this.length+n:n;return i<0||i>=this.length?undefined:this.charAt(i);});
 method(String.prototype,'replaceAll',function(search,replacement){
  if(search instanceof RegExp){if(!search.global)throw new TypeError('replaceAll requires a global RegExp');return this.replace(search,replacement);}
  var escaped=String(search).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return this.replace(new RegExp(escaped,'g'),replacement);
 });
 if(root.crypto&&!root.crypto.randomUUID)method(root.crypto,'randomUUID',function(){
  var bytes=new Uint8Array(16);root.crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  var hex=Array.from(bytes,function(b){return b.toString(16).padStart(2,'0');}).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
 });
 // Chrome 80 has replaceWith/append, but not replaceChildren (Chrome 86).
 [root.Element,root.Document,root.DocumentFragment].forEach(function(Type){if(Type)method(Type.prototype,'replaceChildren',function(){while(this.firstChild)this.removeChild(this.firstChild);this.append.apply(this,arguments);});});
})(typeof window==='object'?window:globalThis);

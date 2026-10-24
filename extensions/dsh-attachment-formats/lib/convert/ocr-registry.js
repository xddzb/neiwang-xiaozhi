// Offline deployment fork: cloud providers are not imported or called.
import {ocrPages} from './ocr.js';
export async function runOcrChain(rendered,policy,ctx,hooks={}) {
 if(!rendered.pages.length||policy.ocr==='off')return null;
 const result=await ocrPages(rendered.pages,{onPage:hooks.onPage});
 return {...result,engine:'tesseract-js',note:'离线 OCR（本地中英文语言包）；请核对原页'};
}

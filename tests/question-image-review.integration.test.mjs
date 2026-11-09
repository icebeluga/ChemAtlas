import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";

const base = process.env.QUESTION_REVIEW_TEST_URL;
const q = (name) => new URL(name, `${base}/`);

function pngFixture() {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (name, data) => { const tag=Buffer.from(name);const length=Buffer.alloc(4);length.writeUInt32BE(data.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,crc]); };
  const header=Buffer.alloc(13);header.writeUInt32BE(12,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
  const pixels=Buffer.concat([Buffer.from([0]),Buffer.from(Array.from({length:12*4},(_,i)=>[30,100,70,255][i%4]))]);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("tEXt",Buffer.from("purpose\0isolated-api-test-png")),chunk("IDAT",deflateSync(pixels)),chunk("IEND",Buffer.alloc(0))]);
}
const pngData = `data:image/png;base64,${pngFixture().toString("base64")}`;
async function call(path, method="GET", body) {
  const response=await fetch(q(path),{method,headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
  const contentType=response.headers.get("content-type")||"";
  return {status:response.status,body:contentType.includes("json")?await response.json():Buffer.from(await response.arrayBuffer()),response};
}
async function savePng(owner, revision, segment=0) {
  const {status,body}=await call("api/admin/question-review","POST",{...owner,revision,segment,dataUrl:pngData});
  assert.equal(status,200,JSON.stringify(body));return body.path;
}
async function saveRecord(owner, review) {
  return call("api/admin/question-review","PUT",{...owner,review});
}

test("question image review persists decisions and invalidates an old approval after regeneration", { skip: !base }, async () => {
  const imagePath=await savePng({questionId:"frq-2005-1-6"},"it-rev1");
  const pending={status:"pending_review",imageRevision:"it-rev1",sourceRegionsRevision:"it-rev1",imagePaths:[imagePath],reviewedAt:null,rejectionReasons:[],notes:"",history:[]};
  assert.equal((await saveRecord({questionId:"frq-2005-1-6"},pending)).status,200);
  const accepted={...pending,status:"accepted",reviewedAt:new Date().toISOString(),history:[{revision:1,at:new Date().toISOString(),status:"accepted",regions:[],note:"Test approval"}]};
  assert.equal((await saveRecord({questionId:"frq-2005-1-6"},accepted)).status,200);
  let state=await call("api/admin/question-review");
  assert.equal(state.body.manifest.reviews["frq-2005-1-6"].status,"accepted");
  const image=await call(imagePath);
  assert.equal(image.status,200);assert.equal(image.body[0],137);
  const nextPath=await savePng({questionId:"frq-2005-1-6"},"it-rev2");
  const corrected={...accepted,status:"corrected_pending_review",imageRevision:"it-rev2",imagePaths:[nextPath],reviewedAt:null};
  assert.equal((await saveRecord({questionId:"frq-2005-1-6"},corrected)).status,200);
  state=await call("api/admin/question-review");
  assert.equal(state.body.manifest.reviews["frq-2005-1-6"].status,"corrected_pending_review");
});

test("an MCQ with shared context cannot be accepted until that stimulus is accepted", { skip: !base }, async () => {
  const catalog=JSON.parse(await readFile(new URL("../public/questions.json",import.meta.url),"utf8"));
  const mcq=catalog.questions.find((item)=>item.type==="MCQ"&&item.stimulusIds?.length);
  assert.ok(mcq,"fixture needs an explicitly linked shared-stimulus MCQ");
  const stimulusId=mcq.stimulusIds[0];
  const qImage=await savePng({questionId:mcq.id},"it-shared-q");
  const qPending={status:"pending_review",imageRevision:"it-shared-q",sourceRegionsRevision:"it-shared-q",imagePaths:[qImage],reviewedAt:null,rejectionReasons:[],notes:"",history:[]};
  assert.equal((await saveRecord({questionId:mcq.id},qPending)).status,200);
  const qAccepted={...qPending,status:"accepted",reviewedAt:new Date().toISOString()};
  assert.equal((await saveRecord({questionId:mcq.id},qAccepted)).status,409);
  const sImage=await savePng({stimulusId},"it-shared-stim");
  const sReview={status:"pending_review",imageRevision:"it-shared-stim",sourceRegionsRevision:"it-shared-stim",imagePaths:[sImage],reviewedAt:null,rejectionReasons:[],notes:"",history:[]};
  assert.equal((await saveRecord({stimulusId},sReview)).status,200);
  const sAccepted={...sReview,status:"accepted",reviewedAt:new Date().toISOString()};
  assert.equal((await saveRecord({stimulusId},sAccepted)).status,200);
  assert.equal((await saveRecord({questionId:mcq.id},qAccepted)).status,200);
});

test("reject requires a reason and unknown catalog IDs are refused", { skip: !base }, async () => {
  const imagePath=await savePng({questionId:"frq-2005-1-6"},"it-reject");
  const invalid={status:"rejected",imageRevision:"it-reject",sourceRegionsRevision:"it-reject",imagePaths:[imagePath],reviewedAt:new Date().toISOString(),rejectionReasons:[],notes:"",history:[]};
  assert.equal((await saveRecord({questionId:"frq-2005-1-6"},invalid)).status,400);
  assert.equal((await saveRecord({questionId:"not-a-real-question"},invalid)).status,404);
});

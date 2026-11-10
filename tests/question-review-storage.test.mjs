import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFileReviewStore, createD1ReviewStore, createR2ImageStore } from "../lib/question-review-storage.mjs";
import { authenticateReviewRequest, clearAccessKeyCacheForTests } from "../lib/cloudflare-access.mjs";

const png = Uint8Array.from([137,80,78,71,13,10,26,10,...Array(100).fill(7)]);
const accepted = (regions = [{ page: 1, rect: [0, 0, 10, 10] }]) => ({ status: "accepted", imageRevision: "r1", sourceRegionsRevision: "r1", imagePaths: ["/api/admin/question-review/image/q1/r1-segment-1.png"], reviewedAt: "2026-11-10T00:00:00.000Z", rejectionReasons: [], notes: "", history: [{ revision: 1, at: "2026-11-10T00:00:00.000Z", status: "accepted", regions, note: "checked" }], cropOverrides: regions });

class MemoryD1 {
  records = new Map(); history = []; crops = new Map(); links = new Set(); images = new Map();
  prepare(sql) {
    const state = { records: this.records, history: this.history, crops: this.crops, links: this.links, images: this.images };
    const statement = { args: [], bind(...args) { this.args = args; return this; }, async run() {
      const a = this.args;
      if (sql.includes("DELETE FROM review_records")) { for (const [key, row] of state.records) if (row.owner_id===a[0]) state.records.delete(key); }
      else if (sql.includes("DELETE FROM stimulus_links") && sql.includes("question_id = ?")) { for (const key of [...state.links]) if (key.startsWith(`${a[0]}|${a[1]}|`)) state.links.delete(key); }
      else if (sql.includes("DELETE FROM stimulus_links")) { for (const key of [...state.links]) if (key.startsWith(`${a[0]}|`)) state.links.delete(key); }
      else if (sql.includes("DELETE FROM review_history")) { const kept=state.history.filter(row => row[0]!==a[0]);state.history.splice(0,state.history.length,...kept); }
      else if (sql.includes("DELETE FROM crop_revisions")) { for (const key of [...state.crops.keys()]) if (key.startsWith(`${a[0]}|`)) state.crops.delete(key); }
      else if (sql.includes("DELETE FROM image_objects")) { for (const key of [...state.images.keys()]) if (key.startsWith(`${a[0]}|`)) state.images.delete(key); }
      else if (sql.includes("INSERT INTO review_records")) state.records.set(`${a[0]}|${a[1]}|${a[2]}`, { owner_id:a[0], entity_type:a[1], entity_id:a[2], status:a[3], payload_json:a[4], updated_at:a[5] });
      else if (sql.includes("INSERT INTO review_history")) state.history.push(a);
      else if (sql.includes("crop_revisions")) state.crops.set(`${a[0]}|${a[1]}|${a[2]}|${a[3]}`, a);
      else if (sql.includes("INSERT OR IGNORE INTO stimulus_links") || sql.includes("INSERT INTO stimulus_links")) state.links.add(`${a[0]}|${a[1]}|${a[2]}`);
      else if (sql.includes("INSERT INTO image_objects")) state.images.set(`${a[0]}|${a[1]}|${a[2]}|${a[3]}|${a[4]}`, { object_key:a[5], byte_length:a[6], sha256:a[7] });
      return { success: true };
    }, async all() {
      const a = this.args;
      if (sql.includes("SELECT entity_type, entity_id, payload_json")) return { results:[...state.records.values()].filter((r)=>r.owner_id===a[0]) };
      if (sql.includes("SELECT question_id, stimulus_id")) return { results:[...state.links].filter((key)=>key.startsWith(`${a[0]}|`)).map((key)=>{const [,question_id,stimulus_id]=key.split("|");return {question_id,stimulus_id}}) };
      if (sql.includes("SELECT entity_type, entity_id, revision, segment, object_key")) return { results:[...state.images].filter(([key])=>key.startsWith(`${a[0]}|`)).map(([key,value])=>{const [,entity_type,entity_id,revision,segment]=key.split("|");return {entity_type,entity_id,revision,segment:Number(segment),object_key:value.object_key,byte_length:value.byte_length,sha256:value.sha256,mime_type:"image/png",created_at:"2026-11-10T00:00:00.000Z"}}) };
      if (sql.includes("SELECT entity_type, entity_id, revision, event_json")) return { results:state.history.filter(row=>row[0]===a[0]).map(row=>({entity_type:row[1],entity_id:row[2],revision:row[3],event_json:row[4],created_at:row[5]})) };
      if (sql.includes("SELECT entity_type, entity_id, revision, crop_json")) return { results:[...state.crops.values()].filter(row=>row[0]===a[0]).map(row=>({entity_type:row[1],entity_id:row[2],revision:row[3],crop_json:row[4],created_at:row[6],notes:row[7]})) };
      if (sql.includes("SELECT entity_type, entity_id, updated_at")) return { results:[...state.records.values()].filter(r=>r.owner_id===a[0]).map(r=>({entity_type:r.entity_type,entity_id:r.entity_id,updated_at:r.updated_at})) };
      if (sql.includes("SELECT stimulus_id")) return { results:[...state.links].filter((key)=>key.startsWith(`${a[0]}|${a[1]}|`)).map((key)=>({stimulus_id:key.split("|")[2]})) };
      return { results:[] };
    }, async first() {
      const a=this.args;
      if (sql.includes("SELECT MAX(updated_at)")) return { updated_at:[...state.records.values()].filter((r)=>r.owner_id===a[0]).map((r)=>r.updated_at).sort().at(-1)||null };
      if (sql.includes("SELECT payload_json FROM review_records")) return state.records.get(`${a[0]}|${a[1]}|${a[2]}`)||null;
      if (sql.includes("SELECT object_key")) return state.images.get(`${a[0]}|${a[1]}|${a[2]}|${a[3]}|${a[4]}`)||null;
      return null;
    } };
    return statement;
  }
  async batch(statements) { for (const statement of statements) await statement.run(); return []; }
}

class MemoryR2 {
  data = new Map();
  async get(key) { const value=this.data.get(key);return value?{customMetadata:value.metadata,size:value.bytes.length,body:new Blob([value.bytes]).stream(),arrayBuffer:async()=>value.bytes.buffer.slice(value.bytes.byteOffset,value.bytes.byteOffset+value.bytes.byteLength)}:null; }
  async head(key) { const value=this.data.get(key);return value?{customMetadata:value.metadata,size:value.bytes.length}:null; }
  async put(key, bytes, options) { this.data.set(key,{bytes:new Uint8Array(bytes),metadata:options.customMetadata}); }
  async list({prefix}) { return { objects:[...this.data.keys()].filter((key)=>key.startsWith(prefix)).map((key)=>({key})), truncated:false }; }
}

test("file adapter keeps local review state and images across adapter recreation", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"chematlas-review-"));
  try {
    const config={manifestPath:path.join(root,"manifest.json"),imageRoot:path.join(root,"images")};
    const first=createFileReviewStore(config);
    await first.saveManifest({schemaVersion:1,updatedAt:null,reviews:{q1:accepted()},stimuli:{}});
    await first.putImage({entityType:"question",entityId:"q1",revision:"r1",segment:0,bytes:png});
    const restarted=createFileReviewStore(config);
    assert.equal((await restarted.readManifest()).reviews.q1.status,"accepted");
    assert.deepEqual(await restarted.getImage({entityType:"question",entityId:"q1",filename:"r1-segment-1.png"}),png);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("D1 adapter persists accept/reject, history, crop revisions and stimulus associations across adapter recreation", async () => {
  const db=new MemoryD1(); const ownerId="owner-1";
  let store=createD1ReviewStore(db);
  const approve=accepted();
  await store.saveRecord({ownerId,entityType:"question",entityId:"q1",review:approve,cropRevision:{revision:"r1",regions:approve.cropOverrides},linkedStimuli:["stim-1"]});
  const rejection={...approve,status:"rejected",rejectionReasons:["Question stem cut off"],history:[...approve.history,{revision:2,at:"2026-11-10T01:00:00.000Z",status:"rejected",regions:approve.cropOverrides,note:"cut off"}]};
  await store.saveRecord({ownerId,entityType:"stimulus",entityId:"stim-1",review:rejection});
  store=createD1ReviewStore(db); // new storage adapter, same durable D1 database
  const saved=await store.readManifest(ownerId);
  assert.equal(saved.reviews.q1.status,"accepted");
  assert.equal(saved.stimuli["stim-1"].rejectionReasons[0],"Question stem cut off");
  assert.deepEqual(await store.getStimulusLinks(ownerId,"q1"),["stim-1"]);
  assert.equal(db.history.length,3);
  assert.equal(db.crops.size,1);
});

test("D1 backup restore batches records and retains question-stimulus associations", async () => {
  const db=new MemoryD1(); const ownerId="restore-owner"; const review=accepted();
  await createD1ReviewStore(db).saveManifest(ownerId,{schemaVersion:1,updatedAt:null,reviews:{q1:review},stimuli:{stim1:review},stimulusLinks:{q1:["stim1"]}});
  const restored=await createD1ReviewStore(db).readManifest(ownerId);
  assert.equal(restored.reviews.q1.status,"accepted");
  assert.deepEqual(restored.stimulusLinks.q1,["stim1"]);
  assert.equal(restored.stimuli.stim1.status,"accepted");
});

test("D1 restoreSnapshot replaces the owner snapshot atomically with image, history, crop and association metadata", async () => {
  const db=new MemoryD1(); const ownerId="snapshot-owner";
  const store=createD1ReviewStore(db);
  await store.saveRecord({ownerId,entityType:"question",entityId:"old-q",review:{...accepted(),status:"accepted"}});
  const pending={status:"pending_review",imageRevision:"r2",sourceRegionsRevision:"r2",imagePaths:["/api/admin/question-review/image/q1/r2-segment-1.png"],reviewedAt:null,rejectionReasons:[],notes:"baseline",history:[],cropOverrides:[{page:1,rect:[1,2,30,40]}]};
  const snapshot={schemaVersion:1,updatedAt:"2026-11-10T02:00:00.000Z",reviews:{q1:pending},stimuli:{},stimulusLinks:{q1:["stim-1"]}};
  const recovery={
    images:[{entity_type:"question",entity_id:"q1",revision:"r2",segment:1,object_key:"owners/snapshot-owner/question-images/q1/r2-segment-1.png",byte_length:png.length,sha256:"a".repeat(64)}],
    reviewHistory:[{entityType:"question",entityId:"q1",revision:1,event:{revision:1,status:"pending_review",at:"2026-11-10T02:00:00.000Z"},createdAt:"2026-11-10T02:00:00.000Z"}],
    cropRevisions:[{entityType:"question",entityId:"q1",revision:"r2",regions:pending.cropOverrides,createdAt:"2026-11-10T02:00:00.000Z",notes:"verified"}],
    recordTimestamps:[{entityType:"question",entityId:"q1",updatedAt:"2026-11-10T02:00:00.000Z"}],
  };
  const restored=await store.restoreSnapshot(ownerId,snapshot,recovery);
  assert.deepEqual(Object.keys(restored.reviews),["q1"]);
  assert.equal(restored.reviews.q1.status,"pending_review");
  assert.deepEqual(restored.stimulusLinks.q1,["stim-1"]);
  const metadata=await store.readRecoveryMetadata(ownerId);
  assert.equal(metadata.images.length,1);
  assert.equal(metadata.reviewHistory.length,1);
  assert.equal(metadata.cropRevisions.length,1);
  assert.equal(metadata.recordTimestamps[0].updatedAt,"2026-11-10T02:00:00.000Z");
});

test("R2 adapter stores immutable revisions, metadata, shared stimuli, and multi-page segments", async () => {
  const bucket=new MemoryR2(); const store=createR2ImageStore(bucket);
  const saved=await store.putImage({ownerId:"owner-1",entityType:"question",entityId:"q1",revision:"r1",segment:0,bytes:png});
  assert.equal(saved.path,"/api/admin/question-review/image/q1/r1-segment-1.png");
  assert.equal(await store.imageExists({ownerId:"owner-1",entityType:"question",entityId:"q1",revision:"r1",segment:0}),true);
  await store.putImage({ownerId:"owner-1",entityType:"question",entityId:"q1",revision:"r1",segment:1,bytes:png});
  await store.putImage({ownerId:"owner-1",entityType:"stimulus",entityId:"stim-1",revision:"r2",segment:0,bytes:png});
  assert.equal((await store.listImages({ownerId:"owner-1",entityType:"question",entityId:"q1"})).length,2);
  assert.equal((await store.listAll("owner-1")).length,3);
  await assert.rejects(()=>store.putImage({ownerId:"owner-1",entityType:"question",entityId:"q1",revision:"r1",segment:0,bytes:Uint8Array.from([...png,9])}),/different bytes/);
});

test("Cloudflare Access owner verification fails closed and verifies the JWT signature", async () => {
  const pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
  const jwk=await crypto.subtle.exportKey("jwk",pair.publicKey);jwk.kid="test-key";
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({keys:[jwk]});
  clearAccessKeyCacheForTests();
  const env={CHEMATLAS_REVIEW_OWNER_EMAIL:"owner@example.com",CF_ACCESS_TEAM_DOMAIN:"example.cloudflareaccess.com",CF_ACCESS_AUD:"audience-123"};
  const makeToken=async(email)=>{
    const encode=(value)=>btoa(JSON.stringify(value)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
    const h=encode({alg:"RS256",kid:"test-key",typ:"JWT"});const p=encode({iss:"https://example.cloudflareaccess.com",aud:["audience-123"],sub:"user-1",email,exp:Math.floor(Date.now()/1000)+300});
    const sign=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(`${h}.${p}`));
    const sig=btoa(String.fromCharCode(...new Uint8Array(sign))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");return `${h}.${p}.${sig}`;
  };
  try {
    const owner=await authenticateReviewRequest(new Request("https://private.test",{headers:{"cf-access-jwt-assertion":await makeToken("OWNER@example.com")}}),env);
    assert.equal(owner.ok,true);
    const stranger=await authenticateReviewRequest(new Request("https://private.test",{headers:{"cf-access-jwt-assertion":await makeToken("student@example.com")}}),env);
    assert.equal(stranger.status,403);
    const unconfigured=await authenticateReviewRequest(new Request("https://private.test"),{});
    assert.equal(unconfigured.status,503);
  } finally { globalThis.fetch=previousFetch;clearAccessKeyCacheForTests(); }
});

import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {isTestProject} from '../api/_database-environment.js';

const fail = (message, status=400) => Object.assign(Error(message), {status});
const text = value => typeof value === 'string' ? value : '';
// Preview/Test may only use separately configured test credentials, never Main's.
export function whatsappHistoryConfig(env=process.env, test=isTestProject()) {
  const prefix=test?'VECTA_TEST_':'';
  const get=key=>env[prefix+'WHATSAPP_'+key];
  const config={phoneId:get('PHONE_NUMBER_ID'),accountId:get('BUSINESS_ACCOUNT_ID'),secret:get('APP_SECRET'),verifyToken:get('WEBHOOK_VERIFY_TOKEN')};
  return /^\d+$/.test(config.phoneId||'') && /^\d+$/.test(config.accountId||'') && config.secret && config.verifyToken ? config : null;
}
export function constantEqual(a,b) {
  const left=Buffer.from(text(a)),right=Buffer.from(text(b));
  return left.length>0 && left.length===right.length && timingSafeEqual(left,right);
}
export function validSignature(raw, signature, secret) {
  return /^sha256=[a-f0-9]{64}$/.test(signature||'') && constantEqual(signature,'sha256='+createHmac('sha256',secret).update(raw).digest('hex'));
}
export async function rawWebhookBody(request) {
  const max=4*1024*1024;
  if(Number(request.headers.get('content-length'))>max)throw fail('Payload too large.',413);
  const chunks=[];let size=0;
  // Web-standard Request avoids Vercel's legacy JSON body helper entirely.
  if(request.body)for await(const chunk of request.body){
    const bytes=Buffer.from(chunk);size+=bytes.length;
    if(size>max)throw fail('Payload too large.',413);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function messageBody(message) {
  const type=text(message?.type),data=message?.[type]||{};
  if(type==='text')return text(data.body);
  if(type==='button')return text(data.text);
  if(type==='interactive')return text(data.button_reply?.title)||text(data.list_reply?.title)||'[Interactive message — open WhatsApp to view]';
  if(type==='reaction')return data.emoji?'Reaction: '+text(data.emoji):'[Reaction removed]';
  const names={image:'Photo',video:'Video',audio:'Voice/audio message',document:'Document',sticker:'Sticker',location:'Location',contacts:'Contact',order:'Order'};
  return '['+(names[type]||'Message')+' — open WhatsApp to view]'+(text(data.caption)?'\n'+data.caption:'');
}
export function whatsappEvents(payload,config) {
  if(payload?.object!=='whatsapp_business_account'||!Array.isArray(payload.entry))throw fail('Invalid WhatsApp payload.');
  const rows=new Map();
  for(const entry of payload.entry){
    if(entry.id!==config.accountId)continue;
    for(const change of entry.changes||[]){
      const value=change.value;
      if(value?.messaging_product!=='whatsapp'||value.metadata?.phone_number_id!==config.phoneId)continue;
      const outgoing=change.field==='smb_message_echoes';
      if(!outgoing&&change.field!=='messages')continue;
      const messages=outgoing?value.message_echoes:value.messages;
      if(messages===undefined)continue; // delivery-status callbacks contain no message text
      if(!Array.isArray(messages))throw fail('Invalid WhatsApp messages.');
      for(const message of messages){
        const providerId=text(message.id),type=text(message.type),timestamp=Number(message.timestamp)*1000;
        if(!providerId||providerId.length>500||!type||!Number.isFinite(timestamp)||timestamp<Date.parse('2020-01-01')||timestamp>Date.now()+300000)throw fail('Invalid WhatsApp message.');
        const eventType=['edit','revoke'].includes(type)?type:'message';
        const originalId=eventType==='message'?'':text(message[type]?.original_message_id);
        if(eventType!=='message'&&(!originalId||originalId.length>500))throw fail('Invalid WhatsApp change.');
        const sender=text(message.from)||text(message.from_user_id);
        const recipient=outgoing?(text(message.to)||text(message.to_user_id)):text(value.metadata.display_phone_number);
        if(!sender||!recipient||sender.length>200||recipient.length>200)throw fail('Invalid WhatsApp contact.');
        const body=eventType==='revoke'?'[Deleted in WhatsApp]':(eventType==='edit'?'[Edited in WhatsApp]\n':'')+messageBody(eventType==='edit'?message.edit.message:message);
        if(body.length>30000)throw fail('WhatsApp message too long.');
        const id=createHash('sha256').update(JSON.stringify([config.phoneId,providerId,eventType,originalId])).digest('hex');
        rows.set(id,{id,phone_number_id:config.phoneId,provider_message_id:providerId,original_message_id:originalId,event_type:eventType,
          occurred_at:new Date(timestamp).toISOString(),direction:outgoing?'outgoing':'incoming',sender,recipient,body});
      }
    }
  }
  return [...rows.values()];
}

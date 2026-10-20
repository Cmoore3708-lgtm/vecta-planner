// Open only an explicitly labelled Enquiry control, never a positional icon.
export async function ensureEnquiry(page) {
 const size=page.locator('#key1');
 if(await size.count()===1 && await size.isVisible())return;
 const candidates=[
  page.getByRole('tab',{name:/\benquiry\b/i}),
  page.getByRole('button',{name:/\benquiry\b/i}),
  page.getByRole('link',{name:/\benquiry\b/i}),
  page.getByRole('img',{name:/\benquiry\b/i}),
  page.locator('[title="Enquiry"], [title="enquiry"]')
 ];
 for(const candidate of candidates){
  const visible=candidate.filter({visible:true});
  if(await visible.count()!==1)continue;
  await visible.click();
  await size.waitFor({state:'visible',timeout:10000});
  return;
 }
 throw Error('ESP_ENQUIRY_TAB_NOT_IDENTIFIED');
}

// Existing manual launches retain their confirmation. Managed launches proceed
// only when the actual supplier session and pricing settings already verify.
export async function prepareTyreStartup({managed, verify, confirm}) {
  if(managed){try{await verify();return;}catch{}}
  await confirm();
  await verify();
}

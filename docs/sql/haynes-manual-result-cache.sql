-- Preserve current deployed relay logic; stop caching instructions as successful data.
-- Applies to the isolated Haynes relay project brqsejjykrubxuofavuu only.
do $patch$
declare definition text; needle text := $needle$status='MATCHED' and created_at>now()-interval '2 hours'$needle$;
begin
 definition := pg_get_functiondef('public.haynes_service_relay(text,jsonb,text)'::regprocedure);
 if position($needle$coalesce(result->>'kind','') <> 'manual_step'$needle$ in definition)>0 then return; end if;
 if length(definition)-length(replace(definition,needle,''))<>length(needle) then raise exception 'Unexpected relay definition; refusing patch'; end if;
 execute replace(definition,needle,$replacement$status='MATCHED' and coalesce(result->>'kind','') <> 'manual_step' and created_at>now()-interval '2 hours'$replacement$);
end $patch$;

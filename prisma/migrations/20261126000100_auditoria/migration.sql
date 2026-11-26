-- Log de auditoria: uma linha por escrita de negócio, gravada na mesma transação da escrita. Só INSERT.
-- actor_user_id fica SEM chave estrangeira de propósito: o log sobrevive à exclusão do usuário, e o e-mail é copiado
-- no momento da ação.

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
    actor_user_id BIGINT NOT NULL,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL CHECK (length(btrim(action)) > 0),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'promotion', 'user')),
    entity_id BIGINT NULL,
    changes JSONB NOT NULL DEFAULT '{}',
    ip INET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_actor_idx ON audit_logs (restaurant_id, actor_user_id, created_at DESC);

-- Usuários, tokens de redefinição de senha (só o hash SHA-256) e registro dos pedidos para o limite de 429.

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    email TEXT NOT NULL CONSTRAINT users_email_key UNIQUE CHECK (email = lower(email)),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_restaurant_idx ON users (restaurant_id);

CREATE TABLE password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX password_reset_tokens_hash_key ON password_reset_tokens (token_hash);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);

CREATE TABLE password_reset_requests (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    ip TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX password_reset_requests_email_idx ON password_reset_requests (email, requested_at);
CREATE INDEX password_reset_requests_ip_idx ON password_reset_requests (ip, requested_at);

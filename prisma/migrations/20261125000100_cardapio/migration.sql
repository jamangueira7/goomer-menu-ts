-- Esquema inicial, escrito à mão: restaurantes, produtos (ENUM de categoria), disponibilidade e promoções com
-- EXCLUDE USING gist impedindo janelas sobrepostas do mesmo produto no mesmo dia.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE product_category AS ENUM ('entradas', 'pratos_principais', 'sobremesas', 'bebidas');

-- Minutos desde a meia-noite, IMMUTABLE para poder entrar no índice do EXCLUDE.
CREATE FUNCTION minute_of_day(t time) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN (EXTRACT(HOUR FROM t) * 60 + EXTRACT(MINUTE FROM t))::integer;

CREATE TABLE restaurants (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    category product_category NOT NULL,
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX products_menu_idx ON products (restaurant_id, visible, category, position);

CREATE TABLE product_availability (
    product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TIME(0) NOT NULL CHECK (minute_of_day(start_time) % 15 = 0),
    end_time TIME(0) NOT NULL CHECK (minute_of_day(end_time) % 15 = 0),
    PRIMARY KEY (product_id, weekday, start_time),
    CONSTRAINT product_availability_min_15 CHECK (end_time - start_time >= INTERVAL '15 minutes')
);

CREATE TABLE promotions (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 255),
    promo_price_cents INTEGER NOT NULL CHECK (promo_price_cents > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT promotions_id_product_key UNIQUE (id, product_id)
);

CREATE INDEX promotions_product_idx ON promotions (product_id);

-- product_id repetido aqui é o que deixa o Postgres comparar janelas de promoções diferentes do mesmo produto.
CREATE TABLE promotion_windows (
    promotion_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TIME(0) NOT NULL CHECK (minute_of_day(start_time) % 15 = 0),
    end_time TIME(0) NOT NULL CHECK (minute_of_day(end_time) % 15 = 0),
    PRIMARY KEY (promotion_id, weekday, start_time),
    CONSTRAINT promotion_windows_promotion_fk FOREIGN KEY (promotion_id, product_id)
        REFERENCES promotions (id, product_id) ON DELETE CASCADE,
    CONSTRAINT promotion_windows_min_15 CHECK (end_time - start_time >= INTERVAL '15 minutes'),
    CONSTRAINT promotion_windows_no_overlap EXCLUDE USING gist (
        product_id WITH =,
        weekday WITH =,
        int4range(minute_of_day(start_time), minute_of_day(end_time)) WITH &&
    )
);

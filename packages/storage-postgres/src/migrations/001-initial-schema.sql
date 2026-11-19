-- Initial schema for StellarBooks append-only journal (ADR-0006)

-- 1. Tables
CREATE TABLE IF NOT EXISTS book (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    network TEXT NOT NULL,
    functional_currency TEXT NOT NULL DEFAULT 'native',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_account (
    id SERIAL PRIMARY KEY,
    book_id INT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
    parent_code TEXT,
    UNIQUE (book_id, code)
);

CREATE TABLE IF NOT EXISTS asset (
    id TEXT PRIMARY KEY,
    scale INT NOT NULL DEFAULT 7,
    label TEXT
);

CREATE TABLE IF NOT EXISTS economic_event (
    id BIGSERIAL PRIMARY KEY,
    book_id INT NOT NULL REFERENCES book(id),
    source_key TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_entry (
    id BIGSERIAL PRIMARY KEY,
    book_id INT NOT NULL REFERENCES book(id),
    posting_key TEXT NOT NULL UNIQUE,
    source_key TEXT NOT NULL,
    entry_date TIMESTAMPTZ NOT NULL,
    description TEXT NOT NULL,
    rule_id TEXT,
    rule_set_version TEXT,
    reverses_entry_id BIGINT REFERENCES journal_entry(id),
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_line (
    id BIGSERIAL PRIMARY KEY,
    entry_id BIGINT NOT NULL REFERENCES journal_entry(id) ON DELETE CASCADE,
    account_code TEXT NOT NULL,
    asset_id TEXT NOT NULL REFERENCES asset(id),
    units NUMERIC(39, 0) NOT NULL CHECK (units != 0),
    wallet TEXT,
    counterparty TEXT,
    note TEXT
);

CREATE TABLE IF NOT EXISTS source_checkpoint (
    id SERIAL PRIMARY KEY,
    book_id INT NOT NULL REFERENCES book(id) UNIQUE,
    last_ledger INT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_quote (
    id BIGSERIAL PRIMARY KEY,
    base_asset TEXT NOT NULL,
    quote_asset TEXT NOT NULL,
    rate NUMERIC NOT NULL,
    source_name TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS period (
    id SERIAL PRIMARY KEY,
    book_id INT NOT NULL REFERENCES book(id),
    name TEXT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reconciliation_run (
    id BIGSERIAL PRIMARY KEY,
    book_id INT NOT NULL REFERENCES book(id),
    ledger_sequence INT NOT NULL,
    run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    passed BOOLEAN NOT NULL,
    details JSONB NOT NULL
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_journal_entry_book_date ON journal_entry(book_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_line_entry_id ON journal_line(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_line_account ON journal_line(account_code);
CREATE INDEX IF NOT EXISTS idx_journal_line_wallet ON journal_line(wallet);

-- 3. Triggers & Functions
-- Append-only trigger (rejects UPDATE and DELETE)
CREATE OR REPLACE FUNCTION forbid_modification() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Table % is append-only: updates and deletes are forbidden', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_append_only_entry ON journal_entry;
CREATE TRIGGER trg_append_only_entry
BEFORE UPDATE OR DELETE ON journal_entry
FOR EACH ROW EXECUTE FUNCTION forbid_modification();

DROP TRIGGER IF EXISTS trg_append_only_line ON journal_line;
CREATE TRIGGER trg_append_only_line
BEFORE UPDATE OR DELETE ON journal_line
FOR EACH ROW EXECUTE FUNCTION forbid_modification();

DROP TRIGGER IF EXISTS trg_append_only_event ON economic_event;
CREATE TRIGGER trg_append_only_event
BEFORE UPDATE OR DELETE ON economic_event
FOR EACH ROW EXECUTE FUNCTION forbid_modification();

-- Deferred balancing check trigger
CREATE OR REPLACE FUNCTION check_entry_balance() RETURNS TRIGGER AS $$
DECLARE
    unbalanced RECORD;
BEGIN
    FOR unbalanced IN
        SELECT asset_id, SUM(units) as net
        FROM journal_line
        WHERE entry_id = NEW.entry_id
        GROUP BY asset_id
        HAVING SUM(units) != 0
    LOOP
        RAISE EXCEPTION 'Journal entry % does not balance for asset %: net delta is %',
            NEW.entry_id, unbalanced.asset_id, unbalanced.net;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_entry_balance ON journal_line;
CREATE CONSTRAINT TRIGGER trg_check_entry_balance
AFTER INSERT ON journal_line
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_entry_balance();

ALTER TABLE journal_entry ADD COLUMN IF NOT EXISTS source_position JSONB;
ALTER TABLE journal_entry ADD COLUMN IF NOT EXISTS posting_transaction XID8;

CREATE OR REPLACE FUNCTION stamp_journal_posting_transaction() RETURNS TRIGGER AS $$
BEGIN
    NEW.posting_transaction := pg_current_xact_id();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stamp_journal_posting ON journal_entry;
CREATE TRIGGER trg_stamp_journal_posting BEFORE INSERT ON journal_entry
FOR EACH ROW EXECUTE FUNCTION stamp_journal_posting_transaction();

CREATE OR REPLACE FUNCTION require_open_journal_entry() RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM journal_entry
        WHERE id = NEW.entry_id AND posting_transaction = pg_current_xact_id()
    ) THEN
        RAISE EXCEPTION 'Journal entry % is sealed or missing', NEW.entry_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_require_open_journal_entry ON journal_line;
CREATE TRIGGER trg_require_open_journal_entry BEFORE INSERT ON journal_line
FOR EACH ROW EXECUTE FUNCTION require_open_journal_entry();

CREATE OR REPLACE FUNCTION require_journal_lines() RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM journal_line WHERE entry_id = NEW.id) < 2 THEN
        RAISE EXCEPTION 'Journal entry % must contain at least two lines', NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_require_journal_lines ON journal_entry;
CREATE CONSTRAINT TRIGGER trg_require_journal_lines AFTER INSERT ON journal_entry
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_journal_lines();
